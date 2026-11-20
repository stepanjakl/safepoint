import 'server-only';

import { z } from 'zod';

import { calculate } from '@/lib/engine/calculate';
import { fingerprintOf, hashOf } from '@/lib/engine/fingerprint';
import type { KeptRead } from '@/lib/engine/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/engine/types';
import { draftingModelSchema } from '@/lib/models';
import { rulebookProcess } from '@/server/operations/kept-processes';
import {
  crossCheck,
  keepCrossCheck,
  keptCrossCheck,
} from '@/server/storage/reads/cross-checks';
import { attemptRecorder } from '@/server/storage/models/model-attempts';
import { putRevision } from '@/server/storage/rules/rulebooks';

import { runFields, runProcedure, staleReply } from '../run-procedure';
import { runIdSchema } from '@/server/storage/ids';
import { modelForRun } from '@/server/storage/runs/runs';
import { router } from '../trpc';

/*
  Server-only. Calculate, through lib/engine/calculate. `get` works every
  accepted calculation out for every record of a read, with any cross-check
  kept for that read and rulebook; `crossCheck` asks the model to work the
  same values out on its own, keeps its answer and returns both. A run names
  the rulebook it calculated on, and keeps getting that one; the answer says
  which rulebook is current, so the run can move to it.
*/

// Calculate names no process, as it never did: it is the rulebook process's
// (server/operations/kept-processes.ts).
const { definitions: owner } = rulebookProcess().runs;

type Run = {
  owner: DefinitionProcess;
  set: DefinitionSet;
  current: DefinitionSet;
  pinned: boolean;
  read: KeptRead;
};

async function worked(run: Run) {
  const calculation = calculate(run.owner, run.set, run.read);
  // What a run calculates on is kept as it is, so the run can come back to
  // it; a pinned revision was kept when it was accepted.
  if (!run.pinned) await putRevision(owner, run.set, { reason: 'used' });
  return { calculation, current: fingerprintOf(run.current) };
}

export const calculateRouter = router({
  // A query though it may keep a revision: keeping it twice, or not again
  // once it is kept, changes nothing.
  get: runProcedure(z.strictObject(runFields)).query(async ({ ctx, input }) => {
    if (ctx.stale) return staleReply(ctx.stale);
    const { calculation, current } = await worked(ctx);
    return {
      kind: 'calculation' as const,
      calculation,
      check: await keptCrossCheck(owner, input.readId, calculation.fingerprint),
      current,
    };
  }),

  crossCheck: runProcedure(
    z.strictObject({
      ...runFields,
      model: draftingModelSchema.optional(),
      runId: runIdSchema.optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    if (ctx.stale) return staleReply(ctx.stale);
    const { calculation, current } = await worked(ctx);
    const record = attemptRecorder({
      process: ctx.owner.id,
      instructionsHash: hashOf(input.text),
      readId: input.readId,
      fingerprint: calculation.fingerprint,
    });
    const check = await crossCheck(
      ctx.owner,
      ctx.set,
      ctx.read,
      input.readId,
      input.text,
      {
        model: await modelForRun(
          ctx.process.summary.id,
          input.runId,
          input.model,
        ),
        record,
      },
    ).finally(record.settled);
    await keepCrossCheck(owner, check);
    return { kind: 'calculation' as const, calculation, check, current };
  }),
});
