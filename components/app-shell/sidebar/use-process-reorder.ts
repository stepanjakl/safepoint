'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';

import { moveProcess } from '@/lib/process/navigation';

/*
  The pitch of the list: a row plus the gap to the next one. The single
  definition -- it drives both the translate maths here and, published to CSS as
  --row-pitch on the list, the height of `.process-menu-row` and of the drop
  slot, so the two cannot drift apart.
*/
export const ROW_HEIGHT = 42;

// How close to the edge of the scrolling list a drag has to get before the list
// starts following it, and how fast it then travels per frame.
const AUTOSCROLL_EDGE = 32;
const AUTOSCROLL_STEP = 12;

export type Drag = {
  id: string;
  startY: number;
  startScrollTop: number;
  index: number;
  original: string[];
  offset: number;
};

/**
 * Reordering the process list by pointer and by keyboard. The draft order is
 * the menu's -- it also decides what the list shows -- so it is passed in;
 * everything that exists only while a row is moving lives here.
 */
export function useProcessReorder({
  order,
  customising,
  draft,
  setDraft,
}: {
  order: string[];
  customising: boolean;
  draft: string[] | null;
  setDraft: (next: string[]) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const focusHandle = useRef<string | null>(null);
  // The scrolling list, and the two values a drag has to keep reading off it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointerY = useRef(0);
  const autoScroll = useRef<number | null>(null);

  useLayoutEffect(() => {
    const id = focusHandle.current;
    if (id !== null) {
      handles.current.get(id)?.focus({ preventScroll: true });
      focusHandle.current = null;
    }
  }, [draft, drag]);

  function move(id: string, index: number) {
    if (
      !customising ||
      index === order.indexOf(id) ||
      index < 0 ||
      index >= order.length
    )
      return;
    setDraft(moveProcess(order, id, index));
  }

  /** A keyboard move: the handle keeps focus wherever its row lands. */
  function moveFromKeyboard(id: string, index: number) {
    focusHandle.current = id;
    move(id, index);
  }

  /*
    Recomputes the drag from wherever the pointer currently is. Called both from
    the pointer handler and from the auto-scroll frame, because scrolling the
    list moves the rows under a pointer that has not itself moved.

    The travel is measured against the list's scroll position as well as the
    pointer, so a drag that scrolls the list still lands on the row the pointer
    is actually over. It reads `original.length` rather than `order` so the
    auto-scroll closure cannot go stale between frames.
  */
  function applyDrag() {
    const active = dragRef.current;
    if (!active) return;
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const travel =
      pointerY.current - active.startY + (scrollTop - active.startScrollTop);
    const offset = Math.max(
      -active.index * ROW_HEIGHT,
      Math.min(
        (active.original.length - active.index - 1) * ROW_HEIGHT,
        travel,
      ),
    );
    const nextDrag = { ...active, offset };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
    setDraft(
      moveProcess(
        active.original,
        active.id,
        Math.round((active.index * ROW_HEIGHT + offset) / ROW_HEIGHT),
      ),
    );
  }

  /*
    A drag has to be able to reach rows that are off screen. While the pointer
    is held within AUTOSCROLL_EDGE of either end of the list, the list follows
    it a step at a time -- and only while it actually moves, so the loop stops
    doing work once it hits either end.
  */
  function autoScrollFrame() {
    const box = scrollRef.current;
    const active = dragRef.current;
    if (!box || !active) {
      autoScroll.current = null;
      return;
    }
    const bounds = box.getBoundingClientRect();
    const step =
      pointerY.current < bounds.top + AUTOSCROLL_EDGE
        ? -AUTOSCROLL_STEP
        : pointerY.current > bounds.bottom - AUTOSCROLL_EDGE
          ? AUTOSCROLL_STEP
          : 0;
    if (step !== 0) {
      const before = box.scrollTop;
      box.scrollTop = before + step;
      if (box.scrollTop !== before) applyDrag();
    }
    autoScroll.current = requestAnimationFrame(autoScrollFrame);
  }

  function stopAutoScroll() {
    if (autoScroll.current !== null) cancelAnimationFrame(autoScroll.current);
    autoScroll.current = null;
  }

  // A drag can outlive the component if the menu unmounts mid-gesture.
  useEffect(() => stopAutoScroll, []);

  function finishDrag(cancel: boolean) {
    const active = dragRef.current;
    stopAutoScroll();
    if (!active) return;
    if (cancel) {
      setDraft(active.original);
    } else {
      const index = Math.round(
        (active.index * ROW_HEIGHT + active.offset) / ROW_HEIGHT,
      );
      setDraft(moveProcess(active.original, active.id, index));
    }
    dragRef.current = null;
    focusHandle.current = active.id;
    setDrag(null);
  }

  /** Ends any drag in progress, putting the row back where it started. */
  function cancelDrag() {
    if (dragRef.current) finishDrag(true);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0 || !event.isPrimary || !customising) return;
    pointerY.current = event.clientY;
    const active = {
      id,
      startY: event.clientY,
      startScrollTop: scrollRef.current?.scrollTop ?? 0,
      index: order.indexOf(id),
      original: [...order],
      offset: 0,
    };
    dragRef.current = active;
    setDrag(active);
    event.currentTarget.setPointerCapture(event.pointerId);
    stopAutoScroll();
    autoScroll.current = requestAnimationFrame(autoScrollFrame);
  }

  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    pointerY.current = event.clientY;
    applyDrag();
  }

  /** Escape while a drag is live cancels it; says whether it did. */
  function escapeDrag() {
    if (!dragRef.current) return false;
    finishDrag(true);
    return true;
  }

  function registerHandle(id: string, element: HTMLButtonElement | null) {
    if (element) handles.current.set(id, element);
    else handles.current.delete(id);
  }

  return {
    drag,
    scrollRef,
    moveFromKeyboard,
    startDrag,
    dragMove,
    finishDrag,
    cancelDrag,
    escapeDrag,
    registerHandle,
  };
}

export type ProcessReorder = ReturnType<typeof useProcessReorder>;
