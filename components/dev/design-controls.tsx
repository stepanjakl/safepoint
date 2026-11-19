'use client';

import { useEffect, useRef } from 'react';

const HIDDEN_STORAGE_KEY = 'safepoint.dev.controls-hidden';
const POSITION_STORAGE_KEY = 'safepoint.dev.controls-position';

type PanelPosition = { left: number; top: number };

const BANNER_GAP = 8;
const MIN_BANNER_TOP = 80;

/** Load the imperative debug UI only in development, after hydration. */
export function DesignControls() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (process.env.NODE_ENV !== 'development' || !host) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const disposeBannerAnchor = trackBannerAnchor(host);
    void import('./design-pane')
      .then(({ mountDesignPane }) => {
        if (!cancelled) {
          dispose = mountDesignPane(host);
          const disposeMovement = enablePanelMovement(host);
          const disposePane = dispose;
          dispose = () => {
            disposeMovement();
            disposePane();
          };
        }
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
      disposeBannerAnchor();
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
        // Usable over an open modal: React Aria leaves its top layer alone.
        data-react-aria-top-layer="true"
        role="region"
        aria-label="Design and motion controls"
      />
    </>
  );
}

const PANEL_CSS = `
.sp-devctl {
  position: fixed;
  left: var(--sp-devctl-left, 16px);
  bottom: var(--sp-devctl-bottom, 16px);
  z-index: 2147483000;
  width: min(320px, calc(100vw - 32px));
  max-height: max(120px, calc(100dvh - var(--sp-devctl-bottom, 16px) - 16px));
  overflow: hidden;
  color-scheme: dark;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-feature-settings: normal;
}
.sp-devctl:has(> .tp-rotv > button[aria-expanded="false"]) {
  width: min(200px, calc(100vw - 32px));
}
.sp-devctl > .tp-rotv {
  display: flex;
  flex-direction: column;
  max-height: inherit;
}
.sp-devctl > .tp-rotv > .tp-rotv_b { flex-shrink: 0; }
/* Tweakpane clips this body while folding; the expanded body must scroll. */
.sp-devctl > .tp-rotv.tp-rotv-expanded > .tp-rotv_c {
  min-height: 0;
  overflow-y: auto;
}
.sp-devctl-move-handle { cursor: grab; touch-action: none; user-select: none; }
.sp-devctl.is-dragging .sp-devctl-move-handle { cursor: grabbing; }
.sp-devctl-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.sp-devctl :focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
.sp-devctl.is-hidden { display: none; }
`;

