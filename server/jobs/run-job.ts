import 'server-only';

import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';

import type { ProposalActivity } from '@/lib/definitions/types';
import { database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { JOB_KINDS, jobs } from '@/server/db/schema';

/*
  Server-only. The one place a background job is started and its progress
  read. The process running a job holds it in memory and answers progress from
  there; the `jobs` row is what another process, or this one after a restart,
  reads. A running job is held by a lease: its `holder` (one id per server
  process) renews `heartbeat_at` on a timer while the work runs, a start is
  refused while another holder's lease is live, and a row kept as running
  whose lease has run out reads as interrupted, in the words of the job's
  kind. A kind of job names its own key, schema and wording; nothing here
  knows what a job does.
*/

type Progress = {
  step: string;
  running: boolean;
  error: string | null;
  writing?: string | null | undefined;
  activity?: ProposalActivity | undefined;
};

export type JobRecord<P extends Progress> = {
  // Keeps one kind of job from taking another's key.
  kind: (typeof JOB_KINDS)[number];
  process: string;
  key: string;
  schema: z.ZodType<P>;
  // Said of a job kept as running whose lease has run out.
  interrupted: string;
};

type Named = Pick<JobRecord<Progress>, 'kind' | 'process' | 'key'>;

// A job renews its lease this often, whether or not it has anything to say,
// so a model call of minutes cannot let it lapse; a lease not renewed for
// LEASE_MS belongs to a process that is gone.
export const HEARTBEAT_MS = 15_000;
export const LEASE_MS = 60_000;

// Held on globalThis: a development recompile re-runs this module, and a new
// map would report a job still running as stopped, a new holder as another
// process.
const server = globalThis as {
  serverJobs?: Map<string, Progress>;
  serverHolder?: string;
};
const held = (server.serverJobs ??= new Map<string, Progress>());
const heldKey = ({ kind, process, key }: Named) =>
  `${kind}\u0000${process}\u0000${key}`;

// This server process, as the lease names it.
export const holderId = () =>
  (server.serverHolder ??= `${process.pid}-${randomUUID()}`);

const whereJob = (job: Named) =>
  and(
    eq(jobs.process, job.process),
    eq(jobs.kind, job.kind),
    eq(jobs.key, job.key),
  );

// The lease is judged by the database's clock, so instances whose own clocks
// differ still agree on whether it has run out.
const expired = sql`${jobs.heartbeatAt} < now() - make_interval(secs => ${LEASE_MS / 1000})`;

// What a row says of progress, as the columns and not the schema keep it.
const columns = (progress: Progress) => ({
  step: progress.step,
  running: progress.running,
  error: progress.error,
  writing: progress.writing ?? null,
  activity: progress.activity ?? null,
});

// The job running under this key in this process, if there is one.
export const runningJob = <P extends Progress>(job: Named): P | null => {
  const current = held.get(heldKey(job)) as P | undefined;
  return current?.running ? current : null;
};

type Kept = Pick<
  typeof jobs.$inferSelect,
  'step' | 'running' | 'error' | 'writing' | 'activity' | 'holder'
> & { lapsed: boolean };

async function keptRow(job: Named): Promise<Kept | null> {
  const [row] = await (
    await database()
  )
    .select({
      step: jobs.step,
      running: jobs.running,
      error: jobs.error,
      writing: jobs.writing,
      activity: jobs.activity,
      holder: jobs.holder,
      lapsed: sql<boolean>`coalesce(${expired}, true)`,
    })
    .from(jobs)
    .where(whereJob(job));
  return row ?? null;
}

// What a row says, read through the kind's schema; a row that does not fit it
// is a job nobody can read, taken for none.
function progressOf<P extends Progress>(
  job: JobRecord<P>,
  row: Kept,
): P | null {
  const parsed = job.schema.safeParse({
    step: row.step,
    error: row.error,
    running: row.running,
    writing: row.writing,
    ...(row.activity ? { activity: row.activity } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export async function jobProgress<P extends Progress>(
  job: JobRecord<P>,
): Promise<P | null> {
  // A copy: the job changes the one held, and a reply built from it could
  // otherwise say finished beside work read before it finished.
  const current = held.get(heldKey(job)) as P | undefined;
  if (current) return { ...current };
  const row = await keptRow(job);
  const kept = row && progressOf(job, row);
  if (!row || !kept) return null;
  if (!kept.running) return kept;
  // Running in another process, on a lease it still renews: as it says.
  if (!row.lapsed && row.holder !== holderId()) return kept;
  // Running, but not here, and nothing renews it: it stopped with its process.
  return { ...kept, running: false, error: job.interrupted };
}

/*
  Takes the key, unless another holder has it on a lease that has not run out:
  an upsert that changes the row only where it is not running, is this
  process's own, or has lapsed. Returns the row's progress when another holder
  has it. A database that cannot be reached is no reason to refuse the job (it
  is held in memory all the same), so that is told apart: 'unrecorded'.
*/
async function claim<P extends Progress>(
  job: JobRecord<P>,
  progress: P,
): Promise<'held' | 'unrecorded' | { other: P | null }> {
  try {
    const db = await database();
    await ensureProcess(db, job.process);
    const taken = await db
      .insert(jobs)
      .values({
        process: job.process,
        kind: job.kind,
        key: job.key,
        ...columns(progress),
        holder: holderId(),
        heartbeatAt: sql`now()`,
        startedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [jobs.process, jobs.kind, jobs.key],
        set: {
          ...columns(progress),
          holder: holderId(),
          heartbeatAt: sql`now()`,
          startedAt: sql`now()`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`not ${jobs.running} or ${jobs.holder} = ${holderId()} or ${expired}`,
      })
      .returning({ holder: jobs.holder });
    if (taken.length) return 'held';
    const row = await keptRow(job);
    return { other: row && progressOf(job, row) };
  } catch {
    return 'unrecorded';
  }
}

// Runs the work unless a job is running under this key, in this process or
// in another on a live lease, recording progress before, during and after it;
// what it throws becomes the job's error. For a job running in another
// process what comes back is a copy of the progress that process has kept:
// nothing of it is held here, and a screen asking again reads it from there.
export async function startJob<P extends Progress>(
  job: JobRecord<P> & {
    initial: P;
    work: (progress: P, note: () => Promise<void>) => Promise<void>;
    // Clears what only means something while the job runs.
    settle?: (progress: P) => void;
  },
): Promise<P> {
  const running = runningJob<P>(job);
  if (running) return running;
  const progress = job.initial;
  const slot = heldKey(job);
  // Held before anything is awaited: a second start in this process, while
  // the claim is made, finds the job.
  held.set(slot, progress);
  const lease = await claim(job, progress);
  if (typeof lease === 'object') {
    // Another process has it. This one's copy only answers the starts that
    // arrived meanwhile, with what that process says.
    held.delete(slot);
    if (lease.other) Object.assign(progress, lease.other);
    return progress;
  }

  // Notes are written one after another, each as the job stands when its turn
  // comes, so a slow write cannot land after a later one. Only for the holder.
  let tail = Promise.resolve(true);
  const write = () =>
    (tail = tail.then(async () => {
      try {
        await (
          await database()
        )
          .update(jobs)
          .set({
            ...columns(progress),
            heartbeatAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(and(whereJob(job), eq(jobs.holder, holderId())));
        return true;
      } catch {
        return false;
      }
    }));
  // Recording is a convenience: a failed write never stops the job.
  const note = async () => {
    await write();
  };

  // The lease is renewed on a timer of its own, not with the notes: a model
  // call can take minutes without one. A failed renewal is not the job's
  // failure; the next one tries again.
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void (async () => {
      try {
        await (
          await database()
        )
          .update(jobs)
          .set({ heartbeatAt: sql`now()` })
          .where(
            and(
              whereJob(job),
              eq(jobs.holder, holderId()),
              eq(jobs.running, true),
            ),
          );
      } catch {
        // Tried again at the next beat.
      } finally {
        renewing = false;
      }
    })();
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  void (async () => {
    try {
      await job.work(progress, note);
    } catch (error) {
      progress.error =
        error instanceof Error ? error.message.split('\n')[0]! : 'Failed.';
    } finally {
      clearInterval(heartbeat);
      progress.running = false;
      job.settle?.(progress);
      // Held on only if the last word could not be kept: memory is then the
      // one place that says the job ended. Otherwise the row says it, and a
      // start in another process later is not hidden by this one's copy.
      if ((await write()) && held.get(slot) === progress) held.delete(slot);
    }
  })();
  return progress;
}
