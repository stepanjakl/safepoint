import 'server-only';

import { draftProgressByHash } from '@/server/jobs/draft';
import { proposalProgress } from '@/server/jobs/proposal';
import type { KeptRun } from '@/server/storage/runs/runs';

import type { RunProcess } from './kept-processes';

/*
  What a run kept as running is doing: a job working for it, or nothing,
  waiting for a person at a step. Only where a person moves the run step by
  step and its step can be read from what the server keeps (a rulebook
  process): no read yet is Read, a read without a pinned rulebook is Rules,
  a pinned rulebook is Propose. Elsewhere the run says nothing more than its
  status. The jobs are the ones those steps start: a draft of rules under
  the run's instructions, a proposal on its read and rulebook.
*/
export type RunActivity = { working: true } | { working: false; at: string };

export async function runActivities(
  kept: RunProcess,
  runs: KeptRun[],
): Promise<Map<string, RunActivity>> {
  const activities = new Map<string, RunActivity>();
  if (kept.runs.evaluation !== 'rules') return activities;
  const owner = kept.runs.definitions;
  // Runs under one version share its draft job, and runs on one read and
  // rulebook share a proposal: each is asked once.
  const asked = new Map<string, Promise<boolean>>();
  const working = (
    key: string,
    ask: () => Promise<{ running: boolean } | null>,
  ) => {
    if (!asked.has(key))
      asked.set(
        key,
        ask().then(
          (progress) => progress?.running === true,
          () => false,
        ),
      );
    return asked.get(key)!;
  };
  await Promise.all(
    runs
      .filter((run) => run.status === 'running' && run.discardedAt === null)
      .map(async (run) => {
        const at =
          run.readId === null
            ? 'read'
            : run.rulebook === null
              ? 'rules'
              : 'propose';
        const busy =
          at === 'rules'
            ? await working(`drafts:${run.instructions.hash}`, () =>
                draftProgressByHash(owner, run.instructions.hash),
              )
            : at === 'propose' && run.readId && run.rulebook
              ? await working(`proposals:${run.readId}:${run.rulebook}`, () =>
                  proposalProgress(owner, run.readId!, run.rulebook!),
                )
              : false;
        activities.set(
          run.id,
          busy ? { working: true } : { working: false, at },
        );
      }),
  );
  return activities;
}
