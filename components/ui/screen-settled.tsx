'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useReducedMotion } from 'motion/react';
import { DETAIL_AFTER } from '@/lib/motion';

/*
  Whether the screen around a part has finished coming in. Each transition
  reports through SettledLayer, from its own motion's end, and a part with an
  entrance of its own holds it until every layer above has landed. Outside any
  layer nothing is arriving, so a part plays at once.
*/
const ScreenSettled = createContext(true);

// Covers a missed end event, so nothing stays held back. Long enough for the
// slowest fade at the slowest playback speed (data-motion-speed).
const SETTLE_FAILSAFE_MS = 3000;

export function useScreenSettled() {
  return useContext(ScreenSettled);
}

export function SettledLayer({
  settled,
  children,
}: {
  settled: boolean;
  children: ReactNode;
}) {
  const outer = useContext(ScreenSettled);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (settled) return;
    const failsafe = window.setTimeout(
      () => setExpired(true),
      SETTLE_FAILSAFE_MS,
    );
    return () => window.clearTimeout(failsafe);
  }, [settled]);
  return (
    <ScreenSettled value={outer && (settled || expired)}>
      {children}
    </ScreenSettled>
  );
}

/*
  When the section a detail belongs to began coming in: null where it was
  simply there (a first paint, reduced motion), unset until it is shown -- it
  may be rendered ahead, hidden. A detail shown with its section is held the
  whole DETAIL_AFTER after the screen settles; one mounted
  later is held for what is left of it, so the list always leads by the same
  beat however early the detail's own data was ready.
*/
const SectionStart = createContext<RefObject<number | null> | null>(null);

export function SectionClock({
  entering,
  children,
}: {
  entering: boolean;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  // Decided at mount: the section is keyed, so each arrival has its own.
  const [timed] = useState(() => entering && !reduceMotion);
  const start = useRef<number | null>(null);
  const settled = useScreenSettled();
  // The list and detail delays share their start after every outer fade ends.
  useLayoutEffect(() => {
    if (timed && settled && start.current === null)
      start.current = performance.now();
  }, [timed, settled]);
  return <SectionStart value={timed ? start : null}>{children}</SectionStart>;
}

/*
  Spread onto a detail column: its beat behind the list, as --detail-hold, and
  data-detail-held while there is one. The stylesheet that owns the column
  fades it in after that hold.
*/
export function useDetailHold(): {
  held: boolean;
  props: {
    'data-detail-held'?: true;
    'data-entrance-held'?: true;
    style?: CSSProperties;
  };
} {
  const start = useContext(SectionStart);
  const settled = useScreenSettled();
  const [hold] = useState(() => {
    if (start === null) return 0;
    const at = start.current;
    return at === null
      ? DETAIL_AFTER * 1000
      : at + DETAIL_AFTER * 1000 - performance.now();
  });
  if (hold <= 0) return { held: false, props: {} };
  return {
    held: true,
    props: {
      'data-detail-held': true,
      'data-entrance-held': !settled || undefined,
      style: { '--detail-hold': `${Math.round(hold)}ms` } as CSSProperties,
    },
  };
}
