'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { DURATION_PANE, DURATION_STATE, EASE_OUT_QUAD } from '@/lib/motion';

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

// The fade-out normally ends in Motion's completion callback; this covers
// a missed event.
const LEAVE_FALLBACK_MS = 300;

export function useSwap<K extends string>(
  target: K,
  motionBetween: (from: K, to: K) => SwapMotion,
  // False puts the target straight on screen: a change nobody asked for,
  // such as a stored preference arriving after hydration, is not a journey.
  animate = true,
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
        duration: fading ? DURATION_STATE : DURATION_PANE,
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

// The motion between two places in one ordered list, on either axis.
export function motionAlong(
  order: readonly string[],
  axis: 'vertical' | 'horizontal',
) {
  return (from: string, to: string): SwapMotion => {
    const was = order.indexOf(from);
    const is = order.indexOf(to);
    if (was < 0 || is < 0 || was === is) return 'fade';
    if (axis === 'vertical') return is > was ? 'up' : 'down';
    return is > was ? 'left' : 'right';
  };
}
