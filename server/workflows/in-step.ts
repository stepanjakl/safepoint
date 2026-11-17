import 'server-only';

import { getWorkflowMetadata, RetryableError } from 'workflow';

import { ModelsResting } from '@/lib/engine/calls';
import { draftProgressSchema, type DraftProgress } from '@/lib/engine/types';
import { noteJob, readJob } from '@/server/jobs/run-job';
import { processOfDefinitions } from '@/server/operations/kept-processes';
import { keptRead, READ_GONE } from '@/server/storage/run-reads';
import { versionByHash } from '@/server/storage/instructions';
import {
  attemptRecorder,
  triesSoFar,
  type AttemptContext,
  type Recorder,
} from '@/server/storage/model-attempts';

import type { JobRun, Outcome } from './types';

/*
  Server-only. What every step of a job does around its work (the steps in
  draft-steps.ts and proposal-steps.ts): start from the progress the row
  keeps, write it as the work goes on, under the claim that started the job
  or the run itself, record each model call with the job, and say what
  stopped the work rather than throw it. A step whose work throws is not run
  again (it would ask the models again for the same failure); the workflow
  ends the job with what it said. The one thing waited for is quota that
  comes back soon: the step is retried when it does, and no function is held
  waiting for it.
*/

// Every model spent until this soon is waited for, by the run; longer is said
// to the person, as it was before (lib/engine/calls.ts).
const WAIT_WITHIN_MS = 15 * 60_000;

const firstLine = (error: unknown) =>
  error instanceof Error ? error.message.split('\n')[0]! : 'Failed.';

// The run this step is part of; none when a test calls it directly.
function runHere(): string | null {
  try {
    return getWorkflowMetadata().workflowRunId;
  } catch {
    return null;
  }
}

export async function inStep<T>(
  run: JobRun,
  context: Omit<AttemptContext, 'process' | 'jobKind' | 'jobKey'>,
  fallback: DraftProgress,
  work: (
    progress: DraftProgress,
    note: () => Promise<void>,
    record: Recorder,
  ) => Promise<T>,
): Promise<Outcome<T>> {
  const kept = await readJob(run.job, draftProgressSchema);
  const progress = kept?.progress ?? fallback;
  const fence = { holder: run.holder, runId: runHere() };
  // Notes are written one after another, each as the job stands when its
  // turn comes, so a slow write cannot land after a later one. Recording is
  // a convenience: a failed write never stops the work.
  let tail = Promise.resolve();
  const note = () =>
    (tail = tail.then(async () => {
      try {
        await noteJob(run.job, fence, progress);
      } catch {
        // The next note tries again.
      }
    }));
  const where = {
    ...context,
    process: run.job.process,
    jobKind: run.job.kind,
    jobKey: run.job.key,
  };
  const record = attemptRecorder(
    where,
    kept ? await triesSoFar(where, kept.startedAt) : undefined,
  );
  try {
    const done = await work(progress, note, record);
    await note();
    return { done };
  } catch (error) {
    if (
      error instanceof ModelsResting &&
      error.until - Date.now() <= WAIT_WITHIN_MS
    )
      throw new RetryableError(error.message, {
        retryAfter: new Date(error.until),
      });
    return { stopped: firstLine(error) };
  } finally {
    await tail;
    await record.settled();
  }
}

// What a job works on, read where it is kept: a step is handed ids only.
export async function instructionsOf(process: string, hash: string) {
  const kept = processOfDefinitions(process);
  const version = await versionByHash(kept, hash);
  if (!version) throw new Error('These instructions are no longer kept.');
  return { owner: kept.runs.definitions, text: version.text };
}

// The read a job works on, kept under the reads of the process it is for.
export async function readOf(process: string, readId: string) {
  const read = await keptRead(processOfDefinitions(process).runs.reads, readId);
  if (!read) throw new Error(READ_GONE);
  return read;
}

// Ends a job with its last word, under the same claim as its notes.
export async function settle(
  run: JobRun,
  fallback: DraftProgress,
  end: (progress: DraftProgress) => void,
): Promise<void> {
  const kept = await readJob(run.job, draftProgressSchema);
  const progress = kept?.progress ?? fallback;
  progress.running = false;
  end(progress);
  await noteJob(run.job, { holder: run.holder, runId: runHere() }, progress);
}
