'use client';

import { useEffect, type RefObject } from 'react';

export const SPEEDS = [
  { rate: 1, label: '1×' },
  { rate: 0.25, label: '¼×' },
];

/*
  Plays every animation inside `figure` at `rate`, so motion can be judged
  slowed down. Every frame rather than once: animations that start later --
  a ring leaving on its own beat -- must be slowed before their first frame.
*/
export function useSlowMotion(
  figure: RefObject<HTMLElement | null>,
  rate: number,
) {
  useEffect(() => {
    const animations = () =>
      figure.current?.getAnimations({ subtree: true }) ?? [];
    if (rate === 1) {
      animations().forEach((animation) => (animation.playbackRate = 1));
      return;
    }
    let frame = 0;
    const slow = () => {
      animations().forEach((animation) => {
        if (animation.playbackRate !== rate) animation.playbackRate = rate;
      });
      frame = requestAnimationFrame(slow);
    };
    slow();
    return () => cancelAnimationFrame(frame);
  }, [figure, rate]);
}
