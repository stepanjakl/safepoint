'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { SwapDirection } from '@/components/app-shell/drawer-aside';

/**
 * The detail panel beside a list: which view it shows, the one fading out
 * before another arrives, which way the swap travels, and where focus goes
 * when it closes. The list supplies `place`, where a view sits in it, so a
 * swap toward an earlier item travels up; `sameList` says whether two views
 * can be compared that way at all.
 */
export function useAsidePanel<View>({
  initial,
  place,
  viewKey,
  sameList = () => true,
  scope,
}: {
  initial: View | null;
  place: (view: View) => number;
  viewKey: (view: View) => string;
  sameList?: (from: View, to: View) => boolean;
  // A selector for the list whose rows open the panel. The row marked
  // expanded inside it is where focus goes back to.
  scope: string;
}) {
  // The view on show. It stays set while the panel animates out, with
  // `exiting` marking that, so the panel leaves with its content in it.
  const [aside, setAside] = useState<View | null>(initial);
  const [exiting, setExiting] = useState(false);
  // The view being swapped out, kept while its content leaves.
  const [leaving, setLeaving] = useState<View | null>(null);
  // Which way the swap travels: towards an item further down its list or
  // back up it.
  const [direction, setDirection] = useState<SwapDirection>('down');
  // What opened the panel, so closing it puts focus back there. A choice made
  // inside the panel -- paging to another change -- keeps the original.
  const opener = useRef<HTMLElement | null>(null);
  // Where focus returns once a closing panel is gone.
  const returnTo = useRef<HTMLElement | null>(null);

  const finishExit = () => {
    setAside(null);
    setLeaving(null);
    setExiting(false);
  };
  // Changing tab takes the detail with it -- what it was showing belongs to a
  // list that is no longer here -- and the sheet does that by keying this
  // component on the tab, so there is no state to reset by hand.
  // Focus moved back when the close began. If the panel took it with it on
  // the way out -- it held focus, and unmounting drops focus to the body --
  // put it back once the panel is actually gone.
  useEffect(() => {
    if (aside !== null) return;
    const target = returnTo.current;
    returnTo.current = null;
    const active = document.activeElement;
    if (target?.isConnected && (!active || active === document.body)) {
      target.focus();
    }
  }, [aside]);
  const closeAside = (focusId?: string) => {
    if (aside === null || exiting) return;
    // Where focus goes back to: the element named, or else the row marked as
    // having this panel open -- the opener by definition, and the only
    // reliable one, since some browsers (Safari) do not focus a button on
    // click. The element focused when the panel opened is the last resort.
    const expanded = document.querySelector<HTMLElement>(
      `${scope} [aria-expanded="true"]`,
    );
    const recorded = opener.current?.isConnected ? opener.current : null;
    const target = focusId
      ? document.getElementById(focusId)
      : (expanded ?? recorded);
    opener.current = null;
    returnTo.current = target;
    requestAnimationFrame(() => target?.focus());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishExit();
      return;
    }
    // DrawerAside unmounts itself through finishExit when its exit has run.
    setLeaving(null);
    setExiting(true);
  };
  const openAside = (view: View) => {
    // The control that opened the panel closes it.
    if (aside && !exiting && viewKey(aside) === viewKey(view)) {
      closeAside();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest('.drawer-aside')) {
      opener.current = active;
    }
    returnTo.current = null;
    // Swapping one detail for another fades the old content out before the
    // new one arrives; a choice made mid-fade lets that fade finish. With
    // reduced motion it is simply replaced.
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    setLeaving((was) => (!aside || exiting || reduce ? null : (was ?? aside)));
    if (aside && !exiting) setDirection(swapDirection(aside, view));
    setExiting(false);
    setAside(view);
  };
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || aside === null || exiting) return;
    // A dialog centred over the sheet answers its own Escape.
    if (document.querySelector('[role=alertdialog]')) return;
    event.stopPropagation();
    closeAside();
  };

  function swapDirection(from: View, to: View): SwapDirection {
    const was = place(from);
    const is = place(to);
    return sameList(from, to) && was >= 0 && is >= 0 && is < was
      ? 'up'
      : 'down';
  }

  return {
    aside,
    exiting,
    leaving,
    direction,
    openAside,
    closeAside,
    finishExit,
    onKeyDownCapture,
    /** The opener no longer exists, so focus is placed by the caller. */
    forgetOpener: () => {
      opener.current = null;
    },
    settleLeaving: () => setLeaving(null),
  };
}
