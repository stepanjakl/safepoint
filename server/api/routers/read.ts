import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { recordsOf } from '@/lib/definitions/records';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';
import { missingSheetEnv } from '@/lib/sheets/composio';
import {
  captureRead,
  keptRead,
  READ_GONE,
  readAndKeep,
} from '@/server/storage/brunch-orders-reads';

import { gatedProcedure, router } from '../trpc';

/*
  Server-only. A run reads the sheet's data tabs once (`keep`), and later asks
  for that same read by its id (`get`). `capture` saves a live read as the
  captured one that the tests and the default view use.
*/

const said = (error: unknown, otherwise: string) =>
  error instanceof Error ? error.message : otherwise;

// Both reach the sheet, so both say what is missing before trying.
function requireSheetEnv() {
  const missing = missingSheetEnv();
  if (missing.length)
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: `Missing ${missing.join(', ')}.`,
    });
}

export const readRouter = router({
  get: gatedProcedure
    .input(z.strictObject({ id: z.string().max(80) }))
    .query(async ({ input }) => {
      let kept;
      try {
        kept = await keptRead(input.id);
      } catch (error) {
        // A kept read that cannot be read is named, not hidden as gone.
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: said(error, 'The read cannot be read.'),
          cause: error,
        });
      }
      if (!kept) throw new TRPCError({ code: 'NOT_FOUND', message: READ_GONE });
      return kept;
    }),

  keep: gatedProcedure
    .input(z.strictObject({ source: z.enum(['captured', 'live']) }))
    .mutation(async ({ input }) => {
      if (input.source === 'live') requireSheetEnv();
      try {
        const kept = await readAndKeep(input.source);
        return {
          id: kept.id,
          readAt: kept.readAt,
          source: kept.source,
          spreadsheet: kept.spreadsheet,
          tabs: kept.tabs.map((t) => ({ name: t.name, rows: t.values.length })),
          // Where the sheet does not fit what this process reads.
          problems: recordsOf(kept, SUBJECT.data).problems,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_GATEWAY',
          message: said(error, 'The read failed.'),
          cause: error,
        });
      }
    }),

  capture: gatedProcedure.mutation(async () => {
    requireSheetEnv();
    try {
      return await captureRead();
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_GATEWAY',
        message: said(error, 'The read failed.'),
        cause: error,
      });
    }
  }),
});
