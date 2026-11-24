import 'server-only';

import { complete } from '@/lib/engine/types';
import { draftProgressByHash } from '@/server/jobs/draft';
import { proposalProgress } from '@/server/jobs/proposal';
import { currentProposalOf, runKeyOf } from '@/server/storage/reads/proposals';
import { versionByHash } from '@/server/storage/rules/instructions';
import { loadSet } from '@/server/storage/rules/rulebooks';
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

  A job that ended with an error, and left the step undone, has stopped the
  run (`stopped`), as the run's screen says when it is open: so the list
  says so too, without the run being opened first.
*/
export type RunActivity =
  { working: true } | { working: false; at: string; stopped?: true };

type Asked = { running: boolean; error: string | null } | null;

export async function runActivities(
  kept: RunProcess,
  runs: KeptRun[],
): Promise<Map<string, RunActivity>> {
  const activities = new Map<string, RunActivity>();
  if (kept.runs.evaluation !== 'rules') return activities;
  const owner = kept.runs.definitions;
  // Runs under one version share its draft job, and runs on one read and
  // rulebook share a proposal: each is asked once.
  const asked = new Map<string, Promise<Asked>>();
  const progressOf = (key: string, ask: () => Promise<Asked>) => {
    if (!asked.has(key))
      asked.set(
        key,
        ask().catch(() => null),
      );
    return asked.get(key)!;
  };
  // Whether the step a job ended with an error at is still undone.
  const rulesUndone = async (run: KeptRun) => {
    const version = await versionByHash(kept, run.instructions.hash);
    if (!version) return false;
    const set = await loadSet(
      owner,
      run.ownRulebook ? { text: version.text, run: run.id } : version.text,
    );
    return !set || !complete(set);
  };
  const proposalUndone = async (run: KeptRun) =>
    !(await currentProposalOf(runKeyOf(owner, run.readId!, run.rulebook!)));
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
        const progress =
          at === 'rules'
            ? await progressOf(
                `drafts:${run.instructions.hash}:${run.ownRulebook ? run.id : ''}`,
                () =>
                  draftProgressByHash(
                    owner,
                    run.instructions.hash,
                    run.ownRulebook ? run.id : null,
                  ),
              )
            : at === 'propose' && run.readId && run.rulebook
              ? await progressOf(
                  `proposals:${run.readId}:${run.rulebook}`,
                  () => proposalProgress(owner, run.readId!, run.rulebook!),
                )
              : null;
        if (progress?.running) {
          activities.set(run.id, { working: true });
          return;
        }
        const stopped =
          Boolean(progress?.error) &&
          (await (
            at === 'rules' ? rulesUndone(run) : proposalUndone(run)
          ).catch(() => false));
        activities.set(
          run.id,
          stopped
            ? { working: false, at, stopped: true }
            : { working: false, at },
        );
      }),
  );
  return activities;
}
