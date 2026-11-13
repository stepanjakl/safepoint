import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { Stale } from '@/lib/definitions/fits';
import {
  evaluationSchema,
  rulebookFor,
} from '@/server/operations/brunch-orders-rulebook';
import { keptRead, READ_GONE } from '@/server/storage/brunch-orders-reads';
import { readIdSchema, rulebookIdSchema } from '@/server/storage/ids';

import { gatedProcedure } from './trpc';

/*
  Server-only. The opening every Brunch orders procedure about a run shares:
  find the read the run kept, then the rulebook it answers to, and say
  whether that rulebook still fits the read. A handler is given both in its
  context and begins `if (ctx.stale) return staleReply(ctx.stale)`.

  A stale rulebook is a result, not an error: the screen shows what no longer
  fits and offers the current rules, so it travels as `{ kind: 'stale', … }`
  in the procedure's output, where a 409 body carried it before.
*/

// The fields that name a run, which a procedure's input spreads in. A run
// names the accepted rulebook it calculated on, and keeps using that one.
export const runFields = {
  text: z.string().min(1).max(20_000),
  readId: readIdSchema,
  rulebook: rulebookIdSchema.optional(),
};

// What a procedure's input must hold. `evaluation` is the Brunch orders
// process to work under, `rules` when it says nothing.
type RunInput = {
  text: string;
  readId: string;
  rulebook?: string | undefined;
  evaluation?: z.infer<typeof evaluationSchema> | undefined;
};

export const staleReply = (stale: Stale) => ({
  kind: 'stale' as const,
  ...stale,
});

// What the routes answered for anything that went wrong while working: the
// message, as a bad gateway.
const failed = (error: unknown) =>
  new TRPCError({
    code: 'BAD_GATEWAY',
    message: error instanceof Error ? error.message : 'Failed.',
    cause: error,
  });

export const runProcedure = <Schema extends z.ZodType<RunInput>>(
  input: Schema,
) =>
  gatedProcedure.input(input).use(async ({ input, next }) => {
    const { text, readId, rulebook, evaluation } = input as RunInput;
    let run;
    try {
      const read = await keptRead(readId);
      if (!read) throw new TRPCError({ code: 'NOT_FOUND', message: READ_GONE });
      run = {
        read,
        ...(await rulebookFor(evaluation ?? 'rules', text, rulebook, read)),
      };
    } catch (error) {
      throw error instanceof TRPCError ? error : failed(error);
    }
    const result = await next({ ctx: run });
    // Whatever the work itself throws is answered the same way.
    if (!result.ok && result.error.code === 'INTERNAL_SERVER_ERROR')
      throw failed(result.error.cause ?? result.error);
    return result;
  });
