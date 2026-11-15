import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { blockFor, prepareWrite, writesOf } from '@/lib/definitions/apply';
import type { DecisionMade, Prepared } from '@/lib/definitions/apply';
import { fingerprintOf } from '@/lib/definitions/fingerprint';
import { namesOf, type KeptRead } from '@/lib/definitions/records';
import type {
  Application,
  DefinitionProcess,
  DefinitionSet,
  Proposal,
} from '@/lib/definitions/types';
import { evaluationSchema } from '@/server/operations/brunch-orders-rulebook';
import { EARLIER_PROPOSAL } from '@/server/operations/record-decisions';
import {
  applyDecisions,
  keptApplication,
  undoApplication,
} from '@/server/storage/applications';
import {
  liveSheet,
  whyNotWritable,
} from '@/server/storage/brunch-orders-reads';
import {
  currentDecisions,
  decidedOnEarlier,
  type KeptDecision,
} from '@/server/storage/decisions';
import { rulebookIdSchema } from '@/server/storage/ids';
import {
  currentProposalOf,
  keptProposal,
  runKeyOf,
} from '@/server/storage/proposals';
import type { KeptRun } from '@/server/storage/runs';

import {
  keptRunFields,
  keptRunProcedure,
  runFields,
  staleReply,
} from '../run-procedure';
import { router } from '../trpc';

/*
  Server-only. Apply, through lib/definitions/apply. `preview` says what the
  decisions would write, from the sheet as it is now; `write` writes them and
  reads them back; `undo` puts the cells back while they still hold what was
  written. Every one is a mutation: each reaches the sheet, and a preview may
  settle a write that was cut short. The client never retries one.

  Each takes a run one of two ways. As kept on the server (`process`,
  `runId`): the decisions are the run's current ones on its current
  proposal, read from the database, and a write records the run. Or by its
  fields with the decisions in the request (`text`, `readId`, `rulebook`,
  `evaluation`, `proposedAt`, `decisions`), as the screens send them while
  runs are kept in the browser. GOING AWAY in batch 5b, once the screens
  keep runs on the server (docs/engineering/RUNS-ON-THE-SERVER.md): then
  only the kept run is taken. Once the decisions are in hand both paths are
  one (`decidedOf`, then `opened`), so they cannot drift.
*/

// Apply names the rulebook the run calculated on; there is no run without it.
const run = {
  ...runFields,
  rulebook: rulebookIdSchema,
  evaluation: evaluationSchema,
};
// GOING AWAY (5b): decisions the browser held, sent with the request.
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
  kept: KeptRun | null;
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
  // A kept run's: the row names it, and its claim checks the decisions.
  through?: Parameters<typeof applyDecisions>[8];
};

/*
  The proposal and the decisions a preview or a write works on. A kept run's
  are its current decisions on the current proposal for its run key, read
  from the database: none decided on the current one while some were on an
  earlier one is said in the words a stale request gets. A request's own are
  held to the current proposal by its time.
*/
async function decidedOf(
  { owner, set, read, kept }: Run,
  input:
    | { runId: string }
    | { proposedAt: string; decisions: Record<string, DecisionMade> },
): Promise<Decided> {
  const fingerprint = fingerprintOf(set);
  if (kept) {
    const current = await currentProposalOf(
      runKeyOf(owner, read.id, fingerprint),
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
  // A run named by its fields brings its decisions (GOING AWAY, 5b).
  if (!('decisions' in input)) throw new Error('This run is not kept.');
  const proposal = await keptProposal(owner, read.id, fingerprint);
  if (!proposal) throw new Error(NO_PROPOSAL);
  if (proposal.at !== input.proposedAt) throw new Error(EARLIER_PROPOSAL);
  return { proposal, decisions: input.decisions };
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
  preview: keptRunProcedure(
    z.union([
      z.strictObject(keptRunFields),
      // GOING AWAY (5b).
      z.strictObject({ ...run, ...decided }),
    ]),
  ).mutation(async ({ ctx, input }) => {
    if (ctx.stale) return staleReply(ctx.stale);
    const { proposal, decisions } = await decidedOf(ctx, input);
    const { notWritable, shared } = await opened(ctx);
    if (notWritable)
      return previewOf(shared, notWritable, {
        // Nothing was asked of the sheet, so every cell reads as new.
        tabExists: false,
        changes: blockFor([], ctx.owner, writesOf(proposal, decisions)).changes,
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
  }),

  write: keptRunProcedure(
    z.union([
      z.strictObject({ ...keptRunFields, ...acknowledged }),
      // GOING AWAY (5b).
      z.strictObject({ ...run, ...decided, ...acknowledged }),
    ]),
  ).mutation(async ({ ctx, input }) => {
    if (ctx.stale) return staleReply(ctx.stale);
    const { proposal, decisions, through } = await decidedOf(ctx, input);
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
  undo: keptRunProcedure(
    z.union([
      z.strictObject(keptRunFields),
      // GOING AWAY (5b).
      z.strictObject(run),
    ]),
    { discarded: 'allow' },
  ).mutation(async ({ ctx }) => {
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
