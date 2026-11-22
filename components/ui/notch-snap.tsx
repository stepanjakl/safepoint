'use client';

import { useEffect, useRef } from 'react';

/*
  Puts the notch's loose edge on a device pixel. The notch is as wide as its
  controls, so that edge usually falls between pixels; WebKit then paints its
  outline from a rounded origin and the corner it draws lands a third of a
  device pixel off the pane's ring, where Chrome's does not. The anchored edge
  is already on a pixel, so the remainder goes on the sloped side as
  --notch-snap (notch.css). Measured again whenever the notch resizes -- a
  label morphing, a font arriving -- and when the pixel ratio changes.
*/
export function NotchSnap() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const notch = marker.current?.parentElement;
    if (!notch) return;
    let applied = 0;
    const snap = () => {
      const ratio = window.devicePixelRatio || 1;
      const natural = notch.getBoundingClientRect().width - applied;
      const extra = Math.ceil(natural * ratio - 0.001) / ratio - natural;
      if (Math.abs(extra - applied) < 0.001) return;
      applied = extra;
      notch.style.setProperty('--notch-snap', `${extra}px`);
    };
    const observer = new ResizeObserver(snap);
    observer.observe(notch);
    let query: MediaQueryList | null = null;
    const onRatio = () => {
      snap();
      watch();
    };
    const watch = () => {
      query?.removeEventListener('change', onRatio);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener('change', onRatio);
    };
    watch();
    return () => {
      observer.disconnect();
      query?.removeEventListener('change', onRatio);
      notch.style.removeProperty('--notch-snap');
    };
  }, []);

  return <span ref={marker} hidden />;
}
