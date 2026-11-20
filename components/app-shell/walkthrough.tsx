'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type WalkthroughStep =
  'open-processes' | 'pick-process' | 'start-run' | 'review-proposal';

const NEXT_STEP: Record<WalkthroughStep, WalkthroughStep | null> = {
  'open-processes': 'pick-process',
  'pick-process': 'start-run',
  'start-run': 'review-proposal',
  'review-proposal': null,
};

type WalkthroughContextValue = {
  step: WalkthroughStep | null;
  advance: (from: WalkthroughStep) => void;
  dismiss: () => void;
};

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

/*
  Tracks the guided walkthrough across the persistent app shell. The walkthrough
  starts whenever the reader visits /workspace (including returning from a
  process after finishing or dismissing it) and stays inactive when landing
  directly on a process route. Dismissing any step completes the entire flow.
*/
export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [state, setState] = useState<{
    path: string;
    step: WalkthroughStep | null;
  }>(() => ({
    path,
    step: path === '/workspace' ? 'open-processes' : null,
  }));

  if (state.path !== path) {
    let nextStep = state.step;
    if (path === '/workspace') {
      nextStep = 'open-processes';
    } else if (
      path.startsWith('/processes/') &&
      (state.step === 'open-processes' || state.step === 'pick-process')
    ) {
      nextStep = 'start-run';
    }
    setState({ path, step: nextStep });
  }

  const step = state.path === path ? state.step : null;

  const advance = useCallback((from: WalkthroughStep) => {
    setState((current) =>
      current.step === from ? { ...current, step: NEXT_STEP[from] } : current,
    );
  }, []);

  const dismiss = useCallback(() => {
    setState((current) =>
      current.step === null ? current : { ...current, step: null },
    );
  }, []);

  const value = useMemo(
    () => ({ step, advance, dismiss }),
    [step, advance, dismiss],
  );

  return <WalkthroughContext value={value}>{children}</WalkthroughContext>;
}

export function useWalkthrough() {
  return useContext(WalkthroughContext);
}
