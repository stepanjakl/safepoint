import type { RunProgressStatus } from '@/components/app-shell/runs/run-progress';
import { modelRunAnnouncement } from '@/lib/shell/model-run';
import type { Application } from '@/lib/engine/types';

export function ordersRunStatus({
  latest,
  proposalReady,
  noWrites,
  application,
  stopped,
  held,
}: {
  latest: string;
  proposalReady: boolean;
  noWrites: boolean;
  application: Application['status'] | null | undefined;
  stopped: boolean;
  held: boolean;
}): RunProgressStatus {
  if (stopped) return 'failed';
  if (held) return 'held';
  if (latest === 'apply') {
    if (application === 'verified' || noWrites) return 'completed';
    if (application === 'mismatch' || application === 'pending') return 'held';
    return 'approved';
  }
  return latest === 'propose' && proposalReady ? 'awaiting_review' : 'running';
}

export function ordersAnnouncement(
  latest: string,
  status: RunProgressStatus,
  noWrites: boolean,
) {
  switch (status) {
    case 'awaiting_review':
      return modelRunAnnouncement('awaiting_review');
    case 'approved':
      return modelRunAnnouncement('ready_to_commit');
    case 'completed':
      return noWrites
        ? 'Everything decided. Nothing to write.'
        : modelRunAnnouncement('committed');
    case 'held':
      return 'The run needs attention.';
    case 'failed':
      return modelRunAnnouncement('stopped');
    case 'running':
      switch (latest) {
        case 'read':
          return modelRunAnnouncement('reading');
        case 'rules':
          return 'Inputs read. Reviewing the rules.';
        case 'calculate':
          return 'Rules accepted. Calculating values.';
        case 'propose':
          return 'Preparing the proposal.';
        default:
          return '';
      }
  }
}

/*
  The Rules step's flag for a draft that stopped: a few fixed words, so the
  pill keeps one size and says what to expect, whatever the service said.
  The service's own words are in the alert under the step.
*/
const STOPPED: [RegExp, string][] = [
  [/quota|rate.?limit|tokens per minute|too large|exceeded/i, 'out of quota'],
  [/high demand|overloaded|busy|unavailable|\b50[0-9]\b/i, 'models busy'],
  [
    /cannot connect|other side closed|timed? ?out|network|fetch failed|socket/i,
    'connection lost',
  ],
  [/interrupted|server stopped/i, 'interrupted'],
];

export function stoppedFlag(error: string): string {
  const reason = STOPPED.find(([pattern]) => pattern.test(error))?.[1];
  return `Stopped · ${reason ?? 'draft not usable'}`;
}
