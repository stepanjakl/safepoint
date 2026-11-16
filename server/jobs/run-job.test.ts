import { and, eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  eventually,
  inScratchDatabase,
  rowsOf,
} from '@/lib/definitions/scratch.fixture';
import { ensureProcess } from '@/server/db/scope';
import { jobs } from '@/server/db/schema';

import {
  HEARTBEAT_MS,
  holderId,
  jobProgress,
  LEASE_MS,
  runningJob,
  startJob,
  type JobRecord,
} from './run-job';

// A job runs once under a key, is recorded before and after its work, and a
// kept "running" that nothing holds, or whose lease has run out, is a job the
// server stopped.

const db = inScratchDatabase();

const schema = z.object({
  step: z.string(),
  error: z.string().nullable(),
  running: z.boolean(),
});
type Progress = z.infer<typeof schema>;

const PROCESS = 'test-process';
const ANOTHER = 'another-process-7f3a';

let serial = 0;
// A key of its own per test: held jobs outlive a test.
const record = (): JobRecord<Progress> => {
  serial += 1;
  return {
    kind: 'drafts',
    process: PROCESS,
    key: `job-${serial}`,
    schema,
    interrupted: 'The server stopped.',
  };
};
const rowOf = async (job: JobRecord<Progress>) => {
  const [row] = await db()
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.process, job.process),
        eq(jobs.kind, job.kind),
        eq(jobs.key, job.key),
      ),
    );
  return row;
};
const kept = async (job: JobRecord<Progress>) => {
  const row = await rowOf(job);
  return row && { step: row.step, error: row.error, running: row.running };
};
const begin = (): Progress => ({
  step: 'Starting',
  error: null,
  running: true,
});

// A row as another process left it, its lease renewed `secondsAgo` ago.
async function keptBy(
  job: JobRecord<Progress>,
  {
    holder = ANOTHER,
    secondsAgo,
    ...progress
  }: Partial<Progress> & { holder?: string; secondsAgo: number },
) {
  await ensureProcess(db(), job.process);
  await db()
    .insert(jobs)
    .values({
      process: job.process,
      kind: job.kind,
      key: job.key,
      ...begin(),
      ...progress,
      holder,
      heartbeatAt: sql`now() - make_interval(secs => ${secondsAgo})`,
      startedAt: sql`now() - make_interval(secs => ${secondsAgo})`,
    });
}

const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
};
// Until the job's last record is kept: a fixed wait is not long enough when
// the suite is busy, and failed there.
const finished = (job: JobRecord<Progress>) =>
  eventually(async () => expect((await kept(job))?.running).toBe(false));

afterEach(() => vi.useRealTimers());

describe('starting a job', () => {
  it('returns the running job for a second start, without running the work again', async () => {
    const job = record();
    const hold = gate();
    let started = 0;
    const work = async () => {
      started += 1;
      await hold.opened;
    };
    const firstStart = startJob({ ...job, initial: begin(), work });
    const secondStart = startJob({ ...job, initial: begin(), work });
    const first = await firstStart;
    expect(await secondStart).toBe(first);
    expect(runningJob(job)).toBe(first);
    hold.open();
    await finished(job);
    expect(started).toBe(1);
    expect(runningJob(job)).toBeNull();
  });

  it('records progress before the work starts and after it ends', async () => {
    const job = record();
    const hold = gate();
    let before: Progress | undefined;
    const started = await startJob({
      ...job,
      initial: begin(),
      work: async (progress) => {
        before = await kept(job);
        progress.step = 'Done';
        await hold.opened;
      },
    });
    await eventually(() =>
      expect(before).toEqual({ step: 'Starting', error: null, running: true }),
    );
    expect(started.running).toBe(true);
    hold.open();
    await finished(job);
    expect(await kept(job)).toEqual({
      step: 'Done',
      error: null,
      running: false,
    });
  });

  it('turns a thrown error into its first line, and stops running', async () => {
    const job = record();
    const progress = await startJob({
      ...job,
      initial: begin(),
      work: async () => {
        throw new Error('It broke.\nThe rest is detail.');
      },
    });
    await finished(job);
    expect(progress).toMatchObject({ error: 'It broke.', running: false });
    expect(await kept(job)).toMatchObject({
      error: 'It broke.',
      running: false,
    });
  });

  it('tidies on the way out, whether or not the work failed', async () => {
    const job = record();
    const progress = await startJob({
      ...job,
      initial: { ...begin(), step: 'Busy' },
      work: async () => {
        throw new Error('No.');
      },
      settle: (p) => {
        p.step = 'Tidied';
      },
    });
    await finished(job);
    expect(progress.step).toBe('Tidied');
    expect((await kept(job))?.step).toBe('Tidied');
  });

  it('keeps the progress as columns, one holder for the whole process', async () => {
    const job = record();
    const hold = gate();
    await startJob({
      ...job,
      initial: begin(),
      work: async () => hold.opened,
    });
    const row = await rowOf(job);
    expect(row).toMatchObject({ running: true, holder: holderId() });
    expect(row?.heartbeatAt).toBeInstanceOf(Date);
    hold.open();
    await finished(job);
    expect(holderId()).toBe(holderId());
  });
});

