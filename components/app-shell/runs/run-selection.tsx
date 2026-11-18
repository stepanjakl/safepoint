'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ProcessRun, ProcessSummary } from '@/lib/shell/model';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import {
  processRunOf,
  useKeptRuns,
  type KeptRun,
  type RunProcessId,
} from './kept-runs';

/*
  Which run the process page is showing.

  One choice for the rail and the page beside it: picking a row shows that
  run, picking it again shows nothing, and a run with no recorded thread shows
  the empty page rather than leaving the last one standing. The choice is kept
  in the address (?run=), so a link or a reload opens the same run; a page
  arrived at without one opens on nothing.

  A process with a live thread starts a real run: the server keeps it
  (kept-runs.ts), names it, and it moves only when a person acts on the page.
  An id in the address that the server does not keep selects nothing.
*/
const NO_RUNS: KeptRun[] = [];
const MOCK_PREFIX = 'mock-';

export const isMockRunId = (id: string) => id.startsWith(MOCK_PREFIX);

// The kept run being shown, with the text of the instructions it runs under.
export type LiveRun = {
  run: ProcessRun;
  kept: KeptRun;
  text: string;
  mock?: boolean;
};

export type RunSelection = {
  // The process's runs, newest first.
  runs: ProcessRun[];
  selected: string | null;
  // Shows a run, or shows nothing when it is the one already shown.
  select: (id: string) => void;
  // Null where this process cannot start a run, or while one is starting. The
  // text, when given, is kept with the run. Answers whether a run was started:
  // it is waited for, since the server names it.
  start: ((additionalInstructions?: string) => Promise<boolean>) | null;
  // Starts a local mock run in memory only (no server call, no database write).
  startMock: ((additionalInstructions?: string) => boolean) | null;
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
  liveThread = false,
}: {
  process: ProcessSummary;
  initialRunId: string | null;
  // Whether this process draws a live run's thread, run step by step.
  liveThread?: boolean;
}): RunSelection {
  const [selected, setSelected] = useState(
    initialRunId && isMockRunId(initialRunId) ? null : initialRunId,
  );
  const [mockRuns, setMockRuns] = useState<KeptRun[]>([]);
  const kept = useKeptRuns(process.id, liveThread);
  const { versions, current } = useInstructions(
    process.id,
    process.instructions,
  );
  const keptRuns = kept.runs.data ?? NO_RUNS;
  const allLiveRuns = [...mockRuns, ...keptRuns];
  const keptRun = liveThread
    ? allLiveRuns.find((entry) => entry.id === selected)
    : undefined;
  // Its text comes with the versions, by label; until they are known the
  // thread waits, as for a run not yet listed.
  const text = keptRun
    ? (versions.find((one) => one.version === keptRun.instructions.version)
        ?.text ?? current.text)
    : undefined;
  const live: LiveRun | null =
    keptRun && text !== undefined
      ? {
          run: processRunOf(keptRun),
          kept: keptRun,
          text,
          mock: isMockRunId(keptRun.id),
        }
      : null;

  // An id the server does not keep (an old one, a mistyped one) selects
  // nothing. The list is asked once more first, in case the run was started
  // elsewhere since it was read.
  const asked = useRef(new Set<string>());
  const { isSuccess, isFetching, refetch } = kept.runs;
  useEffect(() => {
    if (!liveThread || !selected || isMockRunId(selected)) return;
    if (!isSuccess || isFetching) return;
    if (keptRuns.some((entry) => entry.id === selected)) return;
    if (!asked.current.has(selected)) {
      asked.current.add(selected);
      void refetch();
    } else setSelected((now) => (now === selected ? null : now));
  }, [liveThread, selected, isSuccess, isFetching, refetch, keptRuns]);

  // Kept in the address as it changes. Replaced with null state, so Next takes the address as its own: passing its old state
  // back makes a later router refresh restore the address without the run.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set('run', selected);
    else url.searchParams.delete('run');
    if (url.href !== window.location.href)
      window.history.replaceState(null, '', url);
  }, [selected]);

  const cannotStart = !liveThread
    ? 'This process has no run to start.'
    : kept.start.isPending
      ? 'Starting the run…'
      : current.hash === null
        ? 'Reading the instructions…'
        : null;

  const start = async (additionalInstructions = '') => {
    if (cannotStart) return false;
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
  };

  const startMock = (additionalInstructions = '') => {
    if (!liveThread) return false;
    const id = `${MOCK_PREFIX}${Date.now()}`;
    const now = new Date().toISOString();
    const mockRun: KeptRun = {
      id,
      process: process.id as RunProcessId,
      startedAt: now,
      updatedAt: now,
      startedBy: null,
      discardedAt: null,
      stage: 'read',
      status: 'running',
      trigger: 'manual',
      instructions: {
        version: current.version,
        hash: current.hash ?? 'mock',
      },
      additionalInstructions: additionalInstructions || null,
      readId: null,
      rulebook: null,
    };
    setMockRuns((list) => [mockRun, ...list]);
    setSelected(id);
    return true;
  };

  return {
    runs: [...allLiveRuns.map(processRunOf), ...process.runs],
    selected,
    select: (id) => {
      kept.start.reset();
      setSelected((current) => (current === id ? null : id));
    },
    start: cannotStart ? null : start,
    startMock: liveThread ? startMock : null,
    cannotStart,
    starting: kept.start.isPending,
    startError: kept.start.error?.message ?? null,
    live,
    record: (id, progress) => {
      if (isMockRunId(id)) {
        setMockRuns((list) =>
          list.map((one) =>
            one.id === id
              ? {
                  ...one,
                  ...(progress.readId !== undefined
                    ? { readId: progress.readId }
                    : {}),
                  ...(progress.rulebook !== undefined
                    ? { rulebook: progress.rulebook }
                    : {}),
                }
              : one,
          ),
        );
        return Promise.resolve();
      }
      return kept.record(id, progress);
    },
    recordError: kept.recordError,
    discard: async (id) => {
      if (isMockRunId(id)) {
        setMockRuns((list) => list.filter((one) => one.id !== id));
        setSelected((now) => (now === id ? null : now));
        return true;
      }
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
