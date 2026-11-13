import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { inScratchDirectory } from '@/lib/definitions/scratch.fixture';

import { writeKept } from '@/server/storage/files';

import { jobProgress, runningJob, startJob, type JobRecord } from './run-job';

// A job runs once under a key, is recorded before and after its work, and a
// kept "running" that nothing here holds is a job the server stopped.

const scratch = inScratchDirectory();

const schema = z.object({
  step: z.string(),
  error: z.string().nullable(),
  running: z.boolean(),
});
type Progress = z.infer<typeof schema>;

let serial = 0;
// A key of its own per test: held jobs outlive a test.
const record = (): JobRecord<Progress> => {
  serial += 1;
  return {
    kind: 'test',
    key: `job-${serial}`,
    file: path.join(scratch(), 'data', 'jobs', `job-${serial}.json`),
    schema,
    interrupted: 'The server stopped.',
  };
};
const kept = (job: JobRecord<Progress>) =>
  JSON.parse(readFileSync(job.file, 'utf8')) as Progress;
const begin = (): Progress => ({
  step: 'Starting',
  error: null,
  running: true,
});

const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
};
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('starting a job', () => {
  it('returns the running job for a second start, without running the work again', async () => {
    const job = record();
    const hold = gate();
    let started = 0;
    const work = async () => {
      started += 1;
      await hold.opened;
    };
    const first = startJob({ ...job, initial: begin(), work });
    const second = startJob({ ...job, initial: begin(), work });
    expect(second).toBe(first);
    expect(runningJob(job)).toBe(first);
    hold.open();
    await settled();
    expect(started).toBe(1);
    expect(runningJob(job)).toBeNull();
  });

  it('records progress before the work starts and after it ends', async () => {
    const job = record();
    const hold = gate();
    let before: Progress | null = null;
    const started = startJob({
      ...job,
      initial: begin(),
      work: async (progress) => {
        before = kept(job);
        progress.step = 'Done';
        await hold.opened;
      },
    });
    await settled();
    expect(before).toEqual({ step: 'Starting', error: null, running: true });
    expect(started.running).toBe(true);
    hold.open();
    await settled();
    expect(kept(job)).toEqual({ step: 'Done', error: null, running: false });
  });

  it('turns a thrown error into its first line, and stops running', async () => {
    const job = record();
    const progress = startJob({
      ...job,
      initial: begin(),
      work: async () => {
        throw new Error('It broke.\nThe rest is detail.');
      },
    });
    await settled();
    expect(progress).toMatchObject({ error: 'It broke.', running: false });
    expect(kept(job)).toMatchObject({ error: 'It broke.', running: false });
  });

  it('tidies on the way out, whether or not the work failed', async () => {
    const job = record();
    const progress = startJob({
      ...job,
      initial: { ...begin(), step: 'Busy' },
      work: async () => {
        throw new Error('No.');
      },
      settle: (p) => {
        p.step = 'Tidied';
      },
    });
    await settled();
    expect(progress.step).toBe('Tidied');
    expect(kept(job).step).toBe('Tidied');
  });

  it('writes compact progress on one line only when asked', async () => {
    const compact = record();
    const indented = record();
    for (const job of [{ ...compact, compact: true }, indented])
      startJob({ ...job, initial: begin(), work: async () => undefined });
    await settled();
    expect(readFileSync(compact.file, 'utf8')).not.toContain('\n');
    expect(readFileSync(indented.file, 'utf8')).toContain('\n  "step"');
  });
});

describe('reading progress', () => {
  it('reads a kept running job nothing holds as interrupted, in the caller’s words', async () => {
    const job = record();
    await writeKept(job.file, begin());
    expect(await jobProgress(job)).toEqual({
      step: 'Starting',
      error: 'The server stopped.',
      running: false,
    });
  });

  it('gives a finished kept job as it was, and null for none', async () => {
    const job = record();
    expect(await jobProgress(job)).toBeNull();
    const done = { step: 'Done', error: null, running: false };
    await writeKept(job.file, done);
    expect(await jobProgress(job)).toEqual(done);
  });

  it('gives a copy of the held job, not the one the work changes', async () => {
    const job = record();
    const hold = gate();
    const held = startJob({
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
    await settled();
  });

  it('keeps one kind of job from taking another’s key', async () => {
    const job = record();
    const hold = gate();
    startJob({ ...job, initial: begin(), work: async () => hold.opened });
    expect(runningJob({ kind: 'other', key: job.key })).toBeNull();
    hold.open();
    await settled();
  });
});
