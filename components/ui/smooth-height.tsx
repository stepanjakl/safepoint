'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { cx } from '@/lib/ui/cx';
import { pacedDuration } from '@/lib/ui/motion';

/*
  Eases a container's height in place whenever its content grows or shrinks,
  using the same `pacedDuration(..., 'fold', delta)` and `--ease-fold` curve
  as `Fold` and `ThreadStep`. Tags its Web Animation with `id: 'smooth-height'`
  so an enclosing `ThreadStep` yields to it instead of fighting frame by frame.
*/
export const SMOOTH_HEIGHT_ANIMATION_ID = 'smooth-height';

export function SmoothHeight({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!clip || !inner) return;
    let last: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize ?? inner.offsetHeight;
      const from = last;
      last = height;
      if (
        from === undefined ||
        Math.abs(height - from) < 1 ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const easing = clip.getAnimations();
      const start = easing.length ? clip.getBoundingClientRect().height : from;
      easing.forEach((animation) => animation.cancel());
      clip.animate(
        { height: [`${start}px`, `${height}px`] },
        {
          id: SMOOTH_HEIGHT_ANIMATION_ID,
          duration: pacedDuration(clip, 'fold', height - start),
          easing: getComputedStyle(clip).getPropertyValue('--ease-fold').trim(),
        },
      );
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={clipRef} className={cx('overflow-y-clip', className)}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
