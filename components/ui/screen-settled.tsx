'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

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
