'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

const BOTTOM_THRESHOLD_PX = 24;

const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;

export function scrollerOf(element: Element | null): HTMLElement | null {
  for (
    let node = element?.parentElement ?? null;
    node;
    node = node.parentElement
  ) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

function scrollToBottom(
  scroller: HTMLElement | null,
  behavior: ScrollBehavior = 'instant',
) {
  if (scroller) {
    scroller.scrollTo({ top: scroller.scrollHeight, behavior });
  } else {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior,
    });
  }
}

/*
  Keeps a live run's newest step and growing content in view for a reader who
  is at the bottom of the container, and only for them. One who scrolls away to
  read is left where they are and told a step has arrived instead: `behind` is
  true until they return to the bottom, and `catchUp` takes them there.
*/
export function useFollowRun(
  list: RefObject<HTMLOListElement | null>,
  lastId: string | undefined,
  hasEnd = false,
  stepCount?: number,
  resetKey: number | string = 0,
) {
  const [behind, setBehind] = useState(false);
  const pinned = useRef(true);
  const catchingUp = useRef(false);
  // Once the reader has seen the newest section (at the bottom or via an arrival),
  // scrolling away from it again brings the catch-up button back.
  const canShowBehind = useRef(false);
  // The newest step last followed or passed over. Compared by id, not by
  // whether this has mounted: an effect run twice for the same step (React's
  // development check does exactly that) must not read as an arrival.
  const previousId = useRef<string | undefined>(undefined);
  const previousCount = useRef<number | undefined>(undefined);

  useEffect(() => {
    const thread = list.current;
    if (!thread) return;

    const scroller = scrollerOf(thread);
    const scrollTarget = scroller ?? window;
    const atBottom = () => {
      if (scroller) {
        return (
          scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
          BOTTOM_THRESHOLD_PX
        );
      }
      const doc = document.documentElement;
      return (
        doc.scrollHeight - window.scrollY - window.innerHeight <=
        BOTTOM_THRESHOLD_PX
      );
    };

    const atLatest = () => {
      const latest = thread.lastElementChild;
      if (!latest) return false;
      const viewportBottom = scroller
        ? scroller.getBoundingClientRect().bottom
        : window.innerHeight;
      return (
        latest.getBoundingClientRect().top <=
        viewportBottom - BOTTOM_THRESHOLD_PX
      );
    };

    // Start pinned so a newly started run auto-follows before the user has
    // scrolled (including while content is still shorter than the container).
    pinned.current = true;
    catchingUp.current = false;
    canShowBehind.current = false;
    const clearBehind = resetKey ? setTimeout(() => setBehind(false)) : null;

    const onScroll = () => {
      const bottom = atBottom();
      if (bottom) {
        pinned.current = true;
      } else if (!catchingUp.current) {
        pinned.current = false;
      }

      if (bottom || atLatest()) {
        catchingUp.current = false;
        canShowBehind.current = true;
        setBehind(false);
      } else if (!catchingUp.current && canShowBehind.current) {
        setBehind(true);
      }
    };

    const onUserInput = () => {
      catchingUp.current = false;
    };

    // Follow frame by frame as steps arrive or expand while pinned to bottom.
    // Skip the initial observation on mount so opening a run does not jump.
    let initialized = false;
    const growth = new ResizeObserver(() => {
      if (!initialized) {
        initialized = true;
        return;
      }
      if (pinned.current) scrollToBottom(scroller);
    });
    growth.observe(thread);

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    const inputs = ['wheel', 'touchmove', 'keydown'] as const;
    inputs.forEach((type) =>
      window.addEventListener(type, onUserInput, { passive: true }),
    );
    return () => {
      if (clearBehind) clearTimeout(clearBehind);
      growth.disconnect();
      scrollTarget.removeEventListener('scroll', onScroll);
      inputs.forEach((type) => window.removeEventListener(type, onUserInput));
    };
  }, [list, resetKey]);

  useEffect(() => {
    const restarted =
      stepCount !== undefined &&
      previousCount.current !== undefined &&
      stepCount < previousCount.current;
    previousCount.current = stepCount;

    const arrived =
      !restarted &&
      previousId.current !== undefined &&
      previousId.current !== lastId;
    previousId.current = lastId;

    if (restarted) {
      pinned.current = true;
      catchingUp.current = false;
      canShowBehind.current = false;
      const timer = setTimeout(() => setBehind(false));
      return () => clearTimeout(timer);
    }

    if (arrived) {
      canShowBehind.current = true;
      if (pinned.current) {
        scrollToBottom(scrollerOf(list.current));
      } else {
        const timer = setTimeout(() => setBehind(true));
        return () => clearTimeout(timer);
      }
    } else if (hasEnd && pinned.current) {
      scrollToBottom(scrollerOf(list.current));
    }
  }, [list, lastId, hasEnd, stepCount]);

  const catchUp = () => {
    pinned.current = true;
    canShowBehind.current = true;
    const smooth = !reducedMotion();
    catchingUp.current = smooth;
    scrollToBottom(scrollerOf(list.current), smooth ? 'smooth' : 'instant');
    setBehind(false);
  };

  return { behind, catchUp };
}
