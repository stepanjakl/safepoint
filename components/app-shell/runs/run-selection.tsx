'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ProcessRun, ProcessSummary } from '@/lib/process/model';
import type { RunStage } from '@/lib/process/run-lifecycle';

/*
  Which run the process page is showing, and the run a person started here.

  One choice for the rail and the page beside it: picking a row shows that
  run, picking it again shows nothing, and a run with no recorded thread shows
  the empty page rather than leaving the last one standing. The choice is kept
  in the address (?run=), so a link or a reload opens the same run; a page
  arrived at without one opens on nothing.

  Placeholder: a started run plays the recorded run's stages on a timer, up to
  the review, because nothing yet starts a real one. It is never written to the
  address, since a reload could not find it again.
*/
const PLAYED: RunStage[] = [
  'reading',
  'evaluating',
  'checking',
  'awaiting_review',
];
const STAGE_MS = 1800;

export type StartedRun = { run: ProcessRun; stage: RunStage };

type RunSelection = {
  // The process's runs, newest first, a started one at the top.
  runs: ProcessRun[];
  selected: string | null;
  // Shows a run, or shows nothing when it is the one already shown.
  select: (id: string) => void;
  started: StartedRun | null;
  // Null where this process cannot play a run, or while one is playing.
  start: (() => void) | null;
  // Why start is null, for the control that would have offered it.
  cannotStart: string | null;
};

const RunSelectionContext = createContext<RunSelection | null>(null);

export const RunSelectionProvider = RunSelectionContext.Provider;

export function useRunSelection() {
  return useContext(RunSelectionContext);
}

export function useRunSelectionState({
  process,
  initialRunId,
  canPlay,
  version,
}: {
  process: ProcessSummary;
  initialRunId: string | null;
  // Whether this process has a recorded run to play. Only the promotion does.
  canPlay: boolean;
  // The instructions a started run runs under.
  version: string;
}): RunSelection {
  const [selected, setSelected] = useState(initialRunId);
  const [started, setStarted] = useState<StartedRun | null>(null);
  const recorded = process.runs.find((run) => run.current);

  // Kept in the address as it changes, never for a started run.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected && selected !== started?.run.id)
      url.searchParams.set('run', selected);
    else url.searchParams.delete('run');
    if (url.href !== window.location.href)
      window.history.replaceState(window.history.state, '', url);
  }, [selected, started?.run.id]);

  // One stage every STAGE_MS until the review, where a run waits for a person.
  const playing = started !== null && started.stage !== 'awaiting_review';
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(
      () =>
        setStarted((current) => {
          if (!current) return current;
          const at = PLAYED.indexOf(current.stage) + 1;
          const stage = PLAYED[at]!;
          const done = stage === 'awaiting_review';
          return {
            stage,
            run: {
              ...current.run,
              status: done ? 'awaiting_review' : 'running',
              progress: done ? undefined : { at: at + 1, of: PLAYED.length },
              counts: done && recorded ? recorded.counts : current.run.counts,
            },
          };
        }),
      STAGE_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, started?.stage, recorded]);

  const cannotStart = !canPlay
    ? 'This example has no recorded run to play.'
    : playing
      ? 'A run is already running.'
      : null;

  const start = () => {
    const run: ProcessRun = {
      id: `run-started-${Date.now()}`,
      startedAt: new Date().toISOString(),
      status: 'running',
      trigger: 'manual',
      counts: { items: 0 },
      progress: { at: 1, of: PLAYED.length },
      instructionsVersion: version,
    };
    setStarted({ run, stage: PLAYED[0]! });
    setSelected(run.id);
  };

  return {
    runs: started ? [started.run, ...process.runs] : process.runs,
    selected,
    select: (id) => setSelected((current) => (current === id ? null : id)),
    started,
    start: cannotStart ? null : start,
    cannotStart,
  };
}
