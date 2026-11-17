import 'server-only';

import { randomUUID } from 'node:crypto';

import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';

import type { ProposalActivity } from '@/lib/definitions/types';
import { database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { JOB_KINDS, jobs } from '@/server/db/schema';
import { runner, type RunStatus } from '@/server/workflows/runner';

/*
  Server-only. The one place a background job is started and its progress
  read. The work is a Vercel Workflow run (server/workflows/), so a job
  carries on across a restart or a redeploy; the `jobs` row is its progress,
  which every screen reads, written by the run's steps as they go.

  Starting claims the key in the database first, so of two starts at once
  (two browsers, two instances) one starts a run: an upsert that changes the
  row only where no job is running, or where the one kept as running is
  over. The claim names itself (`holder`); the run is then started under the
  key's token, which at most one live run owns, and its id recorded. A step
  writes only while its claim or its run still holds the row, so a run that
  lost the key cannot write over the one that has it.

  Whether a job kept as running is running is its run's status, not a
  heartbeat: a run that ended without its last word, failed past its retries,
  or whose World no longer knows it, reads as interrupted, in the words of the
  job's kind. A claim that recorded no run within LEASE_MS was abandoned
  between the claim and the start, and reads as interrupted too; a start may
  take it over. A kind of job names its own key, schema and wording; nothing
  here knows what a job does.
*/

type Progress = {
  step: string;
  running: boolean;
  error: string | null;
  writing?: string | null | undefined;
  activity?: ProposalActivity | undefined;
};

// A job by its key: what a step is handed, to write its progress.
export type JobKey = {
  // Keeps one kind of job from taking another's key.
  kind: (typeof JOB_KINDS)[number];
  process: string;
  key: string;
};

export type JobRecord<P extends Progress> = JobKey & {
  schema: z.ZodType<P>;
  // Said of a job kept as running whose run is over or gone.
  interrupted: string;
};

// A claim that has recorded no run this long after it was made was abandoned
// between the claim and the start (its process stopped); a start takes it
// over. Judged by the database's clock, so instances whose clocks differ
// agree on it.
export const LEASE_MS = 60_000;
// A row written this recently is taken at its word; older, its run is asked.
const FRESH_MS = 10_000;

const whereJob = (job: JobKey) =>
  and(
    eq(jobs.process, job.process),
    eq(jobs.kind, job.kind),
    eq(jobs.key, job.key),
  );

const olderThan = (ms: number) =>
  sql`${jobs.heartbeatAt} < now() - make_interval(secs => ${ms / 1000})`;
const lapsed = sql`(${jobs.runId} is null and coalesce(${olderThan(LEASE_MS)}, true))`;

// What a row says of progress, as the columns and not the schema keep it.
const columns = (progress: Progress) => ({
  step: progress.step,
  running: progress.running,
  error: progress.error,
  writing: progress.writing ?? null,
  activity: progress.activity ?? null,
});

type Kept = Pick<
  typeof jobs.$inferSelect,
  'step' | 'running' | 'error' | 'writing' | 'activity' | 'holder' | 'runId'
> & { lapsed: boolean; fresh: boolean };

async function keptRow(job: JobKey): Promise<Kept | null> {
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
      runId: jobs.runId,
      lapsed: sql<boolean>`${lapsed}`,
      fresh: sql<boolean>`not coalesce(${olderThan(FRESH_MS)}, true)`,
    })
    .from(jobs)
    .where(whereJob(job));
  return row ?? null;
}

// What a row says, read through the kind's schema; a row that does not fit it
// is a job nobody can read, taken for none.
function progressOf<P extends Progress>(
  schema: z.ZodType<P>,
  row: Pick<Kept, 'step' | 'running' | 'error' | 'writing' | 'activity'>,
): P | null {
  const parsed = schema.safeParse({
    step: row.step,
    error: row.error,
    running: row.running,
    writing: row.writing,
    ...(row.activity ? { activity: row.activity } : {}),
  });
  return parsed.success ? parsed.data : null;
}

const live = (status: RunStatus) =>
  status === 'pending' || status === 'running';

/*
  Whether a row kept as running is: 'live' while its run is (or a claim is
  still young), 'over' once its run has ended or is gone, or the claim was
  abandoned. A World that cannot be asked cannot say it stopped: 'live'.
*/
async function standing(row: Kept): Promise<'live' | 'over'> {
  if (!row.runId) return row.lapsed ? 'over' : 'live';
  if (row.fresh) return 'live';
  try {
    return live(await runner().status(row.runId)) ? 'live' : 'over';
  } catch {
    return 'live';
  }
}

export async function jobProgress<P extends Progress>(
  job: JobRecord<P>,
): Promise<P | null> {
  const row = await keptRow(job);
  const kept = row && progressOf(job.schema, row);
  if (!row || !kept) return null;
  if (!kept.running || (await standing(row)) === 'live') return kept;
  // Kept as running, but nothing is doing it: it stopped part way.
  return { ...kept, running: false, error: job.interrupted };
}

