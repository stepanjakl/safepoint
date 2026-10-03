'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { motionTime } from '@/lib/motion-time';

// Long enough for a step to arrive and unfold; following ends sooner if the
// reader takes the scroll.
const FOLLOW_MS = 4000;

const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
  Keeps a live run's newest step in view for a reader who was watching the
  end of the thread, and only for them. One who had scrolled away to read is
  left where they are and told a step has arrived instead: `behind` is true
  until the newest step is on screen, and `catchUp` takes them to it.
*/
export function useFollowRun(
  list: RefObject<HTMLOListElement | null>,
  lastId: string | undefined,
) {
  const [behind, setBehind] = useState(false);
  // Whether the last step drawn was on screen, as last observed: read when a
  // new one arrives, before the observer moves on to it.
  const lastSeen = useRef(true);
  // The newest step last followed or passed over. Compared by id, not by
  // whether this has mounted: an effect run twice for the same step (React's
  // development check does exactly that) must not read as an arrival.
  const previousId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const thread = list.current;
    const item = thread?.lastElementChild;
    if (!thread || !item) return;
    const arrived =
      previousId.current !== undefined && previousId.current !== lastId;
    previousId.current = lastId;
    const wasWatching = lastSeen.current;

    const seen = new IntersectionObserver(([entry]) => {
      lastSeen.current = entry?.isIntersecting ?? false;
      if (lastSeen.current) setBehind(false);
    });
    seen.observe(item);
    if (!arrived) return () => seen.disconnect();
    if (!wasWatching) {
      const timer = setTimeout(() => setBehind(true));
      return () => {
        clearTimeout(timer);
        seen.disconnect();
      };
    }

    // Follow while the step arrives and unfolds, frame by frame with its
    // growth rather than smoothly, so the scroll moves exactly as it does.
    let following = true;
    const stop = () => (following = false);
    const growth = new ResizeObserver(() => {
      if (following) item.scrollIntoView({ block: 'nearest' });
    });
    growth.observe(thread);
    const end = setTimeout(stop, motionTime(FOLLOW_MS));
    const taken = ['wheel', 'touchmove', 'keydown'] as const;
    taken.forEach((type) =>
      window.addEventListener(type, stop, { passive: true }),
    );
    return () => {
      seen.disconnect();
      growth.disconnect();
      clearTimeout(end);
      taken.forEach((type) => window.removeEventListener(type, stop));
    };
  }, [list, lastId]);

  const catchUp = () => {
    list.current?.lastElementChild?.scrollIntoView({
      block: 'nearest',
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
    setBehind(false);
  };

  return { behind, catchUp };
}
