'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ThreadArrivals } from '@/components/app-shell/thread/thread-arrivals';
import { motionTime } from '@/lib/ui/motion-time';

/*
  The ticking counts of the prototype's run thread. They were part of
  components/app-shell/thread/thread-arrivals.tsx until the playable run was
  removed; copied here unchanged, since nothing else counts up.
*/

// When a ticking count starts after its step is drawn, and how long it takes
// to reach its figure. It starts once the step's body has unfolded
// (--thread-unfold-after in thread-step.css, plus the fold): a row added
// while the fold is still opening would jump it.
const COUNT_AFTER_MS = 1700;
const COUNT_SPAN_MS = 1500;
// The quickest a count may change: longer than its label's morph (360ms in
// ThreadStep), so each change finishes before the next starts. A larger jump
// moves in fewer, even steps rather than flickering through every number.
const COUNT_STEP_MS = 420;

// How a count behaves: at rest, waiting for its step to arrive, or ticking.
export function countingFor(
  arrivals: Pick<ThreadArrivals<string>, 'watched' | 'drawn'>,
  running: boolean,
  id: string,
): 'rest' | 'wait' | 'tick' {
  return !arrivals.watched || !running
    ? 'rest'
    : arrivals.drawn.includes(id)
      ? 'tick'
      : 'wait';
}

/*
  A count that ticks up to `target`, in even steps, once its step is drawn;
  holds where it stood while the step waits to arrive; and is simply
  `target` at rest. It ticks from wherever it stood, so a stage that moves on
  mid-count carries on from there.
*/
export function useCountUp(
  target: number,
  mode: 'rest' | 'wait' | 'tick',
  span = COUNT_SPAN_MS,
) {
  const [shown, setShown] = useState(target);
  const from = useRef(shown);
  useLayoutEffect(() => {
    from.current = shown;
  });
  useEffect(() => {
    if (mode === 'wait') return;
    const start = from.current;
    const distance = mode === 'tick' ? target - start : 0;
    const steps = Math.min(
      distance,
      Math.max(1, Math.floor(span / COUNT_STEP_MS)),
    );
    const timers =
      distance > 0
        ? Array.from({ length: steps }, (_, index) =>
            setTimeout(
              () =>
                setShown(start + Math.round((distance * (index + 1)) / steps)),
              motionTime(COUNT_AFTER_MS + (span / steps) * index),
            ),
          )
        : [setTimeout(() => setShown(target))];
    return () => timers.forEach(clearTimeout);
  }, [target, mode, span]);
  return shown;
}
