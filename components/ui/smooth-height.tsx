'use client';

import { useEffectEvent, useLayoutEffect, useRef, type ReactNode } from 'react';

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
  hold = false,
  onSettled,
  children,
}: {
  className?: string;
  hold?: boolean;
  onSettled?: () => void;
  children: ReactNode;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const syncHeight = useRef<(() => void) | null>(null);
  const isHeld = useEffectEvent(() => hold);
  const reportSettled = useEffectEvent(() => onSettled?.());

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!clip || !inner) return;
    let last: number | undefined;
    let animation: Animation | undefined;
    const resize = (height: number) => {
      if (isHeld() && last !== undefined) return;
      if (height === last) {
        if (animation?.playState === 'paused') animation.play();
        if (!animation && !isHeld()) reportSettled();
        return;
      }
      const start = animation ? clip.getBoundingClientRect().height : last;
      last = height;
      clip.style.height = `${height}px`;
      animation?.cancel();
      animation = undefined;
      if (
        start === undefined ||
        Math.abs(height - start) < 1 ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        if (!isHeld()) reportSettled();
        return;
      }

      const next = clip.animate(
        { height: [`${start}px`, `${height}px`] },
        {
          id: SMOOTH_HEIGHT_ANIMATION_ID,
          duration: pacedDuration(clip, 'fold', height - start),
          easing: getComputedStyle(clip).getPropertyValue('--ease-fold').trim(),
        },
      );
      animation = next;
      next.onfinish = () => {
        if (animation !== next) return;
        animation = undefined;
        if (!isHeld()) resize(inner.getBoundingClientRect().height);
      };
    };
    syncHeight.current = () => {
      if (last === undefined) return;
      if (isHeld()) {
        if (animation?.playState === 'running') animation.pause();
      } else {
        // The replacement may have mounted before the observer has measured it.
        resize(inner.getBoundingClientRect().height);
      }
    };
    const observer = new ResizeObserver(([entry]) => {
      resize(entry?.borderBoxSize[0]?.blockSize ?? inner.offsetHeight);
    });
    observer.observe(inner);
    return () => {
      syncHeight.current = null;
      observer.disconnect();
      animation?.cancel();
      clip.style.removeProperty('height');
    };
  }, []);

  useLayoutEffect(() => {
    syncHeight.current?.();
  }, [hold]);

  return (
    <div ref={clipRef} className={cx('overflow-y-clip', className)}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
