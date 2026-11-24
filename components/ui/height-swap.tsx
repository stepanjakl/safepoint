'use client';

import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from 'motion/react';
import {
  useCallback,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DURATION_STATE,
  DURATION_TAB_LEAVE,
  EASE_OUT_QUAD,
} from '@/lib/ui/motion';
import { SmoothHeight } from './smooth-height';

export function useHeightSwap(key: string | number, reduced: boolean) {
  const [swap, setSwap] = useState<{
    key: string | number;
    version: number;
    phase: 'leaving' | 'resizing' | 'ready';
  }>({ key, version: 0, phase: 'ready' });
  if (key !== swap.key)
    setSwap({ key, version: swap.version + 1, phase: 'leaving' });
  const { version, phase } = swap;

  const measure = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      setSwap((current) =>
        current.version === version && current.phase === 'leaving'
          ? { ...current, phase: 'resizing' }
          : current,
      );
    },
    [version],
  );

  return {
    version,
    hold: !reduced && phase === 'leaving',
    ready: reduced || phase === 'ready',
    measure,
    onSettled: () =>
      setSwap((current) =>
        current.version === version && current.phase === 'resizing'
          ? { ...current, phase: 'ready' }
          : current,
      ),
  };
}

export function HeightSwap({
  contentKey,
  holdHeight = false,
  focusOnEnter = false,
  children,
}: {
  contentKey: string;
  holdHeight?: boolean;
  focusOnEnter?: boolean;
  children: ReactNode;
}) {
  const reduced = Boolean(useReducedMotion());
  const { version, hold, ready, measure, onSettled } = useHeightSwap(
    contentKey,
    reduced,
  );
  const content = (
    <SwapContent
      key={version}
      ready={ready}
      measure={measure}
      focusOnEnter={focusOnEnter}
      reduced={reduced}
    >
      {children}
    </SwapContent>
  );
  if (reduced) return content;
  return (
    <SmoothHeight hold={hold || holdHeight} onSettled={onSettled}>
      <AnimatePresence initial={false} mode="wait">
        {content}
      </AnimatePresence>
    </SmoothHeight>
  );
}

function SwapContent({
  children,
  ready,
  measure,
  focusOnEnter,
  reduced,
}: {
  children: ReactNode;
  ready: boolean;
  measure: (element: HTMLDivElement | null) => void;
  focusOnEnter: boolean;
  reduced: boolean;
}) {
  const present = useIsPresent();
  const content = useRef<HTMLDivElement>(null);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      content.current = element;
      measure(element);
    },
    [measure],
  );
  const restoreFocus = useEffectEvent(() => {
    if (focusOnEnter)
      content.current
        ?.querySelector<HTMLButtonElement>('button:enabled')
        ?.focus({ preventScroll: true });
  });
  useLayoutEffect(() => {
    if (ready && present) restoreFocus();
  }, [ready, present]);

  return (
    <motion.div
      ref={attach}
      data-height-swap-content
      inert={!present || !ready}
      variants={{
        hidden: { opacity: 0, transition: { duration: 0 } },
        departing: {
          opacity: 0,
          transition: { duration: DURATION_TAB_LEAVE, ease: EASE_OUT_QUAD },
        },
        shown: {
          opacity: 1,
          transition: { duration: DURATION_STATE, ease: EASE_OUT_QUAD },
        },
      }}
      initial={reduced ? false : 'hidden'}
      animate={ready ? 'shown' : 'hidden'}
      exit="departing"
    >
      {children}
    </motion.div>
  );
}
