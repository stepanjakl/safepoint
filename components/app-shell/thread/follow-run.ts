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

function scrollToCurrent(thread: HTMLOListElement | null) {
  const current = thread?.querySelector(':scope > [data-current]');
  if (current && current !== thread?.lastElementChild) {
    current.scrollIntoView({ block: 'start', behavior: 'instant' });
  } else {
    scrollToBottom(scrollerOf(thread));
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
  followGrowth = true,
) {
  const [behind, setBehind] = useState(false);
  const pinned = useRef(true);
  const catchingUp = useRef(false);
  const followGrowthRef = useRef(followGrowth);
  useEffect(() => {
    followGrowthRef.current = followGrowth;
  }, [followGrowth]);
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
      const latest =
        thread.querySelector(':scope > [data-current]') ??
        thread.lastElementChild;
      if (!latest) return false;
      const viewport = scroller?.getBoundingClientRect();
      const step = latest.getBoundingClientRect();
      return (
        step.bottom > (viewport?.top ?? 0) &&
        step.top <=
          (viewport?.bottom ?? window.innerHeight) - BOTTOM_THRESHOLD_PX
      );
    };

    // Start pinned so a newly started run auto-follows before the user has
    // scrolled (including while content is still shorter than the container).
    pinned.current = true;
    catchingUp.current = false;
    canShowBehind.current = false;
    const clearBehind = resetKey ? setTimeout(() => setBehind(false)) : null;

    // A run opened already past the first screen (e.g. awaiting review) starts
    // at scrollTop 0 with its latest step below the fold: offer the jump button
    // straight away instead of waiting for a new step to arrive.
    const initialCheck = requestAnimationFrame(() => {
      canShowBehind.current = true;
      if (!atBottom()) {
        pinned.current = false;
        if (!atLatest()) setBehind(true);
      }
    });

    const onScroll = () => {
      const bottom = atBottom();
      if (bottom || (catchingUp.current && atLatest())) {
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

    // Follow frame by frame as an active running step grows while pinned to
    // the bottom. Never hijack scroll when the thread is idle (user expanding
    // earlier steps or paging through thinking) or shrinking.
    let initialized = false;
    let lastHeight = 0;
    const growth = new ResizeObserver(() => {
      const nextHeight = thread.offsetHeight;
      if (!initialized) {
        initialized = true;
        lastHeight = nextHeight;
        return;
      }
      const grew = nextHeight > lastHeight;
      lastHeight = nextHeight;
      if (grew && pinned.current && followGrowthRef.current)
        scrollToBottom(scroller);
    });
    growth.observe(thread);

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    const inputs = ['wheel', 'touchmove', 'keydown'] as const;
    inputs.forEach((type) =>
      window.addEventListener(type, onUserInput, { passive: true }),
    );
    return () => {
      cancelAnimationFrame(initialCheck);
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
        scrollToCurrent(list.current);
      } else {
        const timer = setTimeout(() => setBehind(true));
        return () => clearTimeout(timer);
      }
    } else if (hasEnd && pinned.current) {
      scrollToCurrent(list.current);
    }
  }, [list, lastId, hasEnd, stepCount]);

  const catchUp = () => {
    pinned.current = true;
    canShowBehind.current = true;
    const smooth = !reducedMotion();
    catchingUp.current = true;
    const current = list.current?.querySelector<HTMLElement>(
      ':scope > [data-current]',
    );
    const target =
      current?.querySelector<HTMLElement>(
        'button.thread-step-toggle, button.thread-step-heading-action',
      ) ?? current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({
      block: 'center',
      behavior: smooth ? 'smooth' : 'instant',
    });
    setBehind(false);
  };

  return { behind, catchUp };
}
