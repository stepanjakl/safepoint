'use client';

import { createContext, useContext, useLayoutEffect } from 'react';

export const RunReadiness = createContext<(ready: boolean) => void>(() => {});

// A saved thread mounts before its requests finish. Keep its page's entrance
// held until it can draw the restored thread in full.
export function useRunReady(ready: boolean) {
  const report = useContext(RunReadiness);
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