/*
  Takes the key for a new start, unless a job is running under it: an upsert
  that changes the row only where it is not running, where its claim was
  abandoned, or where it still names the run seen to be over. Returns the
  claim's holder, or what the row says when another start has the key.
*/
export async function claimJob<P extends Progress>(
  job: JobRecord<P>,
  initial: P,
): Promise<{ holder: string } | { other: P | null }> {
  const db = await database();
  const before = await keptRow(job);
  let over: SQL | undefined;
  if (before?.running) {
    if ((await standing(before)) === 'live')
      return { other: progressOf(job.schema, before) };
    if (before.runId) over = eq(jobs.runId, before.runId);
  }
  await ensureProcess(db, job.process);
  const holder = randomUUID();
  const claimed = {
    ...columns(initial),
    holder,
    runId: null,
    heartbeatAt: sql`now()`,
    startedAt: sql`now()`,
  };
  const taken = await db
    .insert(jobs)
    .values({ process: job.process, kind: job.kind, key: job.key, ...claimed })
    .onConflictDoUpdate({
      target: [jobs.process, jobs.kind, jobs.key],
      set: { ...claimed, updatedAt: sql`now()` },
      setWhere: or(sql`not ${jobs.running}`, lapsed, over),
    })
    .returning({ holder: jobs.holder });
  if (taken.length) return { holder };
  const row = await keptRow(job);
  return { other: row && progressOf(job.schema, row) };
}

// Who may write a job's row: the claim that started it, or its run.
export type Fence = { holder: string; runId?: string | null };

const fenced = (job: JobKey, { holder, runId }: Fence) =>
  and(
    whereJob(job),
    runId
      ? or(eq(jobs.holder, holder), eq(jobs.runId, runId))
      : eq(jobs.holder, holder),
  );

// Records the run a claim started, or the run already holding the key's
// token, which then writes as the claim would.
export async function recordRun(job: JobKey, holder: string, runId: string) {
  await (
    await database()
  )
    .update(jobs)
    .set({ runId, heartbeatAt: sql`now()`, updatedAt: sql`now()` })
    .where(fenced(job, { holder }));
}

// The progress a step starts from, the row as it is whoever wrote it last,
// and when the job was claimed.
export async function readJob<P extends Progress>(
  job: JobKey,
  schema: z.ZodType<P>,
): Promise<{ progress: P | null; startedAt: Date } | null> {
  const [row] = await (
    await database()
  )
    .select()
    .from(jobs)
    .where(whereJob(job));
  return row
    ? { progress: progressOf(schema, row), startedAt: row.startedAt }
    : null;
}

/*
  Writes a job's progress, if the fence still holds the row; false when it
  does not (another start took the key over). A run names itself, so a run
  whose id the start could not record still holds its row.
*/
export async function noteJob(
  job: JobKey,
  fence: Fence,
  progress: Progress,
): Promise<boolean> {
  const written = await (
    await database()
  )
    .update(jobs)
    .set({
      ...columns(progress),
      ...(fence.runId
        ? { runId: sql`coalesce(${jobs.runId}, ${fence.runId})` }
        : {}),
      heartbeatAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(fenced(job, fence))
    .returning({ key: jobs.key });
  return written.length > 0;
}

// The token at most one live run of a key owns.
const tokenOf = ({ kind, process, key }: JobKey) =>
  `safepoint:${kind}:${process}:${key}`;

const firstLine = (error: unknown) =>
  error instanceof Error ? error.message.split('\n')[0]! : 'Failed.';

/*
  Starts a job unless one is running under its key, here or anywhere: claims
  the key, starts the workflow (given the claim's holder, which its steps
  write under) and records the run. A run already owning the key's token is
  recorded instead of a second one. A start that fails is the job's error.
  Returns the progress as it stands: the claim's own, or a copy of what the
  row says when another start has the key.
*/
export async function startJob<P extends Progress, I>(
  job: JobRecord<P> & {
    initial: P;
    workflow: (input: I) => Promise<unknown>;
    input: (holder: string) => NoInfer<I>;
    // Called once the key is held, before the run starts: for a test's
    // stand-ins, which are kept by the holder.
    held?: (holder: string) => void;
  },
): Promise<P> {
  const claim = await claimJob(job, job.initial);
  if ('other' in claim) return { ...job.initial, ...claim.other };
  const { holder } = claim;
  job.held?.(holder);
  try {
    const { runId } = await runner().start(
      job.workflow,
      [job.input(holder)],
      tokenOf(job),
    );
    await recordRun(job, holder, runId);
    return job.initial;
  } catch (error) {
    const stopped = { ...job.initial, running: false, error: firstLine(error) };
    await noteJob(job, { holder }, stopped);
    return stopped;
  }
}
