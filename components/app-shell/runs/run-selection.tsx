'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ProcessRun, ProcessSummary } from '@/lib/shell/model';
import type { RunStage } from '@/lib/shell/placeholder/run-lifecycle';
import { motionTime } from '@/lib/motion-time';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import {
  processRunOf,
  useKeptRuns,
  type KeptRun,
  type RunProcessId,
} from './kept-runs';
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

  A process with a live thread starts a real run instead: the server keeps it
  (kept-runs.ts), names it, and it moves only when a person acts on the page.
  An id in the address that the server does not keep selects nothing.
*/
const NO_RUNS: KeptRun[] = [];
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

// The kept run being shown, with the text of the instructions it runs under.
export type LiveRun = { run: ProcessRun; kept: KeptRun; text: string };

export type StartedRun = {
  run: ProcessRun;
  stage: RunStage;
  additionalInstructions: string;
};

export type RunSelection = {
  // The process's runs, newest first, a started one at the top.
  runs: ProcessRun[];
  selected: string | null;
  // Shows a run, or shows nothing when it is the one already shown.
  select: (id: string) => void;
  started: StartedRun | null;
  // Null where this process cannot play a run, or while one is starting or
  // playing. The text, when given, is kept with the run. Answers whether a
  // run was started: a live one is waited for, since the server names it.
  start: ((additionalInstructions?: string) => Promise<boolean>) | null;
  // Why start is null, for the control that would have offered it.
  cannotStart: string | null;
  // A live run being started: the server has not answered yet.
  starting: boolean;
  // What the server said where it would not start a run.
  startError: string | null;
  // The live run being shown, and how its thread records its progress.
  live: LiveRun | null;
  // The read it took and the rulebook it pinned (null takes the pin away);
  // refused for a run discarded or not kept, which `recordError` says.
  record: (
    id: string,
    progress: { readId?: string; rulebook?: string | null },
  ) => Promise<unknown>;
  recordError: string | null;
  // Discarding is waited for: the run leaves the list once the server says so.
  discard: (id: string) => Promise<boolean>;
  discarding: boolean;
  discardError: string | null;
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
  const kept = useKeptRuns(process.id, liveThread);
  const { versions, current } = useInstructions(
    process.id,
    process.instructions,
  );
  const keptRuns = kept.runs.data ?? NO_RUNS;
  const keptRun = liveThread
    ? keptRuns.find((entry) => entry.id === selected)
    : undefined;
  // Its text comes with the versions, by label; until they are known the
  // thread waits, as for a run not yet listed.
  const text = keptRun
    ? versions.find((one) => one.version === keptRun.instructions.version)?.text
    : undefined;
  const live: LiveRun | null =
    keptRun && text !== undefined
      ? { run: processRunOf(keptRun), kept: keptRun, text }
      : null;

  // An id the server does not keep (an old one, a mistyped one) selects
  // nothing. The list is asked once more first, in case the run was started
  // elsewhere since it was read.
  const asked = useRef(new Set<string>());
  const { isSuccess, isFetching, refetch } = kept.runs;
  useEffect(() => {
    if (!liveThread || !selected || !isSuccess || isFetching) return;
    if (keptRuns.some((entry) => entry.id === selected)) return;
    if (!asked.current.has(selected)) {
      asked.current.add(selected);
      void refetch();
    } else setSelected((now) => (now === selected ? null : now));
  }, [liveThread, selected, isSuccess, isFetching, refetch, keptRuns]);

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
    ? kept.start.isPending
      ? 'Starting the run…'
      : current.hash === null
        ? 'Reading the instructions…'
        : null
    : !canPlay
      ? 'This example has no recorded run to play.'
      : playing
        ? 'A run is already running.'
        : null;

  const start = async (additionalInstructions = '') => {
    if (cannotStart) return false;
    if (liveThread) {
      try {
        const run = await kept.start.mutateAsync({
          process: process.id as RunProcessId,
          instructions: current.hash!,
          additionalInstructions: additionalInstructions || null,
        });
        setSelected(run.id);
        return true;
      } catch {
        return false;
      }
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
    return true;
  };

  return {
    runs: [
      ...(started ? [started.run] : []),
      ...keptRuns.map(processRunOf),
      ...process.runs,
    ],
    selected,
    select: (id) => {
      kept.start.reset();
      setSelected((current) => (current === id ? null : id));
    },
    started,
    start: cannotStart ? null : start,
    cannotStart,
    starting: kept.start.isPending,
    startError: kept.start.error?.message ?? null,
    live,
    record: (id, progress) => kept.record(id, progress),
    recordError: kept.recordError,
    discard: async (id) => {
      try {
        await kept.discard.mutateAsync({
          process: process.id as RunProcessId,
          runId: id,
        });
        setSelected((now) => (now === id ? null : now));
        return true;
      } catch {
        return false;
      }
    },
    discarding: kept.discard.isPending,
    discardError: kept.discard.error?.message ?? null,
  };
}
