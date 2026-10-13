'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ProcessRun, ProcessSummary } from '@/lib/process/model';
import type { RunStage } from '@/lib/process/run-lifecycle';
import { motionTime } from '@/lib/motion-time';
import { useLiveRuns, type LiveRun } from './live-runs-store';
import { useWorkingFavicon } from './working-favicon';

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

  A process with a live thread starts a real run instead: it is kept in this
  browser (live-runs-store.ts) and moves only when a person acts on the page.
*/
const PLAYED: RunStage[] = [
  'starting',
  'reading',
  'evaluating',
  'checking',
  'awaiting_review',
];
// Long enough for a finishing step's mark to leave and the next to arrive;
// the moment before the run begins is brief.
const STAGE_MS = 4800;
const STARTING_MS = 1200;
// The bar fills while the candidates are evaluated; it gets time to be seen.
const EVALUATING_MS = 8400;

export type StartedRun = {
  run: ProcessRun;
  stage: RunStage;
  additionalInstructions: string;
};

type RunSelection = {
  // The process's runs, newest first, a started one at the top.
  runs: ProcessRun[];
  selected: string | null;
  // Shows a run, or shows nothing when it is the one already shown.
  select: (id: string) => void;
  started: StartedRun | null;
  // Null where this process cannot play a run, or while one is playing. The
  // text, when given, is kept with the run.
  start: ((additionalInstructions?: string) => void) | null;
  // Why start is null, for the control that would have offered it.
  cannotStart: string | null;
  // The live run being shown, and how its thread records its progress.
  live: LiveRun | null;
  updateLive: (id: string, data: Record<string, unknown>) => void;
  removeLive: (id: string) => void;
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
  liveThread = false,
  version,
}: {
  process: ProcessSummary;
  initialRunId: string | null;
  // Whether this process has a recorded run to play. Only the promotion does.
  canPlay: boolean;
  // Whether this process draws a live run's thread, run step by step.
  liveThread?: boolean;
  // The instructions a started run runs under.
  version: string;
}): RunSelection {
  const [selected, setSelected] = useState(initialRunId);
  const [started, setStarted] = useState<StartedRun | null>(null);
  const recorded = process.runs.find((run) => run.current);
  const liveRuns = useLiveRuns(process.id);
  const live = liveRuns.runs.find((entry) => entry.run.id === selected) ?? null;

  // Kept in the address as it changes, never for a started run. Replaced with
  // null state, so Next takes the address as its own: passing its old state
  // back makes a later router refresh restore the address without the run.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected && selected !== started?.run.id)
      url.searchParams.set('run', selected);
    else url.searchParams.delete('run');
    if (url.href !== window.location.href)
      window.history.replaceState(null, '', url);
  }, [selected, started?.run.id]);

  // One stage every STAGE_MS until the review, where a run waits for a person.
  const playing = started !== null && started.stage !== 'awaiting_review';
  useWorkingFavicon(playing);
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
            additionalInstructions: current.additionalInstructions,
            run: {
              ...current.run,
              status: done ? 'awaiting_review' : 'running',
              progress: done ? undefined : { at: at + 1, of: PLAYED.length },
              counts: done && recorded ? recorded.counts : current.run.counts,
            },
          };
        }),
      motionTime(
        started?.stage === 'starting'
          ? STARTING_MS
          : started?.stage === 'evaluating'
            ? EVALUATING_MS
            : STAGE_MS,
      ),
    );
    return () => clearTimeout(timer);
  }, [playing, started?.stage, recorded]);

  const cannotStart = liveThread
    ? null
    : !canPlay
      ? 'This example has no recorded run to play.'
      : playing
        ? 'A run is already running.'
        : null;

  const start = (additionalInstructions = '') => {
    if (cannotStart) return;
    if (liveThread) {
      const run: ProcessRun = {
        id: `run-${Date.now()}`,
        startedAt: new Date().toISOString(),
        status: 'running',
        trigger: 'manual',
        counts: { items: 0 },
        instructionsVersion: version,
      };
      liveRuns.add(
        run,
        additionalInstructions ? { additionalInstructions } : {},
      );
      setSelected(run.id);
      return;
    }
    const run: ProcessRun = {
      id: `run-started-${Date.now()}`,
      startedAt: new Date().toISOString(),
      status: 'running',
      trigger: 'manual',
      counts: { items: 0 },
      progress: { at: 1, of: PLAYED.length },
      instructionsVersion: version,
    };
    setStarted({ run, stage: PLAYED[0]!, additionalInstructions });
    setSelected(run.id);
  };

  return {
    runs: [
      ...(started ? [started.run] : []),
      ...liveRuns.runs.map((entry) => entry.run),
      ...process.runs,
    ],
    selected,
    select: (id) => setSelected((current) => (current === id ? null : id)),
    started,
    start: cannotStart ? null : start,
    cannotStart,
    live,
    updateLive: liveRuns.update,
    removeLive: (id) => {
      liveRuns.remove(id);
      setSelected((current) => (current === id ? null : current));
    },
  };
}
