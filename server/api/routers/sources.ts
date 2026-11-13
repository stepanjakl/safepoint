import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { missingSheetEnv } from '@/lib/sheets/composio';
import type { SourceId } from '@/lib/sources/model';
import {
  isSourceId,
  latestSummary,
  readSource,
  sourceValues,
} from '@/server/storage/source-reads';

import { gatedProcedure, router } from '../trpc';

/*
  Server-only. What a source holds (`summary`), one read's values for the data
  drawer (`values`), and reading it afresh from its provider (`read`), which
  keeps a new read and so is a mutation.
*/

const sourceInput = z.strictObject({ source: z.string() });

function known(source: string): SourceId {
  if (!isSourceId(source))
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No such source.' });
  return source;
}

const said = (error: unknown, otherwise: string) =>
  error instanceof Error ? error.message : otherwise;

export const sourcesRouter = router({
  summary: gatedProcedure
    .input(sourceInput)
    .query(({ input }) => latestSummary(known(input.source))),

  values: gatedProcedure
    .input(z.strictObject({ source: z.string(), read: z.string().max(80) }))
    .query(async ({ input }) => {
      const source = known(input.source);
      let values;
      try {
        values = await sourceValues(source, input.read);
      } catch (error) {
        // A kept read that cannot be read is named, not hidden as gone.
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: said(error, 'The read could not be read.'),
          cause: error,
        });
      }
      if (!values)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'This read is no longer kept on the server.',
        });
      return values;
    }),

  read: gatedProcedure.input(sourceInput).mutation(async ({ input }) => {
    const source = known(input.source);
    const missing = missingSheetEnv();
    if (missing.length)
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: `Missing ${missing.join(', ')}.`,
      });
    try {
      return await readSource(source);
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_GATEWAY',
        message: said(error, 'The read failed.'),
        cause: error,
      });
    }
  }),
});
