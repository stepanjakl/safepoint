import 'server-only';

import { z } from 'zod';

import { availableModels } from '@/lib/engine/model-provider';
import { availableModelPlan, modelPlanSchema } from '@/lib/models';
import {
  runProcess,
  runProcessIdSchema,
} from '@/server/operations/kept-processes';
import {
  runActivities,
  type RunActivity,
} from '@/server/operations/run-activity';
import { readIdSchema, rulebookIdSchema } from '@/server/storage/ids';
import { Refused } from '@/server/storage/refused';
import { versionByHash } from '@/server/storage/rules/instructions';
import {
  discardRun,
  type KeptRun,
  listRuns,
  PROGRESS_STATUSES,
  recordProgress,
  runOrRefuse,
  startRun,
} from '@/server/storage/runs/runs';

import { keptRunFields } from '../run-procedure';
import { gatedProcedure, router } from '../trpc';

/*
  Server-only. A process's runs, kept on the server (server/storage/runs/runs.ts).
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
        modelPlan: modelPlanSchema.optional(),
        // Drafts its own rulebook rather than the one its instructions share.
        ownRulebook: z.boolean().default(false),
      }),
    )
    .mutation(({ ctx, input }) => {
      if (
        input.modelPlan &&
        !availableModelPlan(input.modelPlan, availableModels())
      )
        throw new Refused(
          'This model is unavailable. Choose another model for this run.',
          'BAD_REQUEST',
        );
      // A run with rules of its own compares models: development's alone.
      if (input.ownRulebook && process.env.NODE_ENV !== 'development')
        throw new Refused(
          'A run keeps rules of its own in development only.',
          'BAD_REQUEST',
        );
      return startRun(runProcess(input.process), {
        instructions: input.instructions,
        trigger: input.trigger,
        additionalInstructions: input.additionalInstructions?.trim() || null,
        modelPlan: input.modelPlan,
        ownRulebook: input.ownRulebook,
        actor: ctx.actor,
      });
    }),

  list: gatedProcedure
    .input(
      z.strictObject({
        process: runProcessIdSchema,
        // The discarded ones too, marked by `discardedAt`.
        discarded: z.boolean().default(false),
      }),
    )
    .query(async ({ input }) => {
      const runs = await listRuns(input.process, {
        discarded: input.discarded,
      });
      // What each running run is doing: working, or waiting at a step.
      const activities = await runActivities(runProcess(input.process), runs);
      return runs.map((run): KeptRun & { activity?: RunActivity } => {
        const activity = activities.get(run.id);
        return activity ? { ...run, activity } : run;
      });
    }),

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
