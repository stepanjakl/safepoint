'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { StepStatus } from '@/lib/shell/model';

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
  is at the bottom of the container. A reader elsewhere gets one offer for
  the latest unseen step when opening the run or when a step needs attention.
*/
export function useFollowRun(
  list: RefObject<HTMLOListElement | null>,
  lastId: string | undefined,
  lastStatus: StepStatus | undefined,
  hasEnd = false,
  stepCount?: number,
  resetKey: number | string = 0,
) {
  const [behind, setBehind] = useState(false);
  const pinned = useRef(true);
  const catchingUp = useRef(false);
  const offerPending = useRef(false);
  const updateOffer = useRef<(() => void) | null>(null);
  // The newest step last followed or passed over. Compared by id, not by
  // whether this has mounted: an effect run twice for the same step (React's
  // development check does exactly that) must not read as an arrival.
  const previousId = useRef<string | undefined>(undefined);
  const previousStatus = useRef<StepStatus | undefined>(undefined);
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
    offerPending.current = false;
    const clearBehind = resetKey ? setTimeout(() => setBehind(false)) : null;

    const checkOffer = (reached = atBottom() || atLatest()) => {
      if (reached) offerPending.current = false;
      setBehind(offerPending.current && !catchingUp.current);
    };
    updateOffer.current = checkOffer;

    // A run opened past the first screen can offer its latest unseen step.
    const initialCheck = requestAnimationFrame(() => {
      pinned.current = atBottom();
      offerPending.current = true;
      checkOffer();
    });

    const onScroll = () => {
      const bottom = atBottom();
      const reached = bottom || atLatest();
      pinned.current = bottom;
      if (reached) catchingUp.current = false;
      checkOffer(reached);
    };

    const onUserInput = () => {
      catchingUp.current = false;
    };

    // Keep the bottom in view as sections open, including within idle steps.
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
      if (grew && pinned.current) scrollToBottom(scroller);
    });
    growth.observe(thread);

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    const inputs = ['wheel', 'touchmove', 'keydown'] as const;
    inputs.forEach((type) =>
      window.addEventListener(type, onUserInput, { passive: true }),
    );
    return () => {
      updateOffer.current = null;
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
    const becameActionable =
      (lastStatus === 'attention' || lastStatus === 'blocked') &&
      (arrived || previousStatus.current !== lastStatus);
    const statusChanged = previousStatus.current !== lastStatus;
    previousId.current = lastId;
    previousStatus.current = lastStatus;

    if (restarted) {
      pinned.current = true;
      catchingUp.current = false;
      offerPending.current = false;
      const timer = setTimeout(() => setBehind(false));
      return () => clearTimeout(timer);
    }

    // The end note sits outside the observed list and can appear on its own.
    if (hasEnd && pinned.current && list.current) {
      scrollToBottom(scrollerOf(list.current));
    }

    if (arrived || statusChanged) {
      offerPending.current = becameActionable && !pinned.current;
      const frame = requestAnimationFrame(() => updateOffer.current?.());
      return () => cancelAnimationFrame(frame);
    }
  }, [list, lastId, lastStatus, hasEnd, stepCount]);

  const catchUp = () => {
    pinned.current = false;
    offerPending.current = false;
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
    current?.scrollIntoView({
      block: 'start',
      behavior: smooth ? 'smooth' : 'instant',
    });
    setBehind(false);
  };

  return { behind, catchUp };
}
