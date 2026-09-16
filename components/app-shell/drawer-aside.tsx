'use client';

import {
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cx } from '@/lib/cx';

/*
  The setup drawer's second panel. The drawer on the right holds what a
  process is -- its instructions, its systems -- and stays put; anything that
  opens from it opens here, beside it on the left, in the same face. Two
  panels side by side rather than one stacked on the other, so the list a
  detail came from is still in view and choosing another item swaps the detail
  without a trip back.

  It has no close button of its own. The control that opened it closes it --
  press it again -- and so do Escape and the scrim. Below the width where both
  fit, the panel takes the drawer's place instead of squeezing it.

  Motion, in components.css: the panel comes in from the left and leaves the
  same way, and its first content fades in once it is in place. Choosing another
  item keeps the panel still and swaps what is in it, travelling the way the
  list does: an item further down makes the old content rise out as the new
  rises in from below, one further up the reverse. The two are held in one
  grid cell for the moment they overlap.
*/

// Where the newly chosen item sits relative to the one it replaces.
export type SwapDirection = 'up' | 'down';

export type AsideView =
  | { kind: 'source'; id: string }
  | { kind: 'add-source' }
  | { kind: 'changes'; version: string }
  | { kind: 'edit' };

export function viewKey(view: AsideView): string {
  switch (view.kind) {
    case 'source':
      return `source:${view.id}`;
    case 'changes':
      return `changes:${view.version}`;
    default:
      return view.kind;
  }
}

// One thing the panel can show: its header and its body.
export type AsideLayer = {
  key: string;
  eyebrow: string;
  title: ReactNode;
  // The title as plain text, announced when the content changes.
  announce: string;
  meta?: ReactNode;
  leading?: ReactNode;
  // Focus moves to the panel's heading when it opens, unless the content has
  // somewhere better for it -- the editor's text field takes its own.
  focusOnOpen?: boolean;
  body: ReactNode;
};

// The panel face both halves share.
export const PANEL =
  'control-face surface-floating rounded-shell relative h-full overflow-clip';

// The drawer's close button.
export const CLOSE_BUTTON =
  'control-face control-hairline control-quiet text-muted-strong data-[hovered]:control-quiet-hover data-[hovered]:text-primary data-[focus-visible]:control-quiet-hover data-[focus-visible]:text-primary data-[pressed]:control-quiet-hover data-[pressed]:text-primary grid size-8 flex-none cursor-pointer place-items-center rounded-full';

// Longest either leaving animation may take before its layer is removed
// anyway: the animation's own end normally does it, and this covers an end
// that never comes, such as a frame the browser skipped.
const LEAVE_FALLBACK_MS = 600;

export function DrawerAside({
  current,
  leaving,
  direction,
  exiting,
  onExited,
  onLeft,
}: {
  current: AsideLayer;
  // The content being swapped out, for as long as it takes to leave.
  leaving: AsideLayer | null;
  // Which way the latest swap travels; both layers move with it.
  direction: SwapDirection;
  // The whole panel is leaving.
  exiting: boolean;
  onExited: () => void;
  onLeft: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // The content the panel opened with arrives from the side; anything chosen
  // after it rises in from below.
  // Once anything has been swapped in, every later arrival is a swap -- even
  // a return to the content it opened with.
  const [openedWith] = useState(current.key);
  const [swapped, setSwapped] = useState(false);
  if (!swapped && current.key !== openedWith) setSwapped(true);
  const arrived = useRef(false);

  const exited = useRef(onExited);
  const left = useRef(onLeft);
  useEffect(() => {
    exited.current = onExited;
    left.current = onLeft;
  });
  useEffect(() => {
    if (!exiting) return;
    const fallback = window.setTimeout(
      () => exited.current(),
      LEAVE_FALLBACK_MS,
    );
    return () => window.clearTimeout(fallback);
  }, [exiting]);
  const leavingKey = leaving?.key;
  useEffect(() => {
    if (leavingKey === undefined) return;
    const fallback = window.setTimeout(() => left.current(), LEAVE_FALLBACK_MS);
    return () => window.clearTimeout(fallback);
  }, [leavingKey]);

  // When the panel arrives, focus goes to its heading. On a swap it stays on
  // the item that was chosen, so a keyboard can carry on down the list it is
  // in -- unless the control that was chosen went with the old content, as a
  // pager button does, which leaves focus nowhere.
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      if (current.focusOnOpen !== false) heading.current?.focus();
      return;
    }
    // Focus still inside the leaving content counts as lost: that content is
    // inert, and the browser only moves focus out of it after this runs.
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('[inert]')) {
      heading.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.key]);

  const layers = [
    leaving ? (
      <AsideContent
        key={leaving.key}
        layer={leaving}
        className="drawer-aside-leave"
        inert
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) onLeft();
        }}
      />
    ) : null,
    <AsideContent
      key={current.key}
      layer={current}
      headingRef={heading}
      className="drawer-aside-content"
      enter={swapped || current.key !== openedWith ? 'swap' : 'open'}
    />,
  ];

  return (
    <section
      aria-labelledby="drawer-aside-title"
      data-exiting={exiting || undefined}
      data-direction={direction}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && exiting) onExited();
      }}
      className={cx(
        PANEL,
        'drawer-aside grid w-[min(35rem,calc(100vw_-_2_*_var(--spacing-shell-inset)))] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]',
      )}
    >
      <p className="sr-only" aria-live="polite">
        {current.announce}
      </p>
      {/* One array, keyed, so a layer moving from current to leaving keeps
          its instance -- its scroll position and its state -- on the way out. */}
      {layers}
    </section>
  );
}

function AsideContent({
  layer,
  headingRef,
  className,
  enter,
  inert = false,
  onAnimationEnd,
}: {
  layer: AsideLayer;
  headingRef?: Ref<HTMLHeadingElement>;
  className: string;
  enter?: 'open' | 'swap';
  inert?: boolean;
  onAnimationEnd?: (event: AnimationEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      // Leaving content can be neither reached nor read.
      inert={inert}
      aria-hidden={inert || undefined}
      data-enter={enter}
      onAnimationEnd={onAnimationEnd}
      className={cx(
        'col-start-1 row-start-1 grid min-h-0 grid-rows-[auto_minmax(0,1fr)]',
        className,
      )}
    >
      <header className="border-rule-faint flex min-w-0 items-start gap-3 border-b p-5">
        {layer.leading}
        <div className="grid min-w-0 gap-0.5">
          <p className="readout text-muted">{layer.eyebrow}</p>
          <h2
            ref={headingRef}
            id={inert ? undefined : 'drawer-aside-title'}
            tabIndex={-1}
            className="text-title [font-weight:550] outline-none"
          >
            {layer.title}
          </h2>
          {layer.meta ? (
            <div className="text-meta text-muted">{layer.meta}</div>
          ) : null}
        </div>
      </header>
      <div className="overflow-y-auto overscroll-contain">{layer.body}</div>
    </div>
  );
}
