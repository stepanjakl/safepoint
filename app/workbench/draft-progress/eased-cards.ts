'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

// A card's ease in progress, so a later change can replace it. Finishing goes by
// the animations themselves, so a slowed page (slow-motion.ts) keeps its order.
const easing = new WeakMap<HTMLElement, object>();

function settle(card: HTMLElement) {
  easing.delete(card);
  delete card.dataset.draftEasing;
  card.style.gridTemplateRows = '';
  card.style.removeProperty('--draft-ease-height');
}

// Marks what is new in a card for its fade, until the latest of those has played.
const freshening = new WeakMap<HTMLElement, object>();

function freshen(card: HTMLElement) {
  const token = {};
  freshening.set(card, token);
  card.dataset.draftFresh = '';
  const fades = card
    .getAnimations({ subtree: true })
    .filter(
      (animation) =>
        (animation as CSSAnimation).animationName === 'draft-fresh' &&
        animation.effect?.getComputedTiming().fill === 'both',
    );
  void Promise.allSettled(fades.map((fade) => fade.finished)).then(() => {
    if (freshening.get(card) === token) delete card.dataset.draftFresh;
  });
}

// The first list with a card top on screen, or failing that the last one wholly
// above it, whose growth moves everything being read.
function holdsThePage(list: Element) {
  const lists = [...document.querySelectorAll('[data-draft-holds-scroll]')];
  const inView = lists.find((candidate) =>
    [...candidate.children].some((card) => {
      const { top } = card.getBoundingClientRect();
      return top >= 0 && top < window.innerHeight;
    }),
  );
  return (
    (inView ??
      lists.findLast(
        (candidate) => candidate.getBoundingClientRect().top < 0,
      )) === list
  );
}

/*
  When a card's content changes, its height moves there rather than jumping and
  what is new fades in. The ease is a transition of the card's grid rows, not an
  animation of its height: ThreadStep eases its own body when that resizes, and
  stands back only for a transition of this property (thread-step.tsx), so the
  two do not fight once the cards sit in a step.

  With `hold`, the page also keeps still whatever is being read: the first card
  whose top is on screen keeps its place, so a card growing above it grows out
  of view, and one growing below it moves only what is further down. Written
  here rather than left to the browser's scroll anchoring, which Safari lacks and
  which loses its place when rows above change too. Of several such lists, one
  holds: all of them adjusting the same scroll would add up.
*/
export function useEasedCards(
  list: RefObject<HTMLOListElement | null>,
  change: unknown,
  { enabled, hold }: { enabled: boolean; hold: boolean },
) {
  const heights = useRef(new WeakMap<Element, number>());
  const frame = useRef(0);

  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const cards = [...ol.children] as HTMLElement[];
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const moves: { card: HTMLElement; from: number; to: number }[] = [];
    for (const card of cards) {
      const body = card.children[1] as HTMLElement | undefined;
      // Mid-ease it carries on from where it has got to.
      const was = easing.has(card)
        ? card.getBoundingClientRect().height
        : heights.current.get(card);
      settle(card);
      const height = card.getBoundingClientRect().height;
      heights.current.set(card, height);
      if (
        !enabled ||
        still ||
        !body ||
        was === undefined ||
        Math.abs(height - was) < 1 ||
        getComputedStyle(body).display === 'none'
      )
        continue;
      // The head and actions change at once, so the body makes up the rest and
      // the card as a whole moves smoothly.
      const to = body.offsetHeight;
      moves.push({ card, from: Math.max(0, was - (height - to)), to });
    }
    if (moves.length) {
      for (const { card, from } of moves)
        card.style.gridTemplateRows = `auto ${from}px auto`;
      // What is on screen now is what was on screen before this change. Where it
      // sits in the page, not on screen, so the reader's own scrolling is not
      // mistaken for growth and undone.
      const pick = () => {
        const anchor =
          cards.find((card) => card.getBoundingClientRect().top >= 0) ??
          cards.findLast((card) => card.getBoundingClientRect().bottom > 0);
        return () =>
          (anchor
            ? anchor.getBoundingClientRect().top
            : ol.getBoundingClientRect().bottom) + window.scrollY;
      };
      let place = pick();
      let was = place();
      for (const { card, from, to } of moves) {
        card.style.setProperty(
          '--draft-ease-height',
          String(Math.abs(to - from)),
        );
        card.dataset.draftEasing = '';
        card.style.gridTemplateRows = `auto ${to}px auto`;
        const token = {};
        easing.set(card, token);
        freshen(card);
        const rows = card
          .getAnimations()
          .filter(
            (animation) =>
              (animation as CSSTransition).transitionProperty ===
              'grid-template-rows',
          );
        void Promise.allSettled(rows.map((row) => row.finished)).then(() => {
          if (easing.get(card) !== token) return;
          settle(card);
          heights.current.set(card, card.getBoundingClientRect().height);
        });
      }
      cancelAnimationFrame(frame.current);
      if (hold && holdsThePage(ol)) {
        // What rounded scrolling has not yet made up, so it does not add up.
        let owed = 0;
        const follow = () => {
          const off = place() - was + owed;
          if (Math.abs(off) >= 0.5) {
            const from = window.scrollY;
            window.scrollBy({ top: off, behavior: 'instant' });
            const short = off - (window.scrollY - from);
            // More than rounding is the page's end, which nothing can make up.
            owed = Math.abs(short) < 1 ? short : 0;
          } else owed = off;
          // Chosen again each frame: scrolled past a card still growing, the
          // reader is now reading another.
          place = pick();
          was = place();
          if (moves.some(({ card }) => easing.has(card)))
            frame.current = requestAnimationFrame(follow);
        };
        frame.current = requestAnimationFrame(follow);
      }
    }
    // A height at rest changes with the width too.
    const observer = new ResizeObserver(() => {
      for (const card of cards)
        if (!easing.has(card))
          heights.current.set(card, card.getBoundingClientRect().height);
    });
    observer.observe(ol);
    return () => observer.disconnect();
  }, [list, change, enabled, hold]);

  useLayoutEffect(() => () => cancelAnimationFrame(frame.current), []);
}