describe('reading progress', () => {
  it('reads a kept running job nothing holds as interrupted, in the caller’s words', async () => {
    const job = record();
    await keptBy(job, { secondsAgo: LEASE_MS / 1000 + 5 });
    expect(await jobProgress(job)).toEqual({
      step: 'Starting',
      error: 'The server stopped.',
      running: false,
    });
  });

  it('reads one this process once held, and no longer holds, as interrupted too', async () => {
    const job = record();
    await keptBy(job, { holder: holderId(), secondsAgo: 1 });
    expect(await jobProgress(job)).toMatchObject({
      running: false,
      error: 'The server stopped.',
    });
  });

  it('gives a finished kept job as it was, and null for none', async () => {
    const job = record();
    expect(await jobProgress(job)).toBeNull();
    await keptBy(job, {
      step: 'Done',
      error: null,
      running: false,
      secondsAgo: 5,
    });
    expect(await jobProgress(job)).toEqual({
      step: 'Done',
      error: null,
      running: false,
    });
  });

  it('gives a copy of the held job, not the one the work changes', async () => {
    const job = record();
    const hold = gate();
    const held = await startJob({
      ...job,
      initial: begin(),
      work: async () => hold.opened,
    });
    const read = await jobProgress(job);
    expect(read).toEqual(held);
    expect(read).not.toBe(held);
    held.step = 'Later';
    expect(read!.step).toBe('Starting');
    hold.open();
    await finished(job);
  });

  it('keeps one kind of job from taking another’s key', async () => {
    const job = record();
    const hold = gate();
    await startJob({ ...job, initial: begin(), work: async () => hold.opened });
    expect(runningJob({ ...job, kind: 'proposals' })).toBeNull();
    expect(await jobProgress({ ...job, kind: 'proposals' })).toBeNull();
    hold.open();
    await finished(job);
  });

  it('keeps one process’s job from another’s of the same key', async () => {
    const job = record();
    const hold = gate();
    await startJob({ ...job, initial: begin(), work: async () => hold.opened });
    expect(runningJob({ ...job, process: 'someone-else' })).toBeNull();
    hold.open();
    await finished(job);
  });
});

describe('a job held by another process', () => {
  it('is not started a second time while its lease is live, and reads as running', async () => {
    const job = record();
    await keptBy(job, { step: 'Writing 2 of 5…', secondsAgo: 10 });
    const work = vi.fn(async () => undefined);
    const answered = await startJob({ ...job, initial: begin(), work });
    // What the other process has kept, not an object of this one's.
    expect(answered).toEqual({
      step: 'Writing 2 of 5…',
      error: null,
      running: true,
    });
    expect(runningJob(job)).toBeNull();
    expect(await jobProgress(job)).toEqual(answered);
    expect(work).not.toHaveBeenCalled();
    expect(await rowOf(job)).toMatchObject({ holder: ANOTHER, running: true });
  });

  it('reads as interrupted once its lease has run out, and can then be started again', async () => {
    const job = record();
    await keptBy(job, { secondsAgo: LEASE_MS / 1000 + 1 });
    expect(await jobProgress(job)).toMatchObject({
      running: false,
      error: 'The server stopped.',
    });
    const work = vi.fn(async (progress: Progress) => {
      progress.step = 'Taken over';
    });
    await startJob({ ...job, initial: begin(), work });
    await finished(job);
    expect(work).toHaveBeenCalledOnce();
    expect(await rowOf(job)).toMatchObject({
      holder: holderId(),
      step: 'Taken over',
      running: false,
      error: null,
    });
  });

  it('can be started again over a job that finished', async () => {
    const job = record();
    await keptBy(job, { running: false, secondsAgo: 1 });
    const work = vi.fn(async () => undefined);
    await startJob({ ...job, initial: begin(), work });
    await finished(job);
    expect(work).toHaveBeenCalledOnce();
  });
});

