'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

/*
  Where the definitions still waiting on a person are, while the page
  scrolls: a dot for each, in its status's tone, in a gutter beside the
  cards. Each dot is sticky in a track as tall as the list, placed level
  with its card's status pill: the browser holds it at the pane's bottom
  while the card is further down, beside the pill while it is in view, and
  at the top once passed. Code only measures where the pills are when the
  list's layout changes, and gives a dot a beat as it comes to rest. A dot
  takes the person to its card.
*/

export type Pending = {
  id: string;
  name: string;
  status: string;
  severity: number;
};

// How long a dot beats when it comes to rest (rules-step.css).
const BEAT_MS = 700;

function scrollerOf(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

export function PendingDots({
  pending,
  anchorOf,
}: {
  pending: Pending[];
  anchorOf: (id: string) => string;
}) {
  const nav = useRef<HTMLElement>(null);
  const key = pending.map((p) => p.id).join(',');

  // Each track's spacer is as tall as its pill is far down the list; that
  // changes with the layout, never with scrolling.
  useEffect(() => {
    const list = nav.current?.parentElement;
    if (!list) return;
    const place = () => {
      // The tracks start level with the list's summary pill, where present.
      const start = list
        .querySelector('[data-dots-start] [data-severity]')
        ?.getBoundingClientRect();
      const top = start
        ? start.top + start.height / 2
        : list.getBoundingClientRect().top;
      nav.current!.style.setProperty(
        '--rules-dots-from',
        `${top - list.getBoundingClientRect().top}px`,
      );
      for (const dot of nav.current?.querySelectorAll<HTMLElement>(
        '[data-for]',
      ) ?? []) {
        const pill = document
          .getElementById(anchorOf(dot.dataset.for!))
          ?.querySelector('.rules-status-out');
        if (!pill) continue;
        const box = pill.getBoundingClientRect();
        dot.parentElement!.style.setProperty(
          '--rules-dot-at',
          `${box.top + box.height / 2 - top}px`,
        );
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [key, anchorOf]);

  // A dot comes to rest when its place beside the pill enters the band its
  // sticky insets leave in the pane.
  useEffect(() => {
    const scroller = scrollerOf(nav.current);
    if (!scroller) return;
    const observers = [
      ...(nav.current?.querySelectorAll<HTMLElement>('[data-for]') ?? []),
    ].map((dot) => {
      const { top, bottom } = getComputedStyle(dot);
      let seen = false;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (seen && entry?.isIntersecting) {
            dot.dataset.arrived = '';
            setTimeout(() => delete dot.dataset.arrived, BEAT_MS);
          }
          seen = true;
        },
        { root: scroller, rootMargin: `-${top} 0px -${bottom} 0px` },
      );
      observer.observe(dot.parentElement!.querySelector('.rules-dot-mark')!);
      return observer;
    });
    return () => observers.forEach((observer) => observer.disconnect());
  }, [key]);

  if (!pending.length) return null;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <nav
      ref={nav}
      aria-label="Definitions waiting for you"
      className="rules-dots"
    >
      {pending.map((item, index) => (
        <div
          key={item.id}
          className="rules-dot-track"
          style={
            {
              '--rules-dot-before': index,
              '--rules-dot-after': pending.length - 1 - index,
            } as CSSProperties
          }
        >
          <span aria-hidden className="rules-dot-rest" />
          <span aria-hidden className="rules-dot-mark" />
          <button
            type="button"
            data-for={item.id}
            data-severity={item.severity}
            aria-label={`${item.name}: ${item.status}`}
            title={item.name}
            className="rules-dot bg-severity-bar"
            onClick={() =>
              document.getElementById(anchorOf(item.id))?.scrollIntoView({
                behavior: reduced ? 'auto' : 'smooth',
                block: 'start',
              })
            }
          />
        </div>
      ))}
    </nav>
  );
}
