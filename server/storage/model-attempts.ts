import 'server-only';

import { and, count, eq, gte } from 'drizzle-orm';

import type { Attempt, RecordAttempt } from '@/lib/definitions/attempts';
import { database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { modelAttempts, type JOB_KINDS } from '@/server/db/schema';

/*
  Server-only. Keeps what the engine reports of each model call
  (lib/definitions/attempts.ts) in `model_attempts`, with what the call was
  part of, which the caller knows and the engine does not. Nothing reads it
  yet; the debug drawers of the Rules step are its natural reader.

  A recorder never slows or stops a call: each row is written without the
  call waiting for it, and a row that cannot be written is let go. A job or a
  procedure awaits `settled()` once its work is done, so its rows are written
  before it answers or the process moves on, and a test can wait for them.
*/

export type AttemptContext = {
  process: string;
  jobKind?: (typeof JOB_KINDS)[number];
  jobKey?: string;
  runId?: string;
  instructionsHash?: string;
  readId?: string;
  fingerprint?: string;
};

export type Recorder = RecordAttempt & { settled: () => Promise<void> };

// What a try is numbered by: what it was for.
const triedFor = (purpose: string, definitionId: string | null) =>
  `${purpose}:${definitionId ?? ''}`;

/*
  The tries a job has made since it started, by what each was for: a job's
  work is done in steps (server/workflows/), each with a recorder of its own,
  and a step's tries are numbered on from these.
*/
export async function triesSoFar(
  context: AttemptContext &
    Required<Pick<AttemptContext, 'jobKind' | 'jobKey'>>,
  since: Date,
): Promise<Map<string, number>> {
  const rows = await (
    await database()
  )
    .select({
      purpose: modelAttempts.purpose,
      definitionId: modelAttempts.definitionId,
      tries: count(),
    })
    .from(modelAttempts)
    .where(
      and(
        eq(modelAttempts.process, context.process),
        eq(modelAttempts.jobKind, context.jobKind),
        eq(modelAttempts.jobKey, context.jobKey),
        gte(modelAttempts.startedAt, since),
      ),
    )
    .groupBy(modelAttempts.purpose, modelAttempts.definitionId);
  return new Map(
    rows.map((row) => [triedFor(row.purpose, row.definitionId), row.tries]),
  );
}

export function attemptRecorder(
  context: AttemptContext,
  // Tries already made, numbered on from (triesSoFar).
  before: Map<string, number> = new Map(),
): Recorder {
  const writing = new Set<Promise<void>>();
  // Which try each is, from 1, of what it was for.
  const tries = new Map(before);
  const keep = async (attempt: Attempt, number: number) => {
    const db = await database();
    await ensureProcess(db, context.process);
    await db.insert(modelAttempts).values({
      process: context.process,
      purpose: attempt.purpose,
      model: attempt.model,
      jobKind: context.jobKind ?? null,
      jobKey: context.jobKey ?? null,
      runId: context.runId ?? null,
      instructionsHash: context.instructionsHash ?? null,
      readId: context.readId ?? null,
      fingerprint: context.fingerprint ?? null,
      definitionId: attempt.definitionId,
      attempt: number,
      startedAt: attempt.startedAt,
      durationMs: attempt.durationMs,
      outcome: attempt.outcome,
      inputTokens: attempt.inputTokens,
      outputTokens: attempt.outputTokens,
      thinkingTokens: attempt.thinkingTokens,
      requests: attempt.requests,
      waitedMs: attempt.waitedMs,
      asked: attempt.asked,
      answer: attempt.answer,
      error: attempt.error,
    });
  };
  const record: RecordAttempt = (attempt) => {
    const of = triedFor(attempt.purpose, attempt.definitionId);
    const number = (tries.get(of) ?? 0) + 1;
    tries.set(of, number);
    // A record only: a row that cannot be written is let go.
    const kept = keep(attempt, number).catch(() => undefined);
    writing.add(kept);
    void kept.then(() => writing.delete(kept));
  };
  return Object.assign(record, {
    settled: async () => {
      while (writing.size) await Promise.all([...writing]);
    },
  });
}
