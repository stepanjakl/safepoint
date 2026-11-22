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
    let animation: Animation | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize ?? inner.offsetHeight;
      if (height === last) return;
      const start =
        animation?.playState === 'running'
          ? clip.getBoundingClientRect().height
          : last;
      last = height;

      // Keep the last measurement in layout until the next animation starts.
      clip.style.height = `${height}px`;
      animation?.cancel();
      if (
        start === undefined ||
        Math.abs(height - start) < 1 ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;

      animation = clip.animate(
        { height: [`${start}px`, `${height}px`] },
        {
          id: SMOOTH_HEIGHT_ANIMATION_ID,
          duration: pacedDuration(clip, 'fold', height - start),
          easing: getComputedStyle(clip).getPropertyValue('--ease-fold').trim(),
        },
      );
    });
    observer.observe(inner);
    return () => {
      observer.disconnect();
      animation?.cancel();
      clip.style.removeProperty('height');
    };
  }, []);

  return (
    <div ref={clipRef} className={cx('overflow-y-clip', className)}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
