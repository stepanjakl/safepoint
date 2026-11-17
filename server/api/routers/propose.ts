import 'server-only';

import { z } from 'zod';

import { calculate } from '@/lib/engine/calculate';
import { fingerprintOf } from '@/lib/engine/fingerprint';
import { checkProposal } from '@/lib/engine/propose';
import { namesOf, type KeptRead } from '@/lib/engine/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/engine/types';
import { draftingModelSchema } from '@/lib/models';
import { proposalProgress, startProposal } from '@/server/jobs/proposal';
import { evaluationSchema } from '@/server/operations/kept-processes';
import { keptProposal } from '@/server/storage/proposals';

import { runFields, runProcedure, staleReply } from '../run-procedure';
import { router } from '../trpc';

/*
  Server-only. Propose, through lib/engine/propose. `get` returns the
  kept proposal for the run's read and rulebook, with any job's progress;
  `start` starts the job and returns the same; `check` runs the accepted
  checks on values a person is changing, for one record. With evaluation
  `model` there is no rulebook: the model proposes from the instructions
  alone, and nothing checks it.
*/

const run = { ...runFields, evaluation: evaluationSchema };

type Run = { owner: DefinitionProcess; set: DefinitionSet; read: KeptRead };

// What the table shows: the records' names and the values Calculate worked
// out, which the proposal relied on, beside the kept proposal and its job.
async function proposalOf({ owner, set, read }: Run, readId: string) {
  const fingerprint = fingerprintOf(set);
  const calculation = calculate(owner, set, read);
  // Progress first: a proposal read after it is at least as new as it says.
  const progress = await proposalProgress(owner, readId, fingerprint);
  return {
    kind: 'proposal' as const,
    fingerprint,
    names: namesOf(read, owner.subject.data),
    calculated: {
      calculations: calculation.calculations.map(({ id, name }) => ({
        id,
        name,
      })),
      rows: Object.fromEntries(
        calculation.rows.map((row) => [
          row.key,
          Object.fromEntries(
            Object.entries(row.values).map(([id, cell]) => [id, cell.value]),
          ),
        ]),
      ),
    },
    proposal: await keptProposal(owner, readId, fingerprint),
    progress,
  };
}

export const proposeRouter = router({
  get: runProcedure(z.strictObject(run)).query(async ({ ctx, input }) =>
    ctx.stale ? staleReply(ctx.stale) : await proposalOf(ctx, input.readId),
  ),

  start: runProcedure(
    z.strictObject({ ...run, model: draftingModelSchema.optional() }),
  ).mutation(async ({ ctx, input }) => {
    if (ctx.stale) return staleReply(ctx.stale);
    await startProposal(
      ctx.owner,
      ctx.set,
      ctx.read,
      input.readId,
      input.text,
      {
        model: input.model,
      },
    );
    return await proposalOf(ctx, input.readId);
  }),

  check: runProcedure(
    z.strictObject({
      ...run,
      key: z.string().max(80),
      values: z.record(z.string().max(80), z.number().int()),
    }),
  ).query(({ ctx, input }) =>
    ctx.stale
      ? staleReply(ctx.stale)
      : {
          kind: 'check' as const,
          ...checkProposal(
            ctx.owner,
            ctx.set,
            ctx.read,
            input.key,
            input.values,
          ),
        },
  ),
});
