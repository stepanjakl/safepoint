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
import { DETAIL_AFTER } from '@/lib/ui/motion';

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
  Whether a part is arriving with its screen: the first paint after a load or
  a navigation, when its data has just come. Entrances stagger then and only
  then. Anything mounted once the screen has settled -- another tab, a list
  swapped in place -- is already local, so it is simply shown. A part reads it
  once, at mount (useState), since it turns false as soon as the screen lands.
*/
const ScreenArriving = createContext(false);

export function useScreenArriving() {
  return useContext(ScreenArriving);
}

export function ScreenArrival({ children }: { children: ReactNode }) {
  const settled = useScreenSettled();
  const [arriving, setArriving] = useState(true);
  // A frame after landing: whatever mounted with the screen has read it by then.
  useEffect(() => {
    if (!settled) return;
    const frame = requestAnimationFrame(() => setArriving(false));
    return () => cancelAnimationFrame(frame);
  }, [settled]);
  return <ScreenArriving value={arriving}>{children}</ScreenArriving>;
}

/*
  When the section a detail belongs to began coming in: null where it was
  simply there (a tab, a later mount, reduced motion), unset until it is shown -- it
  may be rendered ahead, hidden. A detail shown with its section is held the
  whole DETAIL_AFTER after the screen settles; one mounted
  later is held for what is left of it, so the list always leads by the same
  beat however early the detail's own data was ready.
*/
const SectionStart = createContext<RefObject<number | null> | null>(null);

export function SectionClock({ children }: { children: ReactNode }) {
  const arriving = useScreenArriving();
  // Decided at mount: the section is keyed, so each arrival has its own. Only
  // one arriving with its screen trails its detail; a tab shows both at once.
  // Not by reduced motion, which the server cannot know: CSS drops the fade.
  const [timed] = useState(arriving);
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
