'use client';

import { styleDebug } from '@/lib/style-debug';
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
  process is -- its instructions, inputs and outputs -- and stays put; anything that
  opens from it opens here, beside it on the left, in the same face. Two
  panels side by side rather than one stacked on the other, so the list a
  detail came from is still in view and choosing another item swaps the detail
  without a trip back.

  It has no close button of its own. The control that opened it closes it --
  press it again -- and so do Escape and the scrim. Below the width where both
  fit, the panel takes the drawer's place instead of squeezing it.

  Motion, in app/styles/drawer.css: the panel comes in from the left and leaves the
  same way, and its first content fades in once it is in place. Choosing another
  item keeps the panel still and swaps what is in it (components/ui/swap.css):
  the old content fades out first, then the new one comes in, travelling the
  way the list does -- rising for an item further down, falling for one above.
*/

// Where the newly chosen item sits relative to the one it replaces.
export type SwapDirection = 'up' | 'down';

export type AsideView =
  | { kind: 'input'; id: string }
  | { kind: 'add-input' }
  | { kind: 'changes'; version: string }
  | { kind: 'edit' };

export function viewKey(view: AsideView): string {
  switch (view.kind) {
    case 'input':
      return `input:${view.id}`;
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
  'control-face control-hairline control-quiet text-muted-strong interact:control-quiet-hover interact:text-primary grid size-8 flex-none cursor-pointer place-items-center rounded-full';

// Longest the panel's exit or a content's fade-out may take before it is
// dropped anyway: the animation's own end normally does it, and this covers an
// end that never comes, such as a frame the browser skipped.
const EXIT_FALLBACK_MS = 600;
const LEAVE_FALLBACK_MS = 300;

export function DrawerAside({
  current,
  leaving,
  direction,
  exiting,
  onExited,
  onLeft,
  className,
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
  // A width, where the caller has one to give. In a sheet column the column
  // decides; over the sheet, the panel has to state its own.
  className?: string;
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
      EXIT_FALLBACK_MS,
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
  // The new content mounts once the old has faded, so that is when it counts.
  const shownKey = leaving ? null : current.key;
  useEffect(() => {
    if (shownKey === null) return;
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
  }, [shownKey]);

  // The content moves the way the list does: an item further down rises.
  const motion = direction === 'down' ? 'up' : 'down';
  // One element, keyed, so content moving from current to leaving keeps its
  // instance -- its scroll position and its state -- while it fades out.
  const layer = leaving ? (
    <AsideContent
      key={leaving.key}
      layer={leaving}
      className="swap-leave"
      motion={motion}
      inert
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onLeft();
      }}
    />
  ) : swapped || current.key !== openedWith ? (
    <AsideContent
      key={current.key}
      layer={current}
      headingRef={heading}
      className="swap-enter"
      motion={motion}
    />
  ) : (
    <AsideContent
      key={current.key}
      layer={current}
      headingRef={heading}
      className="drawer-aside-content"
    />
  );

  return (
    <section
      aria-labelledby="drawer-aside-title"
      {...styleDebug({ component: 'DrawerAside', appearance: 'drawer-aside' })}
      data-exiting={exiting || undefined}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && exiting) onExited();
      }}
      className={cx(
        PANEL,
        // It fills the column it is given: in the sheet the column decides how
        // wide the detail is, from the width the list beside it leaves.
        'drawer-aside grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]',
        className,
      )}
    >
      <p className="sr-only" aria-live="polite">
        {current.announce}
      </p>
      {layer}
    </section>
  );
}

function AsideContent({
  layer,
  headingRef,
  className,
  motion,
  inert = false,
  onAnimationEnd,
}: {
  layer: AsideLayer;
  headingRef?: Ref<HTMLHeadingElement>;
  className: string;
  motion?: 'up' | 'down';
  inert?: boolean;
  onAnimationEnd?: (event: AnimationEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      {...styleDebug({
        component: 'DrawerAside',
        part: 'panel',
        appearance: className,
      })}
      // Leaving content can be neither reached nor read.
      inert={inert}
      aria-hidden={inert || undefined}
      data-motion={motion}
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
