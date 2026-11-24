'use client';

import { useReducedMotion } from 'motion/react';
import { skipToken, useQuery } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ProcessRun, ProcessSummary, RunStatus } from '@/lib/shell/model';
import type { ModelPlan } from '@/lib/models';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { mockStageStorageKey } from '@/components/app-shell/thread/thread-player';
import { useWalkthrough } from '@/components/app-shell/walkthrough';
import { useTRPC } from '@/components/trpc/provider';
import { RunPrefetch } from './run-prefetch';
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
const MOCK_RUNS_STORAGE_PREFIX = 'safepoint.mock-runs.v1:';
const mockRunsListeners = new Set<() => void>();
const mockRunsCache = new Map<
  string,
  { raw: string | null; runs: KeptRun[] }
>();
const mockRunsFallback = new Map<string, KeptRun[]>();

export const isMockRunId = (id: string) => id.startsWith(MOCK_PREFIX);
// A mock started from the menu's "Try a mock run": it plays by itself, with no
// player, and waits wherever a person acts. Said in its id, which is kept.
const GUIDED_PREFIX = `${MOCK_PREFIX}guided-`;
export const isGuidedMockRunId = (id: string) => id.startsWith(GUIDED_PREFIX);

function mockRunsStorageKey(processId: string) {
  return `${MOCK_RUNS_STORAGE_PREFIX}${processId}`;
}

function subscribeMockRuns(listener: () => void) {
  mockRunsListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    mockRunsListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readStoredMockRuns(processId: string): KeptRun[] {
  try {
    const raw = window.sessionStorage.getItem(mockRunsStorageKey(processId));
    const cached = mockRunsCache.get(processId);
    if (cached && cached.raw === raw) return cached.runs;
    if (!raw) {
      mockRunsCache.set(processId, { raw, runs: NO_RUNS });
      return NO_RUNS;
    }
    const parsed: unknown = JSON.parse(raw);
    const runs = Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is KeptRun =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as KeptRun).id === 'string' &&
            isMockRunId((entry as KeptRun).id),
        )
      : NO_RUNS;
    mockRunsCache.set(processId, { raw, runs });
    return runs;
  } catch {
    return mockRunsFallback.get(processId) ?? NO_RUNS;
  }
}

function writeStoredMockRuns(processId: string, runs: KeptRun[]) {
  mockRunsFallback.set(processId, runs);
  try {
    const key = mockRunsStorageKey(processId);
    if (runs.length === 0) {
      window.sessionStorage.removeItem(key);
      mockRunsCache.set(processId, { raw: null, runs: NO_RUNS });
    } else {
      const raw = JSON.stringify(runs);
      window.sessionStorage.setItem(key, raw);
      mockRunsCache.set(processId, { raw, runs });
    }
  } catch {
    // Private browsing or blocked site data: keep in-memory fallback.
  }
  mockRunsListeners.forEach((listener) => listener());
}

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
  arriving: string | null;
  finishArrival: (id: string) => void;
  // A run is chosen, as a reload's address chooses one, but not yet found:
  // the list is still being asked for, or the browser's own runs have not
  // been read. Neither a run nor the empty page is drawn meanwhile.
  pending: boolean;
  // Shows a run, or shows nothing when it is the one already shown.
  select: (id: string) => void;
  // Asks for a run's data ahead of it being shown (RunPrefetch).
  prefetch?: (id: string) => void;
  // Null where this process cannot start a run, or while one is starting. The
  // text, when given, is kept with the run. Answers whether a run was started:
  // it is waited for, since the server names it.
  start:
    | ((
        additionalInstructions?: string,
        modelPlan?: ModelPlan,
        // Drafts a rulebook of its own (development only, to compare models).
        ownRulebook?: boolean,
      ) => Promise<boolean>)
    | null;
  // Starts a local mock run in memory only (no server call, no database write).
  startMock:
    | ((
        additionalInstructions?: string,
        options?: { guided?: boolean },
      ) => boolean)
    | null;
  // Why start is null, for the control that would have offered it.
  cannotStart: string | null;
  // A live run being started: the server has not answered yet.
  starting: boolean;
  // What the server said where it would not start a run.
  startError: string | null;
  // The live run being shown, and how its thread records its progress.
  live: LiveRun | null;
  instructionLoad: { runId: string; version: string; failed: boolean } | null;
  // The read it took and the rulebook it pinned (null takes the pin away);
  // refused for a run discarded or not kept, which `recordError` says.
  record: (
    id: string,
    progress: {
      readId?: string;
      rulebook?: string | null;
      stage?: string;
      status?:
        | 'running'
        | 'awaiting_review'
        | 'approved'
        | 'completed'
        | 'held'
        | 'failed';
    },
  ) => Promise<unknown>;
  recordError: string | null;
  // Updates a local mock run's status in session storage as its script advances.
  setMockStatus?: (id: string, status: RunStatus) => void;
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

