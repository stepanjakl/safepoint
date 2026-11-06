'use client';

import { motion, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DURATION_PANE,
  DURATION_STATE,
  DURATION_TAB_LEAVE,
  EASE_OUT_QUAD,
} from '@/lib/motion';

/*
  One place trading what it shows: the run beside the rail, a tab's body, the
  detail beside a list. Two steps, never an overlap -- the old content fades
  out, and only then is the new one mounted and brought in, so mounting a
  whole page cannot stall the fade and two texts are never readable at once.

  The motion names the way the content moves: `up` rises (the new one was
  further down its list), `left` goes left (the new one was further right).
  Motion keeps an interrupted fade continuous. The drawer's separately owned
  content swap still uses the matching CSS treatment in swap.css.
*/
export type SwapMotion = 'fade' | 'up' | 'down' | 'left' | 'right';

const OFFSET: Record<SwapMotion, { x: string; y: string }> = {
  fade: { x: '0rem', y: '0rem' },
  up: { x: '0rem', y: '-0.5rem' },
  down: { x: '0rem', y: '0.5rem' },
  left: { x: '-0.75rem', y: '0rem' },
  right: { x: '0.75rem', y: '0rem' },
};
const OPPOSITE: Record<SwapMotion, SwapMotion> = {
  fade: 'fade',
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

// How long the old content takes to go and the new one to come, in seconds.
export type SwapPace = { leave: number; enter: number };
const PANE_PACE: SwapPace = { leave: DURATION_STATE, enter: DURATION_PANE };
// A tab's body is a smaller thing to trade than a page, so it goes quicker.
const TAB_PACE: SwapPace = { leave: DURATION_TAB_LEAVE, enter: DURATION_STATE };

// The fade-out normally ends in Motion's completion callback; this covers
// a missed event.
const LEAVE_FALLBACK_MS = 300;

export function useSwap<K extends string>(
  target: K,
  motionBetween: (from: K, to: K) => SwapMotion,
  // False puts the target straight on screen: a change nobody asked for,
  // such as a stored preference arriving after hydration, is not a journey.
  animate = true,
  pace: SwapPace = PANE_PACE,
) {
  const reduceMotion = useReducedMotion();
  // The key on screen, whether it is fading out, and how it came in.
  // Adjusted during render, reading the target as it is when the fade ends.
  const [shown, setShown] = useState(target);
  const [leaving, setLeaving] = useState<SwapMotion | 'done' | null>(null);
  const [entering, setEntering] = useState<SwapMotion | null>(null);
  if (!animate || reduceMotion) {
    if (shown !== target) setShown(target);
    if (leaving !== null) setLeaving(null);
    if (entering !== null) setEntering(null);
  } else if (leaving !== null && shown === target) {
    // A quick return should reverse the current fade, not blank the same page.
    setLeaving(null);
    setEntering(null);
  } else if (leaving === 'done') {
    setEntering(motionBetween(shown, target));
    setShown(target);
    setLeaving(null);
  } else if (leaving === null && shown !== target) {
    setLeaving(motionBetween(shown, target));
  }

  const fading = leaving !== null && leaving !== 'done';
  useEffect(() => {
    if (!fading) return;
    const timer = window.setTimeout(
      () => setLeaving('done'),
      LEAVE_FALLBACK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [fading]);

  const exitOffset = OFFSET[fading ? leaving : 'fade'];
  const enterOffset = OFFSET[OPPOSITE[entering ?? 'fade']];

  return {
    shown,
    // What replaces `shown` once it has faded, for a caller that renders it
    // ahead, hidden, so the swap only has to show it.
    incoming: fading && target !== shown ? target : null,
    entering: entering !== null,
    // Spread onto a keyed motion.div. The old page stays inert until it leaves.
    layer: {
      initial:
        entering && !reduceMotion
          ? { opacity: 0, x: enterOffset.x, y: enterOffset.y }
          : false,
      animate: {
        opacity: fading ? 0 : 1,
        x: exitOffset.x,
        y: exitOffset.y,
      },
      transition: {
        duration: fading ? pace.leave : pace.enter,
        ease: EASE_OUT_QUAD,
      },
      inert: fading,
      style: { pointerEvents: fading ? ('none' as const) : undefined },
      onAnimationComplete: (definition: unknown) => {
        if (
          fading &&
          typeof definition === 'object' &&
          definition !== null &&
          'opacity' in definition &&
          definition.opacity === 0
        )
          setLeaving((current) => (current === leaving ? 'done' : current));
      },
    },
  };
}

/*
  A tab's content, traded as useSwap trades it: the old body fades out, then
  the chosen one fades in. The tabs answer at once; only what they show waits.
*/
export function TabSwap<K extends string>({
  selected,
  className,
  children,
}: {
  selected: K;
  className?: string;
  // Drawn for the key on screen, which trails `selected` through the fade.
  children: (shown: K) => ReactNode;
}) {
  const { shown, layer } = useSwap(selected, () => 'fade', true, TAB_PACE);
  const body = useRef<HTMLDivElement>(null);
  const [first] = useState(shown);
  // A body scrolled past its start opens the next one at its start, rather
  // than part-way down a text of another length.
  useLayoutEffect(() => {
    if (shown === first || !body.current) return;
    const scroller = scrollerOf(body.current);
    if (!scroller) return;
    const above =
      scroller.getBoundingClientRect().top -
      body.current.getBoundingClientRect().top;
    if (above > 0) scroller.scrollTop -= above;
  }, [shown, first]);
  return (
    <motion.div key={shown} ref={body} {...layer} className={className}>
      {children(shown)}
    </motion.div>
  );
}

function scrollerOf(element: HTMLElement): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(at).overflowY)) return at;
  }
  return null;
}
