import 'server-only';

import { z } from 'zod';

import {
  keptProcess,
  processIdSchema,
} from '@/server/operations/kept-processes';
import {
  listVersions,
  publishVersion,
  versionByHash,
} from '@/server/storage/rules/instructions';
import { Refused } from '@/server/storage/refused';

import { gatedProcedure, router } from '../trpc';

/*
  Server-only. A process's instruction versions (server/storage/
  instructions.ts): its declared ones and the ones published here, labelled
  by the server. `publish` answers text that is already a version with that
  version, `created: false`, rather than a copy under a new label.
*/

// Text Postgres can keep exactly, as the browser holds it: no NUL, and no
// half of a surrogate pair, which UTF-8 cannot say and so cannot hash alike.
const instructionTextSchema = z
  .string()
  .min(1)
  .max(20_000)
  .refine((text) => !text.includes('\u0000') && text.isWellFormed(), {
    message: 'Instructions must be plain text.',
  });

const HASH = /^[0-9a-f]{12}$/;

export const instructionsRouter = router({
  list: gatedProcedure
    .input(z.strictObject({ process: processIdSchema }))
    .query(({ input }) => listVersions(keptProcess(input.process))),

  get: gatedProcedure
    .input(
      z.strictObject({
        process: processIdSchema,
        hash: z.string().regex(HASH),
      }),
    )
    .query(async ({ input }) => {
      const version = await versionByHash(
        keptProcess(input.process),
        input.hash,
      );
      if (!version)
        throw new Refused(
          'These instructions are not kept on the server.',
          'NOT_FOUND',
        );
      return version;
    }),

  publish: gatedProcedure
    .input(
      z.strictObject({
        process: processIdSchema,
        text: instructionTextSchema,
        note: z.string().max(2000).nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      publishVersion(
        keptProcess(input.process),
        input.text,
        input.note?.trim() || null,
        ctx.actor,
      ),
    ),
});
