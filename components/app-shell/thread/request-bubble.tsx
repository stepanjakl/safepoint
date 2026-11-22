'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { scrollerOf } from './follow-run';

type RevealMetrics = {
  closed: number;
  open: number;
  fade: number;
  overflows: boolean;
};

const EMPTY_METRICS: RevealMetrics = {
  closed: 0,
  open: 0,
  fade: 0,
  overflows: false,
};

/*
  Counts rendered visual lines inside `inner` so the closed box always ends
  in the gap below the last visible line rather than slicing glyphs in half.
*/
function measureLineMetrics(
  inner: HTMLElement,
  peekLines: number,
): RevealMetrics {
  const innerTop = inner.getBoundingClientRect().top;
  const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
  const lines: { top: number; bottom: number }[] = [];
  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    if (!textNode.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(textNode);
    for (const rect of range.getClientRects()) {
      if (rect.height <= 0 || rect.width <= 0) continue;
      const top = rect.top - innerTop;
      const bottom = rect.bottom - innerTop;
      const last = lines.at(-1);
      if (!last || Math.abs(bottom - last.bottom) > 4) {
        lines.push({ top, bottom });
      } else {
        last.top = Math.min(last.top, top);
        last.bottom = Math.max(last.bottom, bottom);
      }
    }
  }
  const open = Math.ceil(inner.offsetHeight);
  if (lines.length <= peekLines) {
    return { closed: open, open, fade: 0, overflows: false };
  }
  const lastVisible = lines[peekLines - 1]!;
  const nextHidden = lines[peekLines]!;
  const closed = Math.min(
    open,
    Math.ceil(
      lastVisible.bottom + Math.max(0, nextHidden.top - lastVisible.bottom) / 2,
    ),
  );
  const lineHeight = parseFloat(getComputedStyle(inner).lineHeight) || 20;
  const fade = Math.min(closed, Math.round(lineHeight * 2.25));
  return {
    closed,
    open,
    fade,
    overflows: open > closed + 2,
  };
}

/*
  What the operator asked for, as the one right-aligned box in the thread.
  Long content fades cleanly at the bottom edge of the last visible line and
  expands smoothly via a nested grid-template-rows transition.
*/
export function RequestBubble({
  label,
  peekLines = 5,
  children,
}: {
  // Optional context pill at the top of the bubble (e.g. "Note").
  label?: string;
  // Visible lines before fading when collapsed.
  peekLines?: number;
  children: ReactNode;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const [all, setAll] = useState(false);
  const [ready, setReady] = useState(false);
  const [metrics, setMetrics] = useState<RevealMetrics>(EMPTY_METRICS);

  // Measured by the observer alone: its first report comes after the page's
  // own layout and before paint, so the first frame is right without forcing
  // a layout in the middle of mounting a whole thread. It also sees the text
  // change, so a new render of the same words measures nothing.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () => {
      const next = measureLineMetrics(inner, peekLines);
      setMetrics((prev) =>
        prev.closed === next.closed &&
        prev.open === next.open &&
        prev.fade === next.fade &&
        prev.overflows === next.overflows
          ? prev
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [peekLines]);

  useEffect(() => {
    if (!all) return;
    const bubble = bubbleRef.current;
    const reveal = revealRef.current;
    if (!bubble || !reveal) return;
    const scroller = scrollerOf(bubble);
    const margin = 16;
    let active = true;

    const adjust = () => {
      if (!active) return;
      const bubbleRect = bubble.getBoundingClientRect();
      const viewportBottom = scroller
        ? scroller.getBoundingClientRect().bottom
        : window.innerHeight;
      const delta = bubbleRect.bottom - (viewportBottom - margin);
      if (delta <= 0.5) return;
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
    };

    const stop = () => {
      active = false;
      observer.disconnect();
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (
        event.target === reveal &&
        event.propertyName === 'grid-template-rows'
      ) {
        adjust();
        stop();
      }
    };

    const observer = new ResizeObserver(adjust);
    observer.observe(bubble);
    reveal.addEventListener('transitionend', onTransitionEnd);
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchmove', stop, { passive: true, once: true });
    const fallback = setTimeout(stop, 650);

    return () => {
      active = false;
      clearTimeout(fallback);
      observer.disconnect();
      reveal.removeEventListener('transitionend', onTransitionEnd);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
    };
  }, [all]);

  const revealStyle = {
    '--reveal-closed': `${metrics.closed}px`,
    '--reveal-open': `${metrics.open}px`,
    '--reveal-fade-size': `${metrics.fade}px`,
    '--fold-height': String(Math.max(0, metrics.open - metrics.closed)),
  } as CSSProperties;

  return (
    <div
      ref={bubbleRef}
      className="request-bubble-card border-rule-faint bg-surface-primary rounded-shell rounded-br-region ml-auto grid max-w-[84%] justify-items-start gap-2.5 border px-4.5 py-3.5 max-sm:max-w-[94%]"
    >
      {label ? <Pill tone="neutral">{label}</Pill> : null}
      <div
        ref={revealRef}
        id={contentId}
        className="text-reveal w-full"
        data-overflows={metrics.overflows || undefined}
        data-open={all || undefined}
        data-ready={ready || undefined}
        style={metrics.overflows ? revealStyle : undefined}
      >
        <div className="text-reveal-clip">
          <div ref={innerRef}>{children}</div>
        </div>
      </div>
      {metrics.overflows ? (
        <Button
          size="xsmall"
          shape="round"
          aria-expanded={all}
          aria-controls={contentId}
          onPress={() => setAll((was) => !was)}
        >
          {all ? 'Show less' : 'Show all'}
        </Button>
      ) : null}
    </div>
  );
}
