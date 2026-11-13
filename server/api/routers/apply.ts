import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { blockFor, prepareWrite, writesOf } from '@/lib/definitions/apply';
import type { Prepared } from '@/lib/definitions/apply';
import { fingerprintOf } from '@/lib/definitions/fingerprint';
import { namesOf, type KeptRead } from '@/lib/definitions/records';
import type {
  Application,
  DefinitionProcess,
  DefinitionSet,
} from '@/lib/definitions/types';
import { evaluationSchema } from '@/server/operations/brunch-orders-rulebook';
import {
  applyDecisions,
  keptApplication,
  undoApplication,
} from '@/server/storage/applications';
import {
  liveSheet,
  whyNotWritable,
} from '@/server/storage/brunch-orders-reads';
import { rulebookIdSchema } from '@/server/storage/ids';
import { keptProposal } from '@/server/storage/proposals';

import { runFields, runProcedure, staleReply } from '../run-procedure';
import { router } from '../trpc';

/*
  Server-only. Apply, through lib/definitions/apply. `preview` says what the
  decisions would write, from the sheet as it is now; `write` writes them and
  reads them back; `undo` puts the cells back while they still hold what was
  written. Every one is a mutation: each reaches the sheet, and a preview may
  settle a write that was cut short. The client never retries one.
*/

// Apply names the rulebook the run calculated on; there is no run without it.
const run = {
  ...runFields,
  rulebook: rulebookIdSchema,
  evaluation: evaluationSchema,
};
const decided = {
  // The proposal the decisions were made on, which may have been replaced.
  proposedAt: z.string().max(40),
  decisions: z.record(
    z.string().max(80),
    z.object({
      kind: z.enum(['approve', 'change', 'reject']),
      values: z.record(z.string().max(80), z.number()).optional(),
      at: z.string().max(40),
    }),
  ),
};

type Run = {
  owner: DefinitionProcess;
  set: DefinitionSet;
  read: KeptRead;
  published: string;
};

type Shared = {
  tab: string | undefined;
  names: Record<string, string>;
  application: Application | null;
};

// What the decisions write, or why they cannot. Also what a refused write
// answers, so the screen shows why.
const previewOf = (
  shared: Shared,
  notWritable: string | null,
  prepared: Pick<
    Prepared,
    'tabExists' | 'changes' | 'problems' | 'newlyFailing'
  >,
) => ({
  kind: 'preview' as const,
  ...shared,
  notWritable,
  tabExists: prepared.tabExists,
  changes: prepared.changes,
  problems: prepared.problems,
  newlyFailing: prepared.newlyFailing,
});

// What a preview and a write begin the same way: the proposal the decisions
// were made on, and what is already kept of a write for it.
async function opened(
  { owner, set, read, published }: Run,
  input: { text: string; proposedAt: string },
) {
  const fingerprint = fingerprintOf(set);
  const cannotReach = whyNotWritable(read);
  // An earlier version's rules may lack ones added since, so it cannot write.
  const notWritable =
    input.text === published
      ? cannotReach
      : 'This run answers to an earlier version of the instructions. Start a new run to write to the sheet.';
  const proposal = await keptProposal(owner, read.id, fingerprint);
  if (!proposal) throw new Error('This run has no proposal kept.');
  if (proposal.at !== input.proposedAt)
    throw new Error(
      'These decisions were made on an earlier proposal. Decide on the current one.',
    );
  // A write cut short is settled from the sheet where it can be reached,
  // and shown as not yet confirmed where it cannot.
  const application = await keptApplication(
    owner,
    read.id,
    fingerprint,
    cannotReach ? undefined : liveSheet,
  );
  const shared: Shared = {
    tab: owner.subject.data.output?.tab,
    names: namesOf(read, owner.subject.data),
    application,
  };
  return { fingerprint, notWritable, proposal, shared };
}

export const applyRouter = router({
  preview: runProcedure(z.strictObject({ ...run, ...decided })).mutation(
    async ({ ctx, input }) => {
      if (ctx.stale) return staleReply(ctx.stale);
      const { notWritable, proposal, shared } = await opened(ctx, input);
      if (notWritable)
        return previewOf(shared, notWritable, {
          // Nothing was asked of the sheet, so every cell reads as new.
          tabExists: false,
          changes: blockFor([], ctx.owner, writesOf(proposal, input.decisions))
            .changes,
          problems: [],
          newlyFailing: [],
        });
      return previewOf(
        shared,
        null,
        await prepareWrite(
          ctx.owner,
          ctx.set,
          ctx.read,
          proposal,
          input.decisions,
          liveSheet,
        ),
      );
    },
  ),

  write: runProcedure(
    z.strictObject({
      ...run,
      ...decided,
      // The checks that newly fail, by id, which a person has seen.
      acknowledged: z.array(z.string().max(200)).max(1000),
    }),
  ).mutation(async ({ ctx, input }) => {
    if (ctx.stale) return staleReply(ctx.stale);
    const { fingerprint, notWritable, proposal, shared } = await opened(
      ctx,
      input,
    );
    if (notWritable) throw new Error(notWritable);
    const outcome = await applyDecisions(
      ctx.owner,
      ctx.set,
      ctx.read,
      fingerprint,
      proposal,
      input.decisions,
      input.acknowledged,
      liveSheet,
    );
    // A refused write answers with what the preview would, so the screen
    // shows why (it was a 409 with the preview as its body).
    return outcome.kind === 'written'
      ? { kind: 'applied' as const, application: outcome.application }
      : previewOf(shared, null, outcome.prepared);
  }),

  undo: runProcedure(z.strictObject(run)).mutation(async ({ ctx }) => {
    if (ctx.stale) return staleReply(ctx.stale);
    // Undo stays open: what was written can be taken back whatever came since.
    const cannotReach = whyNotWritable(ctx.read);
    if (cannotReach) throw new Error(cannotReach);
    const outcome = await undoApplication(
      ctx.owner,
      ctx.read.id,
      fingerprintOf(ctx.set),
      liveSheet,
    );
    if (outcome.kind !== 'undone')
      throw new TRPCError({ code: 'CONFLICT', message: outcome.problem });
    return { kind: 'applied' as const, application: outcome.application };
  }),
});
