'use client';

import { useEffect, useRef } from 'react';

const HIDDEN_STORAGE_KEY = 'safepoint.dev.controls-hidden';

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

    try {
      if (window.localStorage.getItem(HIDDEN_STORAGE_KEY) === 'on') {
        host.classList.add('is-hidden');
      }
    } catch {
      // Private browsing or blocked site data: default to visible.
    }

    // Ctrl+` toggles the whole panel, including while it's hidden -- the
    // listener lives on window, not the host, so it works either way.
    // Ctrl+Shift+` is the style inspector's.
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.shiftKey || event.code !== 'Backquote')
        return;
      event.preventDefault();
      const next = !host!.classList.contains('is-hidden');
      host!.classList.toggle('is-hidden', next);
      try {
        window.localStorage.setItem(HIDDEN_STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        // A shortcut that can't remember the choice still toggles for the session.
      }
    }
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelled = true;
      dispose?.();
      window.removeEventListener('keydown', onKeyDown);
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
.sp-devctl.is-hidden { display: none; }
`;