describe('the lease', () => {
  // Only the timer is faked: the database goes on in real time, and its clock
  // is the one the lease is judged by.
  const fakeTimer = () =>
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const heartbeatAge = async (job: JobRecord<Progress>) => {
    const [row] = await rowsOf<{ age: string }>(
      db(),
      sql`select extract(epoch from now() - heartbeat_at)::text as age from jobs
        where process = ${job.process} and kind = ${job.kind} and key = ${job.key}`,
    );
    return Number(row!.age);
  };
  const lapse = (job: JobRecord<Progress>) =>
    db().execute(sql`
      update jobs set heartbeat_at = now() - make_interval(secs => ${LEASE_MS / 1000 - 5})
      where process = ${job.process} and kind = ${job.kind} and key = ${job.key}`);

  it('is renewed while a long piece of work runs, with no note from it', async () => {
    fakeTimer();
    const job = record();
    const hold = gate();
    await startJob({
      ...job,
      initial: begin(),
      // A model call of minutes: it says nothing meanwhile.
      work: async () => hold.opened,
    });
    // Near the end of its lease, as it would be a minute into the call.
    await lapse(job);
    expect(await heartbeatAge(job)).toBeGreaterThan(LEASE_MS / 1000 - 10);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await eventually(async () =>
      expect(await heartbeatAge(job)).toBeLessThan(LEASE_MS / 1000 / 4),
    );
    // Still its own, and still running, however long it goes on.
    await lapse(job);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 4);
    await eventually(async () =>
      expect(await heartbeatAge(job)).toBeLessThan(LEASE_MS / 1000 / 4),
    );
    expect(await rowOf(job)).toMatchObject({
      holder: holderId(),
      running: true,
      step: 'Starting',
    });
    hold.open();
    await finished(job);
  });

  it('is no longer renewed once the job has ended', async () => {
    fakeTimer();
    const job = record();
    await startJob({
      ...job,
      initial: begin(),
      work: async () => undefined,
    });
    await finished(job);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not stop the job when a renewal fails, and is renewed at the next beat', async () => {
    fakeTimer();
    const job = record();
    const hold = gate();
    let result = 'unfinished';
    await startJob({
      ...job,
      initial: begin(),
      work: async (progress) => {
        await hold.opened;
        progress.step = 'Done';
        result = 'finished';
      },
    });
    await lapse(job);
    const failing = vi.spyOn(db(), 'update').mockImplementation(() => {
      throw new Error('connection lost');
    });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await eventually(() => expect(failing).toHaveBeenCalled());
    failing.mockRestore();
    expect(await rowOf(job)).toMatchObject({ running: true });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await eventually(async () =>
      expect(await heartbeatAge(job)).toBeLessThan(LEASE_MS / 1000 / 4),
    );
    hold.open();
    await finished(job);
    expect(result).toBe('finished');
    expect(await kept(job)).toEqual({
      step: 'Done',
      error: null,
      running: false,
    });
  });
});

describe('a database that fails', () => {
  it('never stops the job when a progress write fails, and says how it ended from memory', async () => {
    const job = record();
    const hold = gate();
    const failing = vi.spyOn(db(), 'update').mockImplementation(() => {
      throw new Error('connection lost');
    });
    const progress = await startJob({
      ...job,
      initial: begin(),
      work: async (p, note) => {
        p.step = 'Halfway';
        await note();
        await hold.opened;
        p.step = 'Done';
        await note();
      },
    });
    hold.open();
    await eventually(() => expect(progress.running).toBe(false));
    expect(progress).toMatchObject({ step: 'Done', error: null });
    // The row never heard the end; this process still knows it.
    expect(await rowOf(job)).toMatchObject({ running: true });
    expect(await jobProgress(job)).toMatchObject({
      step: 'Done',
      running: false,
    });
    failing.mockRestore();
  });

  it('runs the work all the same when the job cannot be recorded at its start', async () => {
    const job = record();
    const failing = vi.spyOn(db(), 'insert').mockImplementation(() => {
      throw new Error('connection lost');
    });
    const work = vi.fn(async (p: Progress) => {
      p.step = 'Done';
    });
    const progress = await startJob({ ...job, initial: begin(), work });
    failing.mockRestore();
    await eventually(() => expect(progress.running).toBe(false));
    expect(work).toHaveBeenCalledOnce();
    expect(progress.step).toBe('Done');
  });
});