function enablePanelMovement(host: HTMLElement) {
  const handle = host.querySelector<HTMLButtonElement>('.tp-rotv > .tp-rotv_b');
  if (!handle) return () => {};

  const help = document.createElement('span');
  help.id = 'sp-devctl-move-help';
  help.className = 'sp-devctl-sr-only';
  help.textContent =
    'Drag to move, or double-click to reset. Use the arrow keys to reposition, Shift plus an arrow for larger steps, or Home to reset.';
  host.append(help);
  const previousDescription = handle.getAttribute('aria-describedby');
  handle.setAttribute(
    'aria-describedby',
    [previousDescription, help.id].filter(Boolean).join(' '),
  );
  handle.classList.add('sp-devctl-move-handle');

  let drag: {
    pointerId: number;
    startX: number;
    startY: number;
    left: number;
    top: number;
    moved: boolean;
  } | null = null;
  let customPosition = false;
  let suppressPointerClick = false;

  function clampPosition(position: PanelPosition): PanelPosition {
    const maxLeft = Math.max(8, window.innerWidth - host.offsetWidth - 8);
    // Keep the handle reachable; the open body scrolls in the space below it.
    const handleHeight = handle?.offsetHeight ?? host.offsetHeight;
    const maxTop = Math.max(8, window.innerHeight - handleHeight - 8);
    return {
      left: Math.min(maxLeft, Math.max(8, position.left)),
      top: Math.min(maxTop, Math.max(8, position.top)),
    };
  }

  function applyPosition(position: PanelPosition): PanelPosition {
    const bounded = clampPosition(position);
    host.style.left = `${bounded.left}px`;
    host.style.top = `${bounded.top}px`;
    host.style.maxHeight = `calc(100dvh - ${bounded.top}px - 8px)`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    return bounded;
  }

  function savePosition(position: PanelPosition) {
    const bounded = applyPosition(position);
    customPosition = true;
    try {
      window.localStorage.setItem(
        POSITION_STORAGE_KEY,
        JSON.stringify(bounded),
      );
    } catch {
      // Keep the position for this session if site storage is unavailable.
    }
  }

  function currentPosition(): PanelPosition {
    const bounds = host.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  }

  function resetPosition() {
    customPosition = false;
    host.style.removeProperty('left');
    host.style.removeProperty('top');
    host.style.removeProperty('right');
    host.style.removeProperty('bottom');
    host.style.removeProperty('max-height');
    try {
      window.localStorage.removeItem(POSITION_STORAGE_KEY);
    } catch {
      // Reset still works for this session if site storage is unavailable.
    }
  }

  try {
    const stored = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (stored) {
      const value: unknown = JSON.parse(stored);
      if (
        typeof value === 'object' &&
        value !== null &&
        'left' in value &&
        'top' in value &&
        typeof value.left === 'number' &&
        Number.isFinite(value.left) &&
        typeof value.top === 'number' &&
        Number.isFinite(value.top)
      ) {
        savePosition({ left: value.left, top: value.top });
      }
    }
  } catch {
    // The default anchored position remains usable without site storage.
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const position = currentPosition();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: position.left,
      top: position.top,
      moved: false,
    };
    handle?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
    drag.moved = true;
    host.classList.add('is-dragging');
    applyPosition({ left: drag.left + deltaX, top: drag.top + deltaY });
    event.preventDefault();
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      savePosition(currentPosition());
      suppressPointerClick = true;
      window.setTimeout(() => {
        suppressPointerClick = false;
      }, 0);
    }
    drag = null;
    host.classList.remove('is-dragging');
  }

  function onPointerCancel() {
    drag = null;
    host.classList.remove('is-dragging');
  }

  function onClick(event: MouseEvent) {
    if (!suppressPointerClick || event.detail === 0) return;
    suppressPointerClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeyDown(event: KeyboardEvent) {
    const directions: Record<string, PanelPosition> = {
      ArrowDown: { left: 0, top: 1 },
      ArrowLeft: { left: -1, top: 0 },
      ArrowRight: { left: 1, top: 0 },
      ArrowUp: { left: 0, top: -1 },
    };
    const direction = directions[event.key];
    if (direction) {
      const step = event.shiftKey ? 64 : 16;
      const position = currentPosition();
      savePosition({
        left: position.left + direction.left * step,
        top: position.top + direction.top * step,
      });
      event.preventDefault();
    } else if (event.key === 'Home') {
      resetPosition();
      event.preventDefault();
    }
  }

  function onDoubleClick() {
    if (!customPosition) return;
    resetPosition();
  }

  function onResize() {
    if (customPosition) savePosition(currentPosition());
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerCancel);
  handle.addEventListener('click', onClick, true);
  handle.addEventListener('dblclick', onDoubleClick);
  handle.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerCancel);
    handle.removeEventListener('click', onClick, true);
    handle.removeEventListener('dblclick', onDoubleClick);
    handle.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    handle.classList.remove('sp-devctl-move-handle');
    if (previousDescription) {
      handle.setAttribute('aria-describedby', previousDescription);
    } else {
      handle.removeAttribute('aria-describedby');
    }
    help.remove();
  };
}

function trackBannerAnchor(host: HTMLElement) {
  let observedNotice: HTMLElement | null = null;
  let frame = 0;

  const sync = () => {
    frame = 0;
    const notice = document.querySelector<HTMLElement>('[data-sidebar-notice]');
    if (notice !== observedNotice) {
      resizeObserver.disconnect();
      observedNotice = notice;
      if (notice) resizeObserver.observe(notice);
    }
    if (!notice || notice.closest('[inert], [aria-hidden="true"]') !== null) {
      host.style.removeProperty('--sp-devctl-left');
      host.style.removeProperty('--sp-devctl-bottom');
      return;
    }
    const rect = notice.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.left < 0 ||
      rect.top <= MIN_BANNER_TOP ||
      rect.bottom > window.innerHeight
    ) {
      host.style.removeProperty('--sp-devctl-left');
      host.style.removeProperty('--sp-devctl-bottom');
      return;
    }
    host.style.setProperty('--sp-devctl-left', `${Math.round(rect.left)}px`);
    host.style.setProperty(
      '--sp-devctl-bottom',
      `${Math.round(window.innerHeight - rect.top + BANNER_GAP)}px`,
    );
  };

  const scheduleSync = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };

  const resizeObserver = new ResizeObserver(scheduleSync);
  const mutationObserver = new MutationObserver(scheduleSync);
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['inert', 'aria-hidden', 'data-collapsed'],
  });
  window.addEventListener('resize', scheduleSync);
  sync();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    window.removeEventListener('resize', scheduleSync);
    host.style.removeProperty('--sp-devctl-left');
    host.style.removeProperty('--sp-devctl-bottom');
  };
}