const noSubscription = () => () => {};

function createMockRun(
  processId: RunProcessId,
  version: string,
  hash: string | null,
  additionalInstructions: string,
  guided = false,
): KeptRun {
  const id = `${guided ? GUIDED_PREFIX : MOCK_PREFIX}${Date.now()}`;
  const now = new Date().toISOString();
  return {
    id,
    process: processId,
    startedAt: now,
    updatedAt: now,
    startedBy: null,
    discardedAt: null,
    stage: 'read',
    status: 'running',
    trigger: 'manual',
    instructions: {
      version,
      hash: hash ?? 'mock',
    },
    additionalInstructions: additionalInstructions || null,
    modelPlan: null,
    ownRulebook: false,
    readId: null,
    rulebook: null,
  };
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
  const trpc = useTRPC();
  const walkthrough = useWalkthrough();
  const reduceMotion = useReducedMotion();
  const [{ selected, arriving }, setChoice] = useState<{
    selected: string | null;
    arriving: string | null;
  }>({
    selected: initialRunId,
    arriving: null,
  });
  const showNewRun = (id: string) => {
    setChoice((choice) =>
      reduceMotion
        ? { selected: id, arriving: null }
        : { ...choice, arriving: id },
    );
  };
  const mockRuns = useSyncExternalStore(
    subscribeMockRuns,
    () => (liveThread ? readStoredMockRuns(process.id) : NO_RUNS),
    () => NO_RUNS,
  );
  const setMockRuns = (update: (current: KeptRun[]) => KeptRun[]) => {
    const current = readStoredMockRuns(process.id);
    const next = update(current);
    if (next === current) return;
    writeStoredMockRuns(process.id, next);
  };
  const kept = useKeptRuns(process.id, liveThread, (run) => showNewRun(run.id));
  // Mock runs live in this browser alone: unread until hydration.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const prefetcher = useContext(RunPrefetch);
  const { versions, current } = useInstructions(
    process.id,
    process.instructions,
  );
  const keptRuns = kept.runs.data ?? NO_RUNS;
  const allLiveRuns = [...mockRuns, ...keptRuns].sort((a, b) => {
    const diff = Date.parse(b.startedAt) - Date.parse(a.startedAt);
    return diff !== 0 ? diff : b.id.localeCompare(a.id);
  });
  const keptRun = liveThread
    ? allLiveRuns.find((entry) => entry.id === selected)
    : undefined;
  const mock = keptRun ? isMockRunId(keptRun.id) : false;
  // An unknown id is let go by the effect below, so a kept run's wait ends
  // either way; a mock's ends with hydration.
  const pending =
    liveThread &&
    selected !== null &&
    keptRun === undefined &&
    !process.runs.some((run) => run.id === selected) &&
    (isMockRunId(selected) ? !hydrated : !kept.runs.isError);
  const savedRun = mock ? undefined : keptRun;
  const hash = savedRun?.instructions.hash;
  const listed = hash
    ? versions.find((version) => version.hash === hash)
    : undefined;
  const pinned = useQuery(
    trpc.instructions.get.queryOptions(
      hash && !listed
        ? { process: process.id as RunProcessId, hash }
        : skipToken,
    ),
  );
  const text = mock
    ? (versions.find((one) => one.version === keptRun?.instructions.version)
        ?.text ?? current.text)
    : (listed ?? pinned.data)?.text;
  const instructionLoad =
    savedRun && text === undefined
      ? {
          runId: savedRun.id,
          version: savedRun.instructions.version,
          failed: pinned.isError,
        }
      : null;
  const live: LiveRun | null =
    keptRun && text !== undefined
      ? {
          run: processRunOf(keptRun),
          kept: keptRun,
          text,
          mock,
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
    } else
      setChoice((choice) =>
        choice.selected === selected ? { ...choice, selected: null } : choice,
      );
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

  const start = async (
    additionalInstructions = '',
    modelPlan?: ModelPlan,
    ownRulebook = false,
  ) => {
    if (cannotStart) return false;
    try {
      await kept.start.mutateAsync({
        process: process.id as RunProcessId,
        instructions: current.hash!,
        additionalInstructions: additionalInstructions || null,
        modelPlan,
        ownRulebook,
      });
      return true;
    } catch {
      return false;
    }
  };

  const startMock = (
    additionalInstructions = '',
    { guided = false }: { guided?: boolean } = {},
  ) => {
    if (!liveThread) return false;
    const mockRun = createMockRun(
      process.id as RunProcessId,
      current.version,
      current.hash,
      additionalInstructions,
      guided,
    );
    showNewRun(mockRun.id);
    setMockRuns((list) => [mockRun, ...list]);
    return true;
  };

  return {
    runs: [...allLiveRuns.map(processRunOf), ...process.runs].sort((a, b) => {
      const diff = Date.parse(b.startedAt) - Date.parse(a.startedAt);
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    }),
    selected,
    arriving,
    finishArrival: (id) => {
      setChoice((choice) =>
        choice.arriving === id ? { selected: id, arriving: null } : choice,
      );
    },
    pending,
    prefetch: (id) => {
      if (!prefetcher || id === selected || isMockRunId(id)) return;
      const run = keptRuns.find((entry) => entry.id === id);
      const text = run
        ? versions.find((version) => version.hash === run.instructions.hash)
            ?.text
        : undefined;
      if (run && text !== undefined)
        prefetcher({ run: processRunOf(run), kept: run, text });
    },
    select: (id) => {
      kept.start.reset();
      if (selected !== id) walkthrough?.advance('start-run');
      setChoice((choice) => ({
        selected: choice.selected === id ? null : id,
        arriving: null,
      }));
    },
    start: cannotStart ? null : start,
    startMock: liveThread ? startMock : null,
    cannotStart,
    starting: kept.start.isPending,
    startError: kept.start.error?.message ?? null,
    live,
    instructionLoad,
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
    setMockStatus: (id, status) => {
      if (!isMockRunId(id)) return;
      setMockRuns((list) => {
        const target = list.find((one) => one.id === id);
        if (!target || target.status === status) return list;
        return list.map((one) => (one.id === id ? { ...one, status } : one));
      });
    },
    discard: async (id) => {
      const clearRun = () =>
        setChoice((choice) => ({
          selected: choice.selected === id ? null : choice.selected,
          arriving: choice.arriving === id ? null : choice.arriving,
        }));
      if (isMockRunId(id)) {
        try {
          window.sessionStorage.removeItem(mockStageStorageKey(id));
        } catch {
          // Ignore blocked storage.
        }
        setMockRuns((list) => list.filter((one) => one.id !== id));
        clearRun();
        return true;
      }
      try {
        await kept.discard.mutateAsync({
          process: process.id as RunProcessId,
          runId: id,
        });
        clearRun();
        return true;
      } catch {
        return false;
      }
    },
    discarding: kept.discard.isPending,
    discardError: kept.discard.error?.message ?? null,
  };
}
