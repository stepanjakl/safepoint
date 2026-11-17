import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { fingerprintOf } from '@/lib/engine/fingerprint';
import type { Stale } from '@/lib/engine/fits';
import {
  evaluationSchema,
  rulebookFor,
} from '@/server/operations/run-rulebook';
import {
  runProcess,
  runProcessIdSchema,
} from '@/server/operations/kept-processes';
import { runKeyOfKept } from '@/server/operations/record-decisions';
import { keptRead, READ_GONE } from '@/server/storage/run-reads';
import {
  readIdSchema,
  rulebookIdSchema,
  runIdSchema,
} from '@/server/storage/ids';
import { versionByHash } from '@/server/storage/instructions';
import { Refused } from '@/server/storage/refused';
import {
  RUN_DISCARDED,
  runOrRefuse,
  type KeptRun,
} from '@/server/storage/runs';

import { failed, gatedProcedure } from './trpc';

/*
  Server-only. The opening every Brunch orders procedure about a run shares:
  find the read the run kept, then the rulebook it answers to, and say
  whether that rulebook still fits the read. A handler is given all of it
  (`rulebookFor`'s answer, and the read) in its context, and begins
  `if (ctx.stale) return staleReply(ctx.stale)`.

  A run is named one of two ways. By its fields (`runFields`: the text of
  its instructions, its read, its rulebook, its evaluation), as Propose,
  Calculate and Rules name it, which still work from the text; or by the run
  kept on the server (`keptRunFields`: its process and id), from which the
  server reads all of those itself (`keptRunProcedure`: Apply and the
  decisions). Both open the same way.

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

// A run kept on the server, by its process and the id the server gave it.
export const keptRunFields = {
  process: runProcessIdSchema,
  runId: runIdSchema,
};

// What a procedure's input must hold. `evaluation` is the Brunch orders
// process to work under, `rules` when it says nothing.
type RunInput = {
  text: string;
  readId: string;
  rulebook?: string | undefined;
  evaluation?: z.infer<typeof evaluationSchema> | undefined;
};
type KeptRunInput = { process: string; runId: string };

export const staleReply = (stale: Stale) => ({
  kind: 'stale' as const,
  ...stale,
});

async function opened({ text, readId, rulebook, evaluation }: RunInput) {
  const read = await keptRead(readId);
  if (!read) throw new TRPCError({ code: 'NOT_FOUND', message: READ_GONE });
  return {
    read,
    text,
    ...(await rulebookFor(evaluation ?? 'rules', text, rulebook, read)),
  };
}

/*
  What a kept run names, read from the server: the text of the version it
  runs under, its read and its pinned rulebook, and how its process
  evaluates. Refused while it has nothing to work on yet, and for one
  discarded unless the procedure says a discarded run may still ask
  (undoing what it wrote may always be asked).
*/
async function fieldsOf(
  { process, runId }: KeptRunInput,
  { discarded }: { discarded: 'refuse' | 'allow' },
): Promise<{ run: KeptRun; fields: RunInput }> {
  const kept = runProcess(process);
  const run = await runOrRefuse(process, runId);
  if (run.discardedAt && discarded === 'refuse')
    throw new Refused(RUN_DISCARDED);
  const version = await versionByHash(kept, run.instructions.hash);
  // The run's key holds it there; a version is never removed.
  if (!version) throw new Error('This run’s instructions are not kept.');
  if (!run.readId) throw new Refused('This run has not read its data yet.');
  const { evaluation } = kept.runs;
  if (evaluation === 'rules' && !run.rulebook)
    throw new Refused('This run has not calculated on a rulebook yet.');
  return {
    run,
    fields: {
      text: version.text,
      readId: run.readId,
      rulebook: run.rulebook ?? undefined,
      evaluation,
    },
  };
}

const opening = (error: unknown) =>
  error instanceof TRPCError || error instanceof Refused
    ? error
    : failed(error);

export const runProcedure = <Schema extends z.ZodType<RunInput>>(
  input: Schema,
) =>
  gatedProcedure.input(input).use(async ({ input, next }) => {
    let run;
    try {
      run = await opened(input as RunInput);
    } catch (error) {
      throw opening(error);
    }
    const result = await next({ ctx: run });
    // Whatever the work itself throws is answered the same way.
    if (!result.ok && result.error.code === 'INTERNAL_SERVER_ERROR')
      throw failed(result.error.cause ?? result.error);
    return result;
  });

/*
  A procedure that takes a run as it is kept on the server (`process`,
  `runId`), and opens it the same way. `ctx.kept` is the kept run.
*/
export const keptRunProcedure = <Schema extends z.ZodType<KeptRunInput>>(
  input: Schema,
  { discarded = 'refuse' }: { discarded?: 'refuse' | 'allow' } = {},
) =>
  gatedProcedure.input(input).use(async ({ input, next }) => {
    let run;
    try {
      const given = input as KeptRunInput;
      const { run: kept, fields } = await fieldsOf(given, { discarded });
      const open = await opened(fields);
      // The rules it pinned, as it was given them: none kept any more is
      // said, never worked around with whichever rules are current.
      const key = await runKeyOfKept(runProcess(given.process), kept);
      if (key?.fingerprint !== fingerprintOf(open.set))
        throw new Refused(
          'The rulebook this run calculated on is not kept any more. Calculate again on the current rules.',
        );
      run = { ...open, kept };
    } catch (error) {
      throw opening(error);
    }
    const result = await next({ ctx: run });
    // Whatever the work itself throws is answered the same way.
    if (!result.ok && result.error.code === 'INTERNAL_SERVER_ERROR')
      throw failed(result.error.cause ?? result.error);
    return result;
  });
