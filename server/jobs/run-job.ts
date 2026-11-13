import type { z } from 'zod';

import { readKept, writeKept } from '@/server/storage/files';

/*
  Server-only. The one place a background job is started and its progress read:
  held while the server runs, written to a file as it goes, so a job the server
  stopped part way through says so rather than vanishing. A kind of job names
  its own key, file, schema and wording; nothing here knows what a job does.
*/

type Progress = { running: boolean; error: string | null };

export type JobRecord<P extends Progress> = {
  // Keeps one kind of job from taking another's key.
  kind: string;
  key: string;
  file: string;
  schema: z.ZodType<P>;
  // Said of a job kept as running that this server is not running.
  interrupted: string;
  // One line, for progress nobody reads by eye.
  compact?: boolean;
};

// Held on globalThis: a development recompile re-runs this module, and a new
// map would report a job still running as stopped.
const server = globalThis as { serverJobs?: Map<string, Progress> };
const held = (server.serverJobs ??= new Map<string, Progress>());
const heldKey = ({ kind, key }: Pick<JobRecord<Progress>, 'kind' | 'key'>) =>
  `${kind}\u0000${key}`;

// The job running under this key, if there is one.
export const runningJob = <P extends Progress>(
  job: Pick<JobRecord<P>, 'kind' | 'key'>,
): P | null => {
  const current = held.get(heldKey(job)) as P | undefined;
  return current?.running ? current : null;
};

export async function jobProgress<P extends Progress>(
  job: JobRecord<P>,
): Promise<P | null> {
  // A copy: the job changes the one held, and a reply built from it could
  // otherwise say finished beside work read before it finished.
  const current = held.get(heldKey(job)) as P | undefined;
  if (current) return { ...current };
  const kept = await readKept(job.file, job.schema, {
    unreadableIsMissing: true,
  });
  if (!kept) return null;
  // Running, but not on this server: it stopped with the one before.
  return kept.running
    ? { ...kept, running: false, error: job.interrupted }
    : kept;
}

// Runs the work unless a job is running under this key, recording progress
// before, during and after it; what it throws becomes the job's error.
export function startJob<P extends Progress>(
  job: JobRecord<P> & {
    initial: P;
    work: (progress: P, note: () => Promise<void>) => Promise<void>;
    // Clears what only means something while the job runs.
    settle?: (progress: P) => void;
  },
): P {
  const running = runningJob<P>(job);
  if (running) return running;
  const progress = job.initial;
  held.set(heldKey(job), progress);
  // Recording is a convenience: a failed write never stops the job.
  const note = () =>
    writeKept(job.file, progress, { compact: job.compact }).catch(
      () => undefined,
    );
  void (async () => {
    await note();
    try {
      await job.work(progress, note);
    } catch (error) {
      progress.error =
        error instanceof Error ? error.message.split('\n')[0]! : 'Failed.';
    } finally {
      progress.running = false;
      job.settle?.(progress);
      await note();
    }
  })();
  return progress;
}
