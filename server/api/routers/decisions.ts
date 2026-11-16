import 'server-only';

import { z } from 'zod';

import { runProcess } from '@/server/operations/kept-processes';
import {
  decide,
  decisionsOfRun,
  type Asked,
} from '@/server/operations/record-decisions';
import { runOrRefuse } from '@/server/storage/runs';

import { keptRunFields, keptRunProcedure, staleReply } from '../run-procedure';
import { gatedProcedure, router } from '../trpc';

/*
  Server-only. A person's decisions on the records of a kept run's current
  proposal (server/operations/record-decisions.ts), each kept as an event.
  `current` gives each record's current decision; `record`, `recordMany`
  and `withdraw` keep one, several at once (approving every ready record),
  or take one back, and each answers what `current` would after. The
  proposal is named by its own time (`proposedAt`), as the write names it.
  A decision the record already has is not kept again.
*/

const KEY = z.string().min(1).max(80);
const VALUES = z.record(z.string().max(80), z.number());
const onProposal = { ...keptRunFields, proposedAt: z.string().max(40) };
const asked = z.discriminatedUnion('kind', [
  z.strictObject({ key: KEY, kind: z.enum(['approve', 'reject']) }),
  z.strictObject({ key: KEY, kind: z.literal('change'), values: VALUES }),
]);

export const decisionsRouter = router({
  current: gatedProcedure
    .input(z.strictObject(keptRunFields))
    .query(async ({ input }) =>
      decisionsOfRun(
        runProcess(input.process),
        await runOrRefuse(input.process, input.runId),
      ),
    ),

  record: keptRunProcedure(
    z.strictObject({ ...onProposal, decision: asked }),
  ).mutation(async ({ ctx, input }) =>
    ctx.stale
      ? staleReply(ctx.stale)
      : await decide(
          ctx,
          runProcess(input.process),
          ctx.kept,
          input.proposedAt,
          [input.decision as Asked],
          ctx.actor,
        ),
  ),

  recordMany: keptRunProcedure(
    z.strictObject({
      ...onProposal,
      decisions: z.array(asked).min(1).max(1000),
    }),
  ).mutation(async ({ ctx, input }) =>
    ctx.stale
      ? staleReply(ctx.stale)
      : await decide(
          ctx,
          runProcess(input.process),
          ctx.kept,
          input.proposedAt,
          input.decisions as Asked[],
          ctx.actor,
        ),
  ),

  withdraw: keptRunProcedure(
    z.strictObject({ ...onProposal, key: KEY }),
  ).mutation(async ({ ctx, input }) =>
    ctx.stale
      ? staleReply(ctx.stale)
      : await decide(
          ctx,
          runProcess(input.process),
          ctx.kept,
          input.proposedAt,
          [{ key: input.key, kind: 'withdraw' }],
          ctx.actor,
        ),
  ),
});
