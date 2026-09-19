'use client';

import { styleDebug } from '@/lib/style-debug';
import type { CSSProperties } from 'react';
// Deep imports: Blode's barrel is the whole icon library.
import ArrowRotateClockwise from 'blode-icons-react/icons/arrow-rotate-clockwise-filled';
import Clock from 'blode-icons-react/icons/clock-filled';
import Cursor from 'blode-icons-react/icons/cursor-1-filled';
import { Glyph } from '@/components/ui/glyph';
import { RunStatusIcon } from '@/components/ui/run-status-icon';
import { outcomeMarker, runTone, toneVar } from '@/components/review/markers';
import {
  RUN_STATUS_LABELS,
  RUN_TRIGGER_LABELS,
  type ProcessRun,
  type RunStatus,
  type RunTrigger,
} from '@/lib/process/placeholder-process';
import { runDay, runStamp, runTime } from '@/lib/process/run-time';

/*
  One run, in two lines and four pieces.

  Top left, the day, named where a name is more use than a date. Top right, the
  state: at one size, in one place on every row, so a reader scanning the rail
  tracks a single point rather than hunting a mark whose position moves with
  the text around it. Bottom left, when it ran and what started it -- a glyph
  rather than a word, because the trigger is a fact nobody acts on and it was
  the widest thing in the row for the least said. Bottom right, the release as
  a bar.

  A grid rather than stacked rows: the four pieces sit on two rows and two
  columns, and the column edges have to line up -- day over time on the left,
  state over bar on the right, both right-hand cells ending on the row's inset.

  What is deliberately not here: how long it ran, who decided it, the trigger
  in words, and the version it ran under. The first two belong in the run, not
  in the index that points at it; the third is said by the glyph and spelled
  out in the row's label; the fourth is on the boundary between runs in the
  list, which is where a change of instructions actually happened. All four are
  in the label, so nothing is lost to a screen reader.
*/
export function RunRow({
  run,
  noun,
  selected = run.current === true,
  onSelect,
}: {
  run: ProcessRun;
  noun: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const tone = runTone[run.status];
  const status = RUN_STATUS_LABELS[run.status];
  const TriggerIcon = TRIGGER_ICON[run.trigger];
  const trigger = RUN_TRIGGER_LABELS[run.trigger];
  const stamp = runStamp(run.startedAt);

  return (
    /*
      One control for the whole row: the row is the thing a reader is pointing
      at, so it is the thing that answers the pointer, takes focus and reads
      aloud. Everything inside it is hidden from the accessibility tree and
      described by the row's own label instead.

      No tooltip. It carried the state, which is printed in the corner of the
      row already, and popped over the thread on every row the pointer crossed.
      What it alone held -- how long the run took and who decided it -- belongs
      in the run rather than in the index that points at it, and the label
      below still says all of it to a screen reader.
    */
    <button
      type="button"
      {...styleDebug({ component: 'RunRow', appearance: 'sheet-row' })}
      className="sheet-row"
      onClick={onSelect}
      aria-label={announce(run, noun, status, trigger, stamp)}
      aria-pressed={onSelect ? selected : undefined}
      data-current={selected ? '' : undefined}
      data-run-status={run.status}
      aria-current={onSelect ? undefined : selected ? 'true' : undefined}
    >
      {/* Mono, so the day and the time under it set on one measure. It is a
            word half the time -- Today, Yesterday -- but it is read as a stamp
            either way, and a proportional day over a tabular time made two
            columns out of one fact. */}
      <span aria-hidden="true" className="sheet-row-day value">
        {runDay(run.startedAt)}
      </span>
      <span
        aria-hidden="true"
        {...styleDebug({
          component: 'RunRow',
          part: 'status',
          appearance: 'sheet-row-status',
        })}
        className="sheet-row-status text-meta"
        style={
          {
            // One colour for the state, in every row state; see
            // `.sheet-row-status` in components.css for why it holds.
            '--sheet-status': toneVar[tone],
          } as CSSProperties
        }
      >
        {status}
        <RunStatusIcon status={run.status} size={16} />
      </span>
      <span aria-hidden="true" className="sheet-row-when">
        <TriggerIcon size={11} className="flex-none" />
        <span className="value text-micro tracking-wider">{runTime(run.startedAt)}</span>
      </span>
      <Tally
        counts={run.counts}
        settled={SETTLED_WELL.has(run.status)}
        noun={noun}
      />
    </button>
  );
}

const TRIGGER_ICON: Record<RunTrigger, typeof Clock> = {
  schedule: Clock,
  manual: Cursor,
  rerun: ArrowRotateClockwise,
};

/*
  What is in the way, in the process menu's own order and words -- see
  ProcessStatusContent in process-menu.tsx, which lists the same three counts
  for the same run. Blocked first, because that is the one nobody can act
  around. The order is fixed rather than sorted by size: segments that reorder
  themselves are a chart, not a status.
*/
const BLOCKING = [
  // `severity` is the review's own bucket number, which is what carries the
  // colour: see the [data-severity] rules in components.css.
  { key: 'blocked', outcome: 'held', severity: '0', label: 'blocked' },
  {
    key: 'needsDecision',
    outcome: 'needs_attention',
    severity: '1',
    label: 'need a decision',
  },
  { key: 'deferred', outcome: 'excluded', severity: '2', label: 'deferred' },
] as const;

/*
  Whether the bar still has anything in it. A run that was approved and applied
  has resolved whatever it was holding -- that is what approving it meant -- so
  its bar is the total alone. A run still open shows what is in the way, and a
  run that was never decided shows what it was still carrying when something
  else overtook it.
*/
const SETTLED_WELL = new Set<RunStatus>(['approved', 'completed']);

/*
  The release as a bar: what is in the way, then what it is all out of.

  The total is not one of the outcomes and never takes a tone from them: it is
  how many the run looked at, and it stays neutral whatever the run did. A run
  that came through simply has nothing in the way, so the total is all that is
  left -- which says it without borrowing a colour that would then have to be
  told apart from the four that mean something.
*/
function Tally({
  counts,
  settled,
  noun,
}: {
  counts: ProcessRun['counts'];
  settled: boolean;
  noun: string;
}) {
  const segments = settled
    ? []
    : BLOCKING.map((entry) => ({ ...entry, value: counts[entry.key] })).filter(
        (entry): entry is (typeof BLOCKING)[number] & { value: number } =>
          Boolean(entry.value),
      );
  // A run with nothing counted yet -- queued, or only just started -- has no
  // bar to draw, and an empty pill reading 0 is worse than no pill.
  if (!counts.items) return null;

  return (
    // Outcome segments followed by a separate, explicitly labelled total.
    <span
      aria-hidden="true"
      {...styleDebug({
        component: 'RunRow',
        part: 'tally',
        appearance: 'sheet-tally',
      })}
      className="sheet-tally text-micro"
    >
      {segments.map((entry) => {
        const marker = outcomeMarker[entry.outcome];
        return (
          <span
            key={entry.key}
            {...styleDebug({
              component: 'RunRow',
              part: 'tally-segment',
              appearance: 'sheet-seg',
            })}
            className="sheet-seg"
            data-severity={entry.severity}
          >
            <Glyph name={marker.glyph} size={8} />
            <span className="value">{entry.value}</span>
          </span>
        );
      })}
      <span
        {...styleDebug({
          component: 'RunRow',
          part: 'tally-total',
          appearance: 'sheet-seg-total',
        })}
        className="sheet-seg sheet-seg-total font-semibold"
      >
        {segments.length > 0 ? <span className="opacity-75">of</span> : null}
        <span className="value">{counts.items}</span>
        {segments.length === 0 ? (
          <span className="opacity-75">
            {noun}
            {counts.items === 1 ? '' : 's'}
          </span>
        ) : null}
      </span>
    </span>
  );
}

// The row read aloud, in the order it is read by eye: state, when, why, then
// what it produced.
function announce(
  run: ProcessRun,
  noun: string,
  status: string,
  trigger: string,
  stamp: string,
): string {
  const parts = [
    `${run.counts.items} ${noun}${run.counts.items === 1 ? '' : 's'}`,
  ];
  for (const entry of BLOCKING) {
    const value = run.counts[entry.key];
    if (value) parts.push(`${value} ${entry.label}`);
  }
  if (run.progress) {
    parts.push(`step ${run.progress.at} of ${run.progress.of}`);
  }
  if (run.duration) parts.push(`took ${run.duration}`);
  if (run.decidedBy) parts.push(`decided by ${run.decidedBy}`);
  return `${status}. ${stamp}. ${trigger}. ${parts.join(', ')}.`;
}
