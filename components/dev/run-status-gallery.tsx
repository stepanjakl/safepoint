'use client';

import { runTone, toneMark } from '@/components/review/markers';
import { RunStatusIcon } from '@/components/ui/run-status-icon';
import {
  RUN_STATUS_LABELS,
  type ProcessRun,
  type RunStatus,
} from '@/lib/process/placeholder-process';
import { RunRow } from '@/components/app-shell/runs-list';

/*
  The run lifecycle, in the two places it is drawn and at the size that shows
  whether it is drawn well.

  Four things are being checked. That the nine states read as one family and
  not as nine icons -- the sequence column is for that. That each is legible at
  the 16px the row draws it, where a knocked-out mark is two pixels wide. That
  the whole row holds at the 232px the rail is, with the longest state name in
  it. And that the bar empties correctly: a settled run shows one green total,
  an open one shows what is in its way, and neither can be reached by accident.
*/

// In lifecycle order rather than alphabetical: the family is a sequence, and a
// sequence out of order cannot be judged.
const ORDER: RunStatus[] = [
  'queued',
  'running',
  'awaiting_review',
  'approved',
  'completed',
  'held',
  'failed',
  'superseded',
  'cancelled',
];

// Which are settled, and so drawn as a solid disc. Restated here rather than
// exported from the icon: this is the claim the gallery is testing, and a
// gallery that reads its answer from the thing it is testing tests nothing.
const SETTLED = new Set<RunStatus>([
  'awaiting_review',
  'completed',
  'held',
  'failed',
  'cancelled',
]);

/*
  One run per state, and the counts each state would plausibly carry -- a
  queued run has looked at nothing, a running one has a total but nothing
  resolved, a completed one has cleared what it was holding. The three days
  cycle so Today, Yesterday and a dated row are all on screen at once.
*/
const NOW = new Date();
const DAYS = [0, 1, 94];

function at(daysAgo: number, time: string): string {
  const day = new Date(NOW);
  day.setDate(day.getDate() - daysAgo);
  return `${day.toISOString().slice(0, 10)}T${time}:00+01:00`;
}

const COUNTS: Record<RunStatus, ProcessRun['counts']> = {
  queued: { items: 0 },
  running: { items: 18 },
  awaiting_review: { items: 27, blocked: 4, needsDecision: 6, deferred: 2 },
  approved: { items: 26 },
  completed: { items: 26 },
  held: { items: 22, blocked: 9 },
  failed: { items: 11, deferred: 11 },
  superseded: { items: 26, needsDecision: 2 },
  cancelled: { items: 4 },
};

const RUNS: ProcessRun[] = ORDER.map((status, index) => ({
  id: status,
  startedAt: at(DAYS[index % DAYS.length]!, `0${(index % 8) + 1}:15`),
  status,
  trigger: index % 3 === 1 ? 'manual' : index % 3 === 2 ? 'rerun' : 'schedule',
  counts: COUNTS[status],
  duration: status === 'queued' ? undefined : '1m 24s',
  progress: status === 'running' ? { at: 2, of: 3 } : undefined,
  decidedBy: SETTLED.has(status) ? 'Maya' : undefined,
  instructionsVersion: 'v4',
  current: status === 'awaiting_review',
}));

export function RunStatusGallery() {
  return (
    <div className="grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)_auto]">
      {/* The rail at its real width, so a state whose name does not fit shows
          up here rather than in the app. */}
      <div className="border-rule-default bg-surface-primary overflow-hidden border">
        <div className="sheet-head">
          <p className="readout text-muted">runs · every state</p>
        </div>
        <ol className="sheet-list">
          {RUNS.map((run) => (
            <li key={run.id}>
              <RunRow run={run} noun="item" />
            </li>
          ))}
        </ol>
      </div>

      <div className="border-rule-default bg-surface-primary overflow-x-auto border">
        <table className="w-full min-w-[26rem] text-left">
          <thead>
            <tr className="border-rule-faint text-muted readout border-b">
              <th className="px-4 py-2 font-normal">state</th>
              <th className="px-4 py-2 font-normal">40px</th>
              <th className="px-4 py-2 font-normal">16px</th>
              <th className="px-4 py-2 font-normal">chassis</th>
              <th className="px-4 py-2 font-normal">tone</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((status) => {
              const tone = runTone[status];
              return (
                <tr
                  key={status}
                  className="border-rule-faint border-b last:border-b-0"
                >
                  <td className="text-dense px-4 py-3">
                    {RUN_STATUS_LABELS[status]}
                  </td>
                  <td className="px-4 py-3" style={{ color: toneMark[tone] }}>
                    <RunStatusIcon status={status} size={40} />
                  </td>
                  <td className="px-4 py-3" style={{ color: toneMark[tone] }}>
                    <RunStatusIcon status={status} size={16} />
                  </td>
                  <td className="text-meta text-muted px-4 py-3">
                    {SETTLED.has(status) ? 'disc' : 'ring'}
                  </td>
                  <td className="text-meta text-muted px-4 py-3">{tone}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The family with nothing beside it: a sequence read straight down is
          the only way to see whether one of them is a stranger. */}
      <div className="border-rule-default bg-surface-primary grid content-start gap-4 border p-4">
        <p className="readout text-muted">the sequence</p>
        <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-start">
          {ORDER.map((status) => (
            <span
              key={status}
              className="flex items-center gap-2"
              style={{ color: toneMark[runTone[status]] }}
            >
              <RunStatusIcon status={status} size={20} />
              <span className="text-meta text-muted">
                {RUN_STATUS_LABELS[status]}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
