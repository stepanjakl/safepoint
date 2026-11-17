import 'server-only';

import { randomUUID } from 'node:crypto';

/*
  Server-only. The one place a job's workflow run is started and its status
  read (server/jobs/run-job.ts asks). Under the app it is Vercel Workflow:
  the Local World in development, the Vercel World when deployed. A start
  names a token, the job's key, which at most one live run owns: a second
  start under it is refused with the owner's run id, so two starts that got
  past the database's claim still make one run (Workflow's
  `experimental_hook`, admitted with the run in one atomic step).

  Under Vitest the directives are not compiled and `start` cannot run, so a
  test gets the same contract in this process: the workflow function is
  called as it is, its steps as plain functions, one live run per token.
*/

export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  // No run of this id is known: its World's data is gone.
  | 'gone';

type Workflow<A extends unknown[]> = (...args: A) => Promise<unknown>;

export type Runner = {
  // The run that owns the token: this start's, or the one already there.
  start<A extends unknown[]>(
    workflow: Workflow<A>,
    args: A,
    token: string,
  ): Promise<{ runId: string; started: boolean }>;
  status(runId: string): Promise<RunStatus>;
};

const workflows: Runner = {
  async start(workflow, args, token) {
    const { start } = await import('workflow/api');
    const { HookConflictError } = await import('workflow/errors');
    try {
      const run = await start(workflow, args, {
        experimental_hook: { token },
      });
      return { runId: run.runId, started: true };
    } catch (error) {
      if (HookConflictError.is(error) && error.conflictingRunId)
        return { runId: error.conflictingRunId, started: false };
      throw error;
    }
  },
  async status(runId) {
    const { getRun } = await import('workflow/api');
    const { WorkflowRunNotFoundError } = await import('workflow/errors');
    try {
      return await getRun(runId).status;
    } catch (error) {
      if (WorkflowRunNotFoundError.is(error)) return 'gone';
      throw error;
    }
  },
};

// Held on globalThis, as the database is (server/db/client.ts).
const server = globalThis as {
  safepointRunsInTests?: Map<string, RunStatus>;
  safepointTokensInTests?: Map<string, string>;
};

const inProcess: Runner = {
  async start(workflow, args, token) {
    const runs = (server.safepointRunsInTests ??= new Map());
    const tokens = (server.safepointTokensInTests ??= new Map());
    const owner = tokens.get(token);
    if (owner && runs.get(owner) === 'running')
      return { runId: owner, started: false };
    const runId = `in-process-${randomUUID()}`;
    runs.set(runId, 'running');
    tokens.set(token, runId);
    void workflow(...args).then(
      () => runs.set(runId, 'completed'),
      () => runs.set(runId, 'failed'),
    );
    return { runId, started: true };
  },
  async status(runId) {
    return server.safepointRunsInTests?.get(runId) ?? 'gone';
  },
};

export const runner = (): Runner =>
  process.env.VITEST ? inProcess : workflows;
