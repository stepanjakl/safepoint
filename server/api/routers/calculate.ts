import 'server-only';

import { z } from 'zod';

import { calculate } from '@/lib/definitions/calculate';
import { fingerprintOf, hashOf } from '@/lib/definitions/fingerprint';
import type { KeptRead } from '@/lib/definitions/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/definitions/types';
import { draftingModelSchema } from '@/lib/models';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import {
  crossCheck,
  keepCrossCheck,
  keptCrossCheck,
} from '@/server/storage/cross-checks';
import { attemptRecorder } from '@/server/storage/model-attempts';
import { putRevision } from '@/server/storage/rulebooks';

import { runFields, runProcedure, staleReply } from '../run-procedure';
import { router } from '../trpc';

/*
  Server-only. Calculate, through lib/definitions/calculate. `get` works every
  accepted calculation out for every record of a read, with any cross-check
  kept for that read and rulebook; `crossCheck` asks the model to work the
  same values out on its own, keeps its answer and returns both. A run names
  the rulebook it calculated on, and keeps getting that one; the answer says
  which rulebook is current, so the run can move to it.
*/

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
    z.strictObject({ ...runFields, model: draftingModelSchema.optional() }),
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
      { model: input.model, record },
    ).finally(record.settled);
    await keepCrossCheck(owner, check);
    return { kind: 'calculation' as const, calculation, check, current };
  }),
});
