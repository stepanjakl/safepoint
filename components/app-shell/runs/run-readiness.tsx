'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
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
// held until it can draw the restored thread in full.
function useRunReady(ready: boolean) {
  const { report } = useContext(RunReadiness);
  useLayoutEffect(() => {
    report(false);
    if (!ready) return;
    // Let the committed thread paint hidden before the page's fade starts.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => report(true));
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
