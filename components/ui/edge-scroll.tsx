'use client';

import { useCallback } from 'react';

/*
  A horizontal scroller that fades out at whichever side has more to show, and
  scrolls towards a side while a mouse rests over its fade -- faster the nearer
  the pointer is to the edge. Touch and trackpads scroll it natively; keyboard
  focus scrolls a control into view on its own.

  State is written to the element as data attributes rather than React state,
  so a scroll never re-renders what is inside it. The element owns its
  overflow; `.edge-scroll` (edge-scroll.css) only draws the fades, so a list
  that scrolls only at some widths stays unmasked at the others.
*/

// Pixels per millisecond at the very edge, and the share of it kept at the
// zone's inner end, so a resting pointer always moves the row.
const MAX_SPEED = 1.2;
const MIN_SHARE = 0.12;

export function useEdgeScroll<T extends HTMLElement>() {
  return useCallback((element: T | null) => {
    if (!element) return;
    let frame = 0;
    let speed = 0;
    let last = 0;

    const update = () => {
      const room = element.scrollWidth - element.clientWidth;
      const scrollable = room > 0.5;
      toggle(element, 'data-edge-scrollable', scrollable);
      toggle(
        element,
        'data-fade-start',
        scrollable && element.scrollLeft > 0.5,
      );
      toggle(
        element,
        'data-fade-end',
        scrollable && element.scrollLeft < room - 0.5,
      );
    };

    const step = (now: number) => {
      const elapsed = last ? Math.min(now - last, 48) : 16;
      last = now;
      element.scrollLeft += speed * elapsed;
      frame = speed === 0 ? 0 : requestAnimationFrame(step);
    };
    const stop = () => {
      speed = 0;
      last = 0;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0) return stop();
      // The zone is the fade itself, read from the stylesheet so the two
      // cannot drift apart.
      const zone = parseFloat(
        getComputedStyle(element).getPropertyValue('--edge-fade'),
      );
      const box = element.getBoundingClientRect();
      const fromStart = event.clientX - box.left;
      const fromEnd = box.right - event.clientX;
      const pull = (distance: number) =>
        MAX_SPEED * (MIN_SHARE + (1 - MIN_SHARE) * (1 - distance / zone) ** 2);
      speed =
        fromStart < zone && element.hasAttribute('data-fade-start')
          ? -pull(fromStart)
          : fromEnd < zone && element.hasAttribute('data-fade-end')
            ? pull(fromEnd)
            : 0;
      if (speed === 0) stop();
      else if (!frame) frame = requestAnimationFrame(step);
    };

    // Content can change width without the box changing: watch the children
    // too, and the children as they come and go.
    const resize = new ResizeObserver(update);
    const watch = () => {
      resize.disconnect();
      resize.observe(element);
      for (const child of element.children) resize.observe(child);
    };
    const children = new MutationObserver(() => {
      watch();
      update();
    });
    children.observe(element, { childList: true });
    watch();
    update();

    element.addEventListener('scroll', update, { passive: true });
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', stop);
    element.addEventListener('pointerdown', stop);
    return () => {
      stop();
      resize.disconnect();
      children.disconnect();
      element.removeEventListener('scroll', update);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', stop);
      element.removeEventListener('pointerdown', stop);
    };
  }, []);
}

function toggle(element: HTMLElement, name: string, on: boolean) {
  if (on) element.setAttribute(name, '');
  else element.removeAttribute(name);
}
