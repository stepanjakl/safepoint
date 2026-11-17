import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { eventually, inScratchDatabase } from '@/lib/engine/scratch.fixture';
import { ensureProcess } from '@/server/db/scope';
import { jobs } from '@/server/db/schema';
import type { RunStatus } from '@/server/workflows/runner';

import {
  claimJob,
  jobProgress,
  LEASE_MS,
  noteJob,
  readJob,
  recordRun,
  startJob,
  type JobRecord,
} from './run-job';

// A job is claimed once under a key and done by one workflow run, whose
// status says whether a job kept as running still is. Under Vitest the run
// is the workflow function called in this process (server/workflows/runner.ts).

const db = inScratchDatabase();

const schema = z.object({
  step: z.string(),
  error: z.string().nullable(),
  running: z.boolean(),
});
type Progress = z.infer<typeof schema>;

const PROCESS = 'test-process';

let serial = 0;
// A key of its own per test: the runs a test starts outlive it.
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
const begin = (): Progress => ({
  step: 'Starting',
  error: null,
  running: true,
});

// The in-process runner's runs, for a test to say how one stands.
const runs = () =>
  ((
    globalThis as { safepointRunsInTests?: Map<string, RunStatus> }
  ).safepointRunsInTests ??= new Map());

// A row as another start left it, written `secondsAgo` ago.
async function keptBy(
  job: JobRecord<Progress>,
  {
    holder = 'another-claim',
    runId = null,
    secondsAgo,
    ...progress
  }: Partial<Progress> & {
    holder?: string;
    runId?: string | null;
    secondsAgo: number;
  },
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
      runId,
      heartbeatAt: sql`now() - make_interval(secs => ${secondsAgo})`,
      startedAt: sql`now() - make_interval(secs => ${secondsAgo})`,
    });
}

const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
};

// A workflow that writes its last word under the claim it was given, once
// let go.
const working = (job: JobRecord<Progress>, until: Promise<void>) => {
  const holders: string[] = [];
  const workflow = async ({ holder }: { holder: string }) => {
    holders.push(holder);
    await until;
    await noteJob(
      job,
      { holder },
      { step: 'Done', error: null, running: false },
    );
  };
  return { holders, workflow };
};

const started = (
  job: JobRecord<Progress>,
  workflow: (input: { holder: string }) => Promise<void>,
) =>
  startJob({
    ...job,
    initial: begin(),
    workflow,
    input: (holder) => ({ holder }),
  });

describe('starting a job', () => {
  it('starts one run for two starts at once; the second answers the first’s progress', async () => {
    const job = record();
    const hold = gate();
    const { holders, workflow } = working(job, hold.opened);
    const [first, second] = await Promise.all([
      started(job, workflow),
      started(job, workflow),
    ]);
    expect(holders).toHaveLength(1);
    expect(second).toEqual(first);
    const row = await rowOf(job);
    expect(row).toMatchObject({ running: true, holder: holders[0] });
    expect(row?.runId).toMatch(/^in-process-/);
    hold.open();
    await eventually(async () =>
      expect(await jobProgress(job)).toEqual({
        step: 'Done',
        error: null,
        running: false,
      }),
    );
  });

  it('says what stopped a start that could not start its run, and stops running', async () => {
    const job = record();
    const progress = await startJob({
      ...job,
      initial: begin(),
      // Not a workflow at all: what the runner throws is the job's error.
      workflow: undefined as never,
      input: () => ({}),
    });
    expect(progress).toMatchObject({
      running: false,
      error: expect.any(String),
    });
    expect(await jobProgress(job)).toMatchObject({
      running: false,
      error: progress.error,
    });
  });

  it('can be started again over a job that finished', async () => {
    const job = record();
    await keptBy(job, { secondsAgo: 5, running: false, step: 'Done' });
    const hold = gate();
    const { holders, workflow } = working(job, hold.opened);
    await started(job, workflow);
    expect(holders).toHaveLength(1);
    hold.open();
  });

  it('keeps one kind of job, or one process’s, from taking another’s key', async () => {
    const job = record();
    await keptBy(job, { secondsAgo: 0, runId: 'live' });
    runs().set('live', 'running');
    for (const other of [
      { ...job, kind: 'proposals' as const },
      { ...job, process: 'another-process' },
    ])
      expect(await claimJob(other, begin())).toHaveProperty('holder');
  });
});

