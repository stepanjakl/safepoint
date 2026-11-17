import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { recordsOf, type KeptRead } from '@/lib/engine/records';
import { missingSheetEnv } from '@/lib/sheets/composio';
import { rulebookProcess } from '@/server/operations/kept-processes';
import {
  captureRead,
  keptRead,
  READ_GONE,
  readAndKeep,
} from '@/server/storage/reads/run-reads';

import { gatedProcedure, router } from '../trpc';

/*
  Server-only. A run reads the sheet's data tabs once (`keep`), and later asks
  for that same read by its id (`get`). `capture` saves a live read as the
  captured one that the tests and the default view use.
*/

// These procedures name no process, as they never did: they are the rulebook
// process's (server/operations/kept-processes.ts), whose reads every process
// shares.
const { definitions, reads } = rulebookProcess().runs;

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

// A kept read, or the refusal that says it is gone or cannot be read.
async function keptOrRefuse(id: string) {
  let kept;
  try {
    kept = await keptRead(reads, id);
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
}

// What a card says of a read: when and where, its tabs and their rows, and
// where the sheet does not fit what this process reads. No values.
const summaryOf = (kept: KeptRead) => ({
  id: kept.id,
  readAt: kept.readAt,
  source: kept.source,
  spreadsheet: kept.spreadsheet,
  tabs: kept.tabs.map((t) => ({ name: t.name, rows: t.values.length })),
  problems: recordsOf(kept, definitions.subject.data).problems,
});

export const readRouter = router({
  get: gatedProcedure
    .input(z.strictObject({ id: z.string().max(80) }))
    .query(({ input }) => keptOrRefuse(input.id)),

  // `keep`'s answer for a read already kept, so a run that comes back to its
  // read shows its card without loading every tab's values.
  summary: gatedProcedure
    .input(z.strictObject({ id: z.string().max(80) }))
    .query(async ({ input }) => summaryOf(await keptOrRefuse(input.id))),

  keep: gatedProcedure
    .input(z.strictObject({ source: z.enum(['captured', 'live']) }))
    .mutation(async ({ input }) => {
      if (input.source === 'live') requireSheetEnv();
      try {
        return summaryOf(await readAndKeep(reads, input.source));
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
      return await captureRead(reads);
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_GATEWAY',
        message: said(error, 'The read failed.'),
        cause: error,
      });
    }
  }),
});
