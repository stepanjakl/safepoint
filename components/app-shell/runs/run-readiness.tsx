'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export const RunReadiness = createContext<{
  report: (ready: boolean) => void;
  shown: boolean;
}>({
  report: () => {},
  shown: true,
});

export function useRunShown() {
  return useContext(RunReadiness).shown;
}

// A saved thread mounts before its requests finish. Keep its page's entrance
// held until it can draw the restored thread in full. Once drawn it stays
// ready: shown again from a hidden tab, which runs this effect anew, it says
// so at once rather than hiding the page for two frames and fading it back.
function useRunReady(ready: boolean) {
  const { report } = useContext(RunReadiness);
  const drawn = useRef(false);
  useLayoutEffect(() => {
    if (ready && drawn.current) {
      report(true);
      return;
    }
    report(false);
    if (!ready) return;
    // Let the committed thread paint hidden before the page's fade starts.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        drawn.current = true;
        report(true);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [ready, report]);
}

export function useRunRestoration(readId: string | null) {
  const [phase, setPhase] = useState<'new' | 'restoring' | 'restored'>(() =>
    readId ? 'restoring' : 'new',
  );
  const restoring = phase === 'restoring';
  useRunReady(!restoring);
  return {
    restoring,
    reopened: phase !== 'new',
    finishRestoring: () => setPhase('restored'),
  };
}

export function useStepReady(
  ready: boolean,
  onReadyChange?: (ready: boolean) => void,
) {
  useEffect(() => onReadyChange?.(ready), [ready, onReadyChange]);
}

/*
  Whether a step's query has something to show: an answer, kept from before
  or just in, or a settled failure to say so. A refetch behind a kept answer
  does not hold the run back.
*/
export function settledOnce(query: {
  data: unknown;
  isFetched: boolean;
  isFetching: boolean;
}) {
  return query.data !== undefined || (query.isFetched && !query.isFetching);
}

/*
  How long a step's answer counts as just asked. A thread's data is asked for
  as it opens (and as its row is pointed at), and its steps mount a moment
  later: within this they take that answer rather than ask again. Past it, a
  step opening still asks afresh, behind what it shows.
*/
export const JUST_ASKED_MS = 2_000;
