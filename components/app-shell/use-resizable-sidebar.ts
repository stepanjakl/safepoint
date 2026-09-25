'use client';

import {
  useEffect,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { useReducedMotion } from 'motion/react';

import type { SidebarPreferences } from './sidebar-preferences';

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

const HOVER_SETTLE_MS = 90;
const HOVER_SPEED_LIMIT = 0.35; // CSS pixels per millisecond.

export function useResizableSidebar({
  side,
  label,
  preferences,
  onChange,
}: {
  side: 'left' | 'right';
  label: string;
  preferences: SidebarPreferences;
  onChange: (value: SidebarPreferences) => void;
}) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [gripPressed, setGripPressed] = useState(false);
  const [directionArmed, setDirectionArmed] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [gripHovered, setGripHovered] = useState(false);
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
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearHoverTimer = useCallback(() => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);

  // Stable, because the handle observes its own grip with it: a leave that was
  // rebuilt every render would tear that observer down on every render too.
  const leaveHover = useCallback(() => {
    clearHoverTimer();
    setHovered(false);
  }, [clearHoverTimer]);

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
        minimum && normal && maximum && unit && closed !== undefined
          ? { min: minimum, normal, max: maximum, unit, closed }
          : null,
      );
      if (!minimum) {
        drag.current = null;
        if (hold.current !== null) clearTimeout(hold.current);
        hold.current = null;
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
    };
  }, []);

  const collapsed =
    (side === 'right' || bounds !== null) && preferences.collapsed;
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
  // At rest the grip points at what a click would do instead: open when hidden,
  // hide when open. Paths are drawn for the left edge and mirrored for the
  // right, so 'open' is always the arrow that points into the sheet.
  const gripHint =
    preview !== null
      ? directionArmed
        ? willClose
          ? 'close'
          : 'open'
        : null
      : hovered
        ? collapsed
          ? 'open'
          : 'close'
        : null;
  const gripPath =
    gripHint === 'close'
      ? 'M14 4 L10 22 L14 40'
      : gripHint === 'open'
        ? 'M10 4 L14 22 L10 40'
        : 'M12 4 L12 22 L12 40';

  function stopHold() {
    if (hold.current !== null) clearTimeout(hold.current);
    hold.current = null;
  }

  const cancelDrag = useCallback(() => {
    if (hold.current !== null) clearTimeout(hold.current);
    hold.current = null;
    if (!drag.current) return;
    drag.current = null;
    setIsDragging(false);
    setGripPressed(false);
    setPreview(null);
  }, []);

  function toggle() {
    cancelDrag();
    onChange({ ...preferences, collapsed: !collapsed });
  }

  function resize(next: number | null) {
    if (!bounds) return;
    onChange({
      width: next === null ? null : clamp(next) / bounds.unit,
      collapsed: false,
    });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || !bounds) return;
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
      Math.max(
        bounds.closed,
        session.width +
          (event.clientX - session.x) * (side === 'left' ? 1 : -1),
      ),
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
    if (session.moved) {
      releasedAt.current = { x: event.clientX, y: event.clientY };
      leaveHover();
    }
    if (session.moved && bounds) {
      if (session.next <= snapThreshold) {
        // Closing preserves the last usable width, never the narrow preview.
        onChange({ ...preferences, collapsed: true });
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
    if (!session.moved) {
      if (event.altKey) resize(null);
      else toggle();
    }
  }

  return {
    side,
    label,
    bounds,
    preview,
    isDragging,
    gripPressed,
    optionsOpen,
    setOptionsOpen,
    hovered,
    gripHovered,
    setGripHovered,
    keyboardFocused,
    setKeyboardFocused,
    reduceMotion,
    probes,
    handle,
    grip,
    navigationRef,
    navigationId,
    helpId,
    collapsed,
    width,
    willClose,
    willSnapOpen,
    dragOpacity,
    gripPath,
    cancelDrag,
    toggle,
    resize,
    startDrag,
    moveDrag,
    endDrag,
    updateHover,
    leaveHover,
    drag,
  };
}

export type SidebarController = ReturnType<typeof useResizableSidebar>;