describe('whether a job kept as running is', () => {
  it('follows its run once the row has not been written for a while', async () => {
    for (const [status, running] of [
      ['running', true],
      ['pending', true],
      ['completed', false],
      ['failed', false],
      ['cancelled', false],
      ['gone', false],
    ] as const) {
      const job = record();
      const runId = `run-${serial}`;
      if (status !== 'gone') runs().set(runId, status);
      await keptBy(job, { runId, secondsAgo: 30, step: 'Writing 2 of 5…' });
      expect(await jobProgress(job)).toEqual({
        step: 'Writing 2 of 5…',
        running,
        error: running ? null : 'The server stopped.',
      });
    }
  });

  it('takes a row just written at its word, without asking its run', async () => {
    const job = record();
    // A run nothing knows of: asked, it would read as stopped.
    await keptBy(job, { runId: 'unknown', secondsAgo: 0 });
    expect((await jobProgress(job))?.running).toBe(true);
  });

  it('reads a claim that never recorded a run as running, until its lease runs out', async () => {
    const young = record();
    await keptBy(young, { secondsAgo: 1 });
    expect((await jobProgress(young))?.running).toBe(true);
    const old = record();
    await keptBy(old, { secondsAgo: (2 * LEASE_MS) / 1000 });
    expect(await jobProgress(old)).toMatchObject({
      running: false,
      error: 'The server stopped.',
    });
  });

  it('gives a finished kept job as it was, and null for none', async () => {
    const job = record();
    expect(await jobProgress(job)).toBeNull();
    await keptBy(job, { secondsAgo: 600, running: false, step: 'Done' });
    expect(await jobProgress(job)).toEqual({
      step: 'Done',
      error: null,
      running: false,
    });
  });
});

describe('a start over a job kept as running', () => {
  it('is refused while its run is live, and answers the row', async () => {
    const job = record();
    runs().set('live-run', 'running');
    await keptBy(job, { runId: 'live-run', secondsAgo: 30, step: 'Busy' });
    expect(await claimJob(job, begin())).toEqual({
      other: { step: 'Busy', error: null, running: true },
    });
  });

  it('takes the key over once its run is over, or its claim was abandoned', async () => {
    const over = record();
    runs().set('failed-run', 'failed');
    await keptBy(over, { runId: 'failed-run', secondsAgo: 30 });
    const abandoned = record();
    await keptBy(abandoned, { secondsAgo: (2 * LEASE_MS) / 1000 });
    const young = record();
    await keptBy(young, { secondsAgo: 1 });
    for (const job of [over, abandoned]) {
      const claim = await claimJob(job, begin());
      expect(claim).toHaveProperty('holder');
      expect(await rowOf(job)).toMatchObject({
        holder: (claim as { holder: string }).holder,
        runId: null,
        running: true,
      });
    }
    expect(await claimJob(young, begin())).toHaveProperty('other');
  });
});

describe('writing progress', () => {
  it('is refused to a claim that lost the key, and taken from the run that holds it', async () => {
    const job = record();
    await keptBy(job, { holder: 'old-claim', secondsAgo: 120 });
    const claim = await claimJob(job, begin());
    if (!('holder' in claim)) throw new Error('Not claimed.');
    const said = { step: 'Late', error: null, running: true };
    expect(await noteJob(job, { holder: 'old-claim' }, said)).toBe(false);
    // The run that already owned the key's token is recorded for this claim,
    // and writes as itself.
    await recordRun(job, claim.holder, 'owning-run');
    expect(
      await noteJob(
        job,
        { holder: 'its-own-claim', runId: 'owning-run' },
        said,
      ),
    ).toBe(true);
    expect((await readJob(job, schema))?.progress).toEqual(said);
  });

  it('names its run on the row when the start could not', async () => {
    const job = record();
    const claim = await claimJob(job, begin());
    if (!('holder' in claim)) throw new Error('Not claimed.');
    await noteJob(job, { holder: claim.holder, runId: 'the-run' }, begin());
    expect((await rowOf(job))?.runId).toBe('the-run');
  });
});
