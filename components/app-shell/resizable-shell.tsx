'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { Dialog, Popover } from 'react-aria-components';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { DURATION_STATE } from '@/lib/motion';
import {
  parseSidebarPreferences,
  readSidebarPreferences,
  saveSidebarPreferences,
  serverSidebarPreferences,
  subscribeSidebarPreferences,
} from './sidebar-preferences';

type Bounds = {
  min: number;
  max: number;
  normal: number;
  unit: number;
  closed: number;
};
type Drag = {
  pointer: number;
  x: number;
  y: number;
  width: number;
  next: number;
  moved: boolean;
  startedClosed: boolean;
};

// Briefly retain the old click target while the sheet moves immediately.
const DOUBLE_CLICK_WINDOW = 500;
const HOVER_SETTLE_MS = 90;
const HOVER_SPEED_LIMIT = 0.35; // CSS pixels per millisecond.

/** The server-rendered menu and sheet remain opaque children during a drag. */
export function ResizableShell({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    subscribeSidebarPreferences,
    readSidebarPreferences,
    serverSidebarPreferences,
  );
  const preferences = parseSidebarPreferences(snapshot);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [gripPressed, setGripPressed] = useState(false);
  const [clickTarget, setClickTarget] = useState<DOMRect | null>(null);
  const [directionArmed, setDirectionArmed] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const pointerSample = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  const probes = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLSpanElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const releasedAt = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationId = useId();
  const helpId = useId();

  useEffect(() => {
    // Track the approach outside the narrow edge, without rendering on moves.
    const sample = (event: globalThis.PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerSample.current = {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      };
    };
    document.addEventListener('pointermove', sample, { passive: true });
    return () => {
      document.removeEventListener('pointermove', sample);
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    };
  }, []);

  function clearHoverTimer() {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }

  function leaveHover() {
    clearHoverTimer();
    setHovered(false);
  }

  // Resolve lengths in the browser, including the viewport cap and rem scale.
  // CSS owns every width and the breakpoint; a hidden probe has zero width
  // below that breakpoint, so JS cannot disagree with the responsive layout.
  useLayoutEffect(() => {
    const element = probes.current;
    if (!element) return;
    const measure = () => {
      const [minimum, normal, maximum, unit, closed] = Array.from(
        element.children,
      ).map((child) => child.getBoundingClientRect().width);
      setBounds(
        minimum && normal && maximum && unit && closed
          ? { min: minimum, normal, max: maximum, unit, closed }
          : null,
      );
      if (!minimum) {
        drag.current = null;
        suppressClick.current = true;
        if (hold.current !== null) clearTimeout(hold.current);
        hold.current = null;
        if (pendingClick.current !== null) clearTimeout(pendingClick.current);
        pendingClick.current = null;
        setIsDragging(false);
        setGripPressed(false);
        setPreview(null);
        setOptionsOpen(false);
      }
    };
    const observer = new ResizeObserver(measure);
    for (const child of element.children) observer.observe(child);
    measure();
    return () => {
      observer.disconnect();
      if (hold.current !== null) clearTimeout(hold.current);
      if (pendingClick.current !== null) clearTimeout(pendingClick.current);
    };
  }, []);

  const collapsed = bounds !== null && preferences.collapsed;
  const clamp = (width: number) =>
    bounds ? Math.min(bounds.max, Math.max(bounds.min, width)) : width;
  const width = bounds
    ? clamp(
        preview ??
          (preferences.width === null
            ? bounds.normal
            : preferences.width * bounds.unit),
      )
    : 0;
  const snapThreshold = bounds ? (bounds.min + bounds.closed) / 2 : 0;
  const willClose = preview !== null && preview <= snapThreshold;
  const willSnapOpen =
    bounds !== null &&
    preview !== null &&
    preview > snapThreshold &&
    preview < bounds.min;
  const dragOpacity =
    bounds && preview !== null
      ? Math.min(
          1,
          Math.max(0, (preview - bounds.closed) / (bounds.min - bounds.closed)),
        )
      : 1;
  // Each gesture starts neutral. Only after crossing into the opposite state
  // do arrows track both sides of the threshold for the rest of that gesture.
  const gripPath =
    preview !== null && directionArmed && willClose
      ? 'M14 4 L10 22 L14 40'
      : (preview !== null && directionArmed && !willClose) ||
          (collapsed && preview === null && hovered)
        ? 'M10 4 L14 22 L10 40'
        : 'M12 4 L12 22 L12 40';

  // Cross-tab changes can hide the menu while it owns focus. Return focus to
  // the still-visible separator before that navigation becomes inert.
  useLayoutEffect(() => {
    if (collapsed && navigationRef.current?.contains(document.activeElement)) {
      handle.current?.focus();
    }
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed) return;
    const revealForSearch = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'k' ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey)
      )
        return;
      // Remove inert before the menu's existing document listener tries to
      // focus its search field in the same keyboard event.
      flushSync(() => {
        saveSidebarPreferences({
          ...parseSidebarPreferences(readSidebarPreferences()),
          collapsed: false,
        });
      });
    };
    document.addEventListener('keydown', revealForSearch, true);
    return () => document.removeEventListener('keydown', revealForSearch, true);
  }, [collapsed]);

  function stopHold() {
    if (hold.current !== null) clearTimeout(hold.current);
    hold.current = null;
  }

  function cancelPendingClick() {
    if (pendingClick.current !== null) clearTimeout(pendingClick.current);
    pendingClick.current = null;
    setClickTarget(null);
  }

  function cancelDrag() {
    cancelPendingClick();
    stopHold();
    if (!drag.current) return;
    drag.current = null;
    suppressClick.current = true;
    setIsDragging(false);
    setGripPressed(false);
    setPreview(null);
  }

  function toggle() {
    cancelDrag();
    saveSidebarPreferences({ ...preferences, collapsed: !collapsed });
  }

  function resize(next: number | null) {
    cancelPendingClick();
    if (!bounds) return;
    saveSidebarPreferences({
      width: next === null ? null : clamp(next) / bounds.unit,
      collapsed: false,
    });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || !bounds) return;
    cancelPendingClick();
    suppressClick.current = false;
    clearHoverTimer();
    setKeyboardFocused(false);
    setGripPressed(
      event.target instanceof Node && !!grip.current?.contains(event.target),
    );
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: collapsed ? bounds.closed : width,
      next: collapsed ? bounds.closed : width,
      moved: false,
      startedClosed: collapsed,
    };
    setDirectionArmed(false);
    setPreview(collapsed ? bounds.closed : width);
    if (event.pointerType !== 'mouse') {
      hold.current = setTimeout(() => {
        cancelDrag();
        setOptionsOpen(true);
      }, 500);
    }
  }

  function updateHover(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch' || drag.current) return;
    // A settling edge can enter the stationary pointer after release. Only
    // actual pointer movement should re-enable its hover treatment.
    const released = releasedAt.current;
    if (
      released &&
      event.clientX === released.x &&
      event.clientY === released.y
    )
      return;
    releasedAt.current = null;
    if (hovered) return;
    clearHoverTimer();
    const previous = pointerSample.current;
    const elapsed = previous ? event.timeStamp - previous.time : 0;
    if (
      previous &&
      elapsed > 0 &&
      elapsed <= HOVER_SETTLE_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) /
        elapsed <=
        HOVER_SPEED_LIMIT
    ) {
      setHovered(true);
    } else {
      // A fast arrival can still be intentional if it comes to rest here.
      hoverTimer.current = setTimeout(() => {
        hoverTimer.current = null;
        setHovered(true);
      }, HOVER_SETTLE_MS);
    }
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const session = drag.current;
    if (!session) {
      updateHover(event);
      return;
    }
    if (!session || session.pointer !== event.pointerId || !bounds) return;
    // A little pointer slop keeps a click a click; once a drag begins, coming
    // back to the starting point must not turn its release into a collapse.
    if (
      !session.moved &&
      Math.hypot(event.clientX - session.x, event.clientY - session.y) < 5
    )
      return;
    stopHold();
    session.moved = true;
    setIsDragging(true);
    session.next = Math.min(
      bounds.max,
      Math.max(bounds.closed, session.width + event.clientX - session.x),
    );
    if (
      session.startedClosed
        ? session.next > snapThreshold
        : session.next <= snapThreshold
    ) {
      setDirectionArmed(true);
    }
    setPreview(session.next);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const session = drag.current;
    if (!session || session.pointer !== event.pointerId) return;
    stopHold();
    drag.current = null;
    suppressClick.current = session.moved;
    if (session.moved) {
      releasedAt.current = { x: event.clientX, y: event.clientY };
      leaveHover();
    }
    if (session.moved && bounds) {
      if (session.next <= snapThreshold) {
        // Closing preserves the last usable width, never the narrow preview.
        saveSidebarPreferences({ ...preferences, collapsed: true });
      } else if (session.next < bounds.min) {
        resize(bounds.min);
      } else {
        resize(session.next);
      }
    }
    setIsDragging(false);
    setGripPressed(false);
    setPreview(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const style: CSSProperties & {
    '--sidebar-width'?: string;
    '--sidebar-drag-track'?: string;
    '--sidebar-drag-opacity'?: number;
  } = {
    '--sidebar-width': bounds ? `${width}px` : undefined,
    '--sidebar-drag-track': preview === null ? undefined : `${preview}px`,
    '--sidebar-drag-opacity': dragOpacity,
  };

  return (
    <div
      className="resizable-shell bg-canvas p-shell-inset max-shell:gap-3.5 shell:h-dvh shell:overflow-hidden relative grid"
      style={style}
      data-collapsed={collapsed || undefined}
      data-resizing={preview !== null || undefined}
      data-dragging={isDragging || undefined}
      data-close-pending={willClose || undefined}
    >
      {clickTarget ? (
        <div
          aria-hidden="true"
          className="fixed z-50 cursor-pointer"
          style={{
            left: clickTarget.left,
            top: clickTarget.top,
            width: clickTarget.width,
            height: clickTarget.height,
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            // Once the second press starts, keep its target alive through
            // release even if the double-click window expires meanwhile.
            if (pendingClick.current !== null)
              clearTimeout(pendingClick.current);
            pendingClick.current = null;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onClick={() => resize(null)}
          onPointerCancel={cancelPendingClick}
          onPointerLeave={cancelPendingClick}
        />
      ) : null}
      <div
        ref={probes}
        aria-hidden="true"
        className="max-shell:hidden pointer-events-none invisible absolute h-0 overflow-hidden"
      >
        <div className="w-sidebar-min" />
        <div className="w-sidebar-default" />
        <div className="w-sidebar-max" />
        <div className="w-4" />
        <div className="w-sidebar-closed" />
      </div>
      <div className="shell:min-h-0 min-w-0">
        <div
          id={navigationId}
          ref={navigationRef}
          className="sidebar-navigation shell:h-full"
          inert={collapsed || preview !== null}
          aria-hidden={collapsed || preview !== null || undefined}
        >
          {navigation}
        </div>
      </div>
      <div className="shell:min-h-0 relative min-w-0">
        <Tooltip
          label={collapsed ? 'Click to show sidebar' : 'Click to hide sidebar'}
          description={
            <>
              <span className="block">
                {collapsed ? 'Drag right to open' : 'Drag to resize'}
              </span>
              <span className="block">Double-click to reset</span>
            </>
          }
          placement="right"
          triggerRef={grip}
          offset={4}
          isDisabled={preview !== null || optionsOpen}
          isOpen={
            (hovered || keyboardFocused) && preview === null && !optionsOpen
          }
          onOpenChange={(open) => {
            if (!open) {
              leaveHover();
              setKeyboardFocused(false);
            }
          }}
        >
          <div
            ref={handle}
            role="separator"
            tabIndex={0}
            aria-label="Workspace navigation"
            aria-orientation="vertical"
            aria-controls={navigationId}
            aria-describedby={helpId}
            aria-valuemin={0}
            aria-valuemax={Math.round(bounds?.max ?? 0)}
            aria-valuenow={
              preview === null
                ? collapsed
                  ? 0
                  : Math.round(width)
                : Math.round(preview)
            }
            aria-valuetext={
              willClose
                ? 'Release to hide sidebar'
                : willSnapOpen
                  ? 'Release to open at minimum width'
                  : collapsed && preview === null
                    ? 'Hidden'
                    : `${Math.round(preview ?? width)} pixels wide`
            }
            className="sidebar-handle max-shell:hidden"
            data-hovered={hovered || undefined}
            data-grip-pressed={gripPressed || undefined}
            onPointerEnter={updateHover}
            onPointerLeave={leaveHover}
            onFocus={(event) =>
              setKeyboardFocused(event.currentTarget.matches(':focus-visible'))
            }
            onBlur={() => {
              cancelPendingClick();
              setKeyboardFocused(false);
            }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onClick={(event) => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              const target = grip.current?.getBoundingClientRect();
              if (event.detail <= 1) {
                toggle();
                if (event.detail === 1 && target) {
                  setClickTarget(target);
                  pendingClick.current = setTimeout(
                    cancelPendingClick,
                    DOUBLE_CLICK_WINDOW,
                  );
                }
              }
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              cancelDrag();
              resize(null);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              cancelDrag();
              event.currentTarget.focus();
              setOptionsOpen(true);
            }}
            onKeyDown={(event) => {
              cancelPendingClick();
              if (event.key === 'Escape') {
                cancelDrag();
                return;
              }
              if (
                event.key === 'ContextMenu' ||
                (event.shiftKey && event.key === 'F10')
              ) {
                event.preventDefault();
                setOptionsOpen(true);
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!event.repeat) toggle();
              } else if (
                bounds &&
                ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              ) {
                event.preventDefault();
                const step = bounds.unit * (event.shiftKey ? 2 : 0.5);
                resize(
                  event.key === 'Home'
                    ? bounds.min
                    : event.key === 'End'
                      ? bounds.max
                      : width + (event.key === 'ArrowLeft' ? -step : step),
                );
              }
            }}
          >
            <span ref={grip} className="sidebar-handle-mark" aria-hidden="true">
              <svg className="h-11 w-6" viewBox="0 0 24 44" fill="none">
                <motion.path
                  className="sidebar-handle-stroke"
                  initial={false}
                  animate={{ d: gripPath }}
                  transition={{
                    duration: reduceMotion ? 0 : DURATION_STATE,
                    ease: 'easeOut',
                  }}
                />
              </svg>
            </span>
          </div>
        </Tooltip>
        <span id={helpId} className="sr-only">
          Left and right arrows resize. Home selects the minimum width; End the
          maximum. Enter or Space hides or restores the sidebar. Escape cancels
          a drag. Right-click, touch and hold, or Shift F10 opens width presets.
          Drag left past halfway and release to hide; drag right to restore. A
          partial opening snaps to the minimum width. Double-click resets to the
          default width; choose Default in the width presets for the same
          action.
        </span>
        {children}
        <Popover
          isOpen={optionsOpen && bounds !== null}
          onOpenChange={setOptionsOpen}
          triggerRef={handle}
          placement="right"
          offset={8}
          className="control-face surface-floating rounded-shell p-2"
        >
          <Dialog
            aria-label="Sidebar width"
            className="grid gap-1 outline-none"
          >
            <p className="text-muted text-meta px-2 py-1">Sidebar width</p>
            {(['Compact', 'Default', 'Wide'] as const).map((label) => (
              <Button
                key={label}
                variant="secondary"
                onPress={() => {
                  if (!bounds) return;
                  resize(
                    label === 'Default'
                      ? null
                      : label === 'Compact'
                        ? bounds.min
                        : bounds.max,
                  );
                  setOptionsOpen(false);
                }}
              >
                {label}
              </Button>
            ))}
          </Dialog>
        </Popover>
      </div>
    </div>
  );
}
