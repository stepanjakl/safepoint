'use client';

import { useEffect, useRef } from 'react';

/** Load the imperative debug UI only in development, after hydration. */
export function DesignControls() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (process.env.NODE_ENV !== 'development' || !host) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import('./design-pane')
      .then(({ mountDesignPane }) => {
        if (!cancelled) dispose = mountDesignPane(host);
      })
      .catch(() => {
        if (!cancelled)
          host.textContent = 'Design controls could not load. Reload to retry.';
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <>
      <style>{PANEL_CSS}</style>
      <div
        ref={hostRef}
        className="sp-devctl"
        role="region"
        aria-label="Design and motion controls"
      />
    </>
  );
}

const PANEL_CSS = `
.sp-devctl {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  width: min(320px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  color-scheme: dark;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-feature-settings: normal;
}
.sp-devctl :focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
`;
