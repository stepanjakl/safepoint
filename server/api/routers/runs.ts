import 'server-only';

import { z } from 'zod';

import {
  runProcess,
  runProcessIdSchema,
} from '@/server/operations/kept-processes';
import { readIdSchema, rulebookIdSchema } from '@/server/storage/ids';
import { versionByHash } from '@/server/storage/instructions';
import {
  discardRun,
  listRuns,
  PROGRESS_STATUSES,
  recordProgress,
  runOrRefuse,
  startRun,
} from '@/server/storage/runs';

import { keptRunFields } from '../run-procedure';
import { gatedProcedure, router } from '../trpc';

/*
  Server-only. A process's runs, kept on the server (server/storage/runs.ts).
  `start` makes one and names it; `list` gives a process's runs newest first
  without the discarded ones, in one query, with no bodies; `get` gives one
  with the text of its instructions; `record` moves it on; `discard` marks
  it discarded. Only processes whose runs are kept may be named.
*/

const HASH = /^[0-9a-f]{12}$/;

export const runsRouter = router({
  start: gatedProcedure
    .input(
      z.strictObject({
        process: runProcessIdSchema,
        // The version it runs under, by its hash (instructions.list).
        instructions: z.string().regex(HASH),
        trigger: z.enum(['manual', 'rerun']).default('manual'),
        // A note for this run alone, as the start control takes one.
        additionalInstructions: z.string().max(20_000).nullable().default(null),
      }),
    )
    .mutation(({ ctx, input }) =>
      startRun(runProcess(input.process), {
        instructions: input.instructions,
        trigger: input.trigger,
        additionalInstructions: input.additionalInstructions?.trim() || null,
        actor: ctx.actor,
      }),
    ),

  list: gatedProcedure
    .input(
      z.strictObject({
        process: runProcessIdSchema,
        // The discarded ones too, marked by `discardedAt`.
        discarded: z.boolean().default(false),
      }),
    )
    .query(({ input }) =>
      listRuns(input.process, { discarded: input.discarded }),
    ),

  get: gatedProcedure
    .input(z.strictObject(keptRunFields))
    .query(async ({ input }) => {
      const run = await runOrRefuse(input.process, input.runId);
      const version = await versionByHash(
        runProcess(input.process),
        run.instructions.hash,
      );
      return {
        ...run,
        instructions: { ...run.instructions, text: version!.text },
      };
    }),

  record: gatedProcedure
    .input(
      z
        .strictObject({
          ...keptRunFields,
          readId: readIdSchema.optional(),
          // Null takes the pin away, to calculate on the current rules.
          rulebook: rulebookIdSchema.nullable().optional(),
          stage: z.string().max(40).optional(),
          status: z.enum(PROGRESS_STATUSES).optional(),
        })
        .refine(
          (input) =>
            input.readId !== undefined ||
            input.rulebook !== undefined ||
            input.stage !== undefined ||
            input.status !== undefined,
          { message: 'Nothing to record.' },
        ),
    )
    .mutation(({ input: { process, runId, ...progress } }) =>
      recordProgress(runProcess(process), runId, progress),
    ),

  discard: gatedProcedure
    .input(z.strictObject(keptRunFields))
    .mutation(({ input }) => discardRun(input.process, input.runId)),
});
