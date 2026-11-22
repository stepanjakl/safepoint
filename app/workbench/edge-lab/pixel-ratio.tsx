'use client';

import { useEffect } from 'react';

/*
  Keeps the lab's --lab-dp at one device pixel. A media query can name only
  the ratios written into it; zoom and a move between displays produce others.
*/
export function EdgeLabPixelRatio({ target }: { target: string }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(target);
    if (!root) return;
    let query: MediaQueryList | null = null;
    const apply = () => {
      root.style.setProperty('--lab-dp', `${1 / window.devicePixelRatio}px`);
      query?.removeEventListener('change', apply);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener('change', apply);
    };
    apply();
    return () => query?.removeEventListener('change', apply);
  }, [target]);
  return null;
}
