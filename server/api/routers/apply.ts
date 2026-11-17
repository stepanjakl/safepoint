import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { blockFor, prepareWrite, writesOf } from '@/lib/engine/apply';
import type { DecisionMade, Prepared } from '@/lib/engine/apply';
import { fingerprintOf } from '@/lib/engine/fingerprint';
import { namesOf, type KeptRead } from '@/lib/engine/records';
import type {
  Application,
  DefinitionProcess,
  DefinitionSet,
  Proposal,
} from '@/lib/engine/types';
import { EARLIER_PROPOSAL } from '@/server/operations/record-decisions';
import {
  applyDecisions,
  keptApplication,
  undoApplication,
} from '@/server/storage/applications';
import { liveSheet, whyNotWritable } from '@/server/storage/run-reads';
import {
  currentDecisions,
  decidedOnEarlier,
  type KeptDecision,
} from '@/server/storage/decisions';
import { currentProposalOf, runKeyOf } from '@/server/storage/proposals';
import type { KeptRun } from '@/server/storage/runs';

import { keptRunFields, keptRunProcedure, staleReply } from '../run-procedure';
import { router } from '../trpc';

/*
  Server-only. Apply, through lib/engine/apply. `preview` says what the
  decisions would write, from the sheet as it is now; `write` writes them and
  reads them back; `undo` puts the cells back while they still hold what was
  written. Every one is a mutation: each reaches the sheet, and a preview may
  settle a write that was cut short. The client never retries one.

  Each takes the run kept on the server (`process`, `runId`): the server
  reads the run's text, read and rulebook, and the decisions are the run's
  current ones on its current proposal, read from the database; a write
  records the run (docs/engineering/RUNS-ON-THE-SERVER.md).
*/

const acknowledged = {
  // The checks that newly fail, by id, which a person has seen.
  acknowledged: z.array(z.string().max(200)).max(1000),
};

type Run = {
  owner: DefinitionProcess;
  set: DefinitionSet;
  read: KeptRead;
  published: string;
  text: string;
  kept: KeptRun;
};

const NO_PROPOSAL = 'This run has no proposal kept.';

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

type Decided = {
  proposal: Proposal;
  decisions: Record<string, DecisionMade>;
  // The row names the run, and its claim checks the decisions.
  through: Parameters<typeof applyDecisions>[8];
};

/*
  The proposal and the decisions a preview or a write works on: the run's
  current decisions on the current proposal for its run key, read from the
  database. None decided on the current one while some were on an earlier one
  is said in the words a stale decision gets.
*/
async function decidedOf({ owner, set, read, kept }: Run): Promise<Decided> {
  const current = await currentProposalOf(
    runKeyOf(owner, read.id, fingerprintOf(set)),
  );
  if (!current) throw new Error(NO_PROPOSAL);
  const on = {
    process: kept.process,
    runId: kept.id,
    proposalId: current.id,
  };
  const decisions = madeOf(await currentDecisions(on));
  if (!Object.keys(decisions).length && (await decidedOnEarlier(on)))
    throw new Error(EARLIER_PROPOSAL);
  const seen = JSON.stringify(decisions);
  return {
    proposal: current.proposal,
    decisions,
    through: {
      runId: kept.id,
      unchanged: async (db) =>
        JSON.stringify(madeOf(await currentDecisions(on, db))) === seen,
    },
  };
}

// The decisions kept on the server as the write takes them: what was
// decided and when, as the request's decisions say it.
const madeOf = (decisions: Record<string, KeptDecision>) =>
  Object.fromEntries(
    Object.entries(decisions).map(([key, { kind, values, at }]) => [
      key,
      { kind, ...(values ? { values } : {}), at } satisfies DecisionMade,
    ]),
  );

// What a preview and a write begin the same way, once the decisions are in
// hand: whether the run may write, and what is already kept of a write.
async function opened({ owner, set, read, published, text }: Run) {
  const fingerprint = fingerprintOf(set);
  const cannotReach = whyNotWritable(read);
  // An earlier version's rules may lack ones added since, so it cannot write.
  const notWritable =
    text === published
      ? cannotReach
      : 'This run answers to an earlier version of the instructions. Start a new run to write to the sheet.';
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
  return { fingerprint, notWritable, shared };
}

export const applyRouter = router({
  preview: keptRunProcedure(z.strictObject(keptRunFields)).mutation(
    async ({ ctx }) => {
      if (ctx.stale) return staleReply(ctx.stale);
      const { proposal, decisions } = await decidedOf(ctx);
      const { notWritable, shared } = await opened(ctx);
      if (notWritable)
        return previewOf(shared, notWritable, {
          // Nothing was asked of the sheet, so every cell reads as new.
          tabExists: false,
          changes: blockFor([], ctx.owner, writesOf(proposal, decisions))
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
          decisions,
          liveSheet,
        ),
      );
    },
  ),

  write: keptRunProcedure(
    z.strictObject({ ...keptRunFields, ...acknowledged }),
  ).mutation(async ({ ctx, input }) => {
    if (ctx.stale) return staleReply(ctx.stale);
    const { proposal, decisions, through } = await decidedOf(ctx);
    const { fingerprint, notWritable, shared } = await opened(ctx);
    if (notWritable) throw new Error(notWritable);
    const outcome = await applyDecisions(
      ctx.owner,
      ctx.set,
      ctx.read,
      fingerprint,
      proposal,
      decisions,
      input.acknowledged,
      liveSheet,
      through,
    );
    // A refused write answers with what the preview would, so the screen
    // shows why (it was a 409 with the preview as its body).
    return outcome.kind === 'written'
      ? { kind: 'applied' as const, application: outcome.application }
      : previewOf(shared, null, outcome.prepared);
  }),

  // Undo stays open: what was written can be taken back whatever came
  // since, a discarded run's write included.
  undo: keptRunProcedure(z.strictObject(keptRunFields), {
    discarded: 'allow',
  }).mutation(async ({ ctx }) => {
    if (ctx.stale) return staleReply(ctx.stale);
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
