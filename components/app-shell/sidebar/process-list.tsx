'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { motion, type Transition } from 'motion/react';
import DotGrid2x3Filled from 'blode-icons-react/icons/dot-grid-2x3-filled';

import { cx } from '@/lib/cx';
import { useShellPageNavigation } from '@/components/app-shell/shell-page-transition';
import type { ProcessNavigationItem } from '@/lib/process/navigation';
import { Glyph } from '@/components/ui/glyph';
import { OverflowTooltip, Tooltip } from '@/components/ui/tooltip';
import { RAIL_CELL } from './menu-parts';
import { ROW_HEIGHT, type ProcessReorder } from './use-process-reorder';

/*
  A row's status badge. A pill rather than a badge-step corner, and the mono
  family, because it holds something the reader compares rather than reads as
  prose -- a count.

  One fixed box for every badge -- a rail cell wide, 20px high -- so a
  two-digit count does not widen its row's badge past its neighbours', and the
  cell stays centred on the trailing axis. The tone colours the glyph and count.

  The face follows the row rather than its own pointer: `surface-menu-badge`
  reads stops `.process-menu-row` publishes for each of its states, so the
  badge gives its face up and lets the row show through whenever the row
  lights -- hovered, focused or current.
*/
const ROW_BADGE = cx(
  'rounded-full text-micro font-mono inline-flex h-5 flex-none items-center justify-center [font-weight:var(--sp-mono-weight-strong)] select-none',
  'control-face surface-menu-badge',
  'process-menu-row-end rail-mark w-menu-rail relative z-1 cursor-help gap-1 px-0 tabular-nums',
  'text-muted data-[tone=blocked]:text-state-blocked data-[tone=decision]:text-state-decision data-[tone=caution]:text-state-caution data-[tone=verified]:text-state-verified',
);

/*
  A process name, in the row or in the rename field. Truncates rather than
  wraps: the row is a fixed height, and OverflowTooltip supplies the full name.

  The left pad is carried here rather than on the link, because the link is
  swapped for a plain span the moment the reorder mode opens. With the pad on
  only one of them the name jumped sideways at exactly the point the handles
  finished sliding in.
*/
const MENU_LABEL =
  'text-menu-link group-hover/row:text-primary group-focus-within/row:text-primary control-wash group-data-[current]/row:text-primary block min-w-0 truncate rounded-control py-2.75 pr-0 pl-2.5 text-dense font-semibold no-underline select-none';

/*
  The reorder handle and its non-interactive preview share one box, so the label
  sits in exactly the same place whether the handles are being previewed or
  used, and switching between the two modes moves nothing.

  Only the three colour states live here. The travel -- growing out of the row
  and collapsing back into it -- belongs to the motion wrapper around them,
  because an element that is entering or leaving the DOM cannot animate with a
  class: there is no frame on which the old value was ever applied.
*/
const GRIP_BOX =
  'control-wash rounded-section grid h-8 w-6 flex-none place-items-center border-menu-edge border-transparent';

/*
  Two weights. The preview -- what the Arrange button shows on hover -- is the
  lighter: it is an advertisement, not a target. In the mode itself the handle
  is solid, in arrange mode's teal, and pointing at it only deepens the colour.
*/
const GRIP_PREVIEW = `${GRIP_BOX} text-muted pointer-events-none`;
/*
  Pointing at a handle changes only its colour -- the cursor already says it can
  be picked up, and an edge around six dots is more furniture than the gesture
  needs. The edge is kept for the drag itself, where it marks which row left the
  list. Keyboard focus is left to the global :focus-visible outline rather than
  restyled, so it stays the same indicator as everywhere else.
*/
const GRIP_HANDLE = `${GRIP_BOX} text-commit-ink hover:text-commit-ink-strong focus-visible:text-commit-ink-strong group-data-[dragging]/row:text-commit-ink-strong group-data-[dragging]/row:cursor-grabbing cursor-grab touch-none`;

/*
  In arrange mode the handle is the row's leading icon, so it takes one rail
  cell and belongs on that axis rather than in a box of its own size.
  GRIP_GAP is the row's own gap, cancelled while the cell has no width at all
  so a row with no handle is no wider than it used to be.
*/
const GRIP_WIDTH = RAIL_CELL;
const GRIP_GAP = 4;

function Grip() {
  return <DotGrid2x3Filled aria-hidden size={20} />;
}

/**
 * The processes, as links -- or, while arranging, as rows to reorder. The one
 * scrolling element in the menu, with the fades at its two ends.
 */
export function ProcessList({
  items,
  order,
  visibleOrder,
  current,
  customising,
  showGrip,
  gripTransition,
  reorder,
}: {
  items: ProcessNavigationItem[];
  order: string[];
  visibleOrder: string[];
  current: string;
  customising: boolean;
  showGrip: boolean;
  gripTransition: Transition;
  reorder: ProcessReorder;
}) {
  const { leaveTo } = useShellPageNavigation();
  const {
    drag,
    scrollRef,
    registerHandle,
    startDrag,
    dragMove,
    finishDrag,
    escapeDrag,
    moveFromKeyboard,
  } = reorder;
  // One stable ref object per row, which the row's status tooltip positions
  // against. State rather than a ref so render can read the map; the objects
  // inside it are mutated by the rows' ref callbacks, never replaced.
  const [rowAnchors] = useState(
    () => new Map<string, { current: HTMLLIElement | null }>(),
  );
  const rowAnchor = (id: string) => {
    let anchor = rowAnchors.get(id);
    if (!anchor) {
      anchor = { current: null };
      rowAnchors.set(id, anchor);
    }
    return anchor;
  };

  return (
    <>
      {customising ? (
        <span id="process-reorder-instructions" className="sr-only">
          Use Up and Down arrow keys, Home or End to reorder.
        </span>
      ) : null}
      {/*
        It keeps the pane's own content width rather than reaching out to the
        aside's edge: at the edge its scrollbar landed under the right-hand
        gradient, and a gradient that is meant to soften a boundary should not
        be painting over a control.

        Its padding is the fades' own height, so at rest the first and last rows
        sit clear of them and only rows actually travelling past the ends are
        dimmed. Without it the top fade sits on the first row permanently, which
        reads as the row being greyed out rather than as the list continuing.
      */}
      <div className="process-list-fade shell:min-h-0 shell:flex-1 relative flex flex-col">
        <div
          ref={scrollRef}
          // An overflow on one axis clips the other as well, so the sides carry
          // the dragged row's reach as padding and give it straight back as
          // margin.
          className="shell:min-h-0 shell:flex-1 shell:overflow-y-auto shell:overscroll-contain shell:py-menu-fade shell:-mx-menu-drag-grow shell:px-menu-drag-grow"
        >
          <ol
            className="relative"
            aria-label={
              customising ? 'Customise process order' : 'Available processes'
            }
            // --row-pitch publishes the constant the translate maths uses, so
            // `.process-menu-row` and the drop slot derive their height from it
            // rather than restating it in CSS.
            style={
              {
                height: visibleOrder.length * ROW_HEIGHT,
                '--row-pitch': `${ROW_HEIGHT}px`,
              } as CSSProperties
            }
          >
            {drag ? (
              <li
                aria-hidden="true"
                className="process-drop-slot"
                style={{
                  transform: `translateY(${order.indexOf(drag.id) * ROW_HEIGHT}px)`,
                }}
              />
            ) : null}
            {(drag?.original ?? visibleOrder).map((id) => {
              const index = visibleOrder.indexOf(id);
              const item = items.find((entry) => entry.id === id);
              if (!item) return null;
              const dragging = drag?.id === id;
              const position = dragging
                ? drag.index * ROW_HEIGHT + drag.offset
                : index * ROW_HEIGHT;
              return (
                <li
                  key={id}
                  ref={(element) => {
                    rowAnchor(id).current = element;
                  }}
                  className="process-menu-row group/row"
                  data-current={current === item.href || undefined}
                  data-editing={customising || undefined}
                  data-dragging={dragging || undefined}
                  style={{ transform: `translateY(${position}px)` }}
                >
                  {/*
                    One wrapper for both, and it never unmounts: the handle and
                    its preview are different elements, so letting each mount
                    and unmount on its own gives React nothing to animate
                    between and the label snaps sideways. The wrapper animates
                    the width instead, and swaps what is inside it while it is
                    open.
                  */}
                  <motion.div
                    className="process-menu-row-start rail-mark grid flex-none place-items-center overflow-hidden"
                    initial={false}
                    animate={{
                      width: showGrip ? GRIP_WIDTH : 0,
                      marginRight: showGrip ? 0 : -GRIP_GAP,
                      opacity: showGrip ? 1 : 0,
                    }}
                    transition={gripTransition}
                  >
                    {customising ? (
                      <button
                        ref={(element) => registerHandle(id, element)}
                        type="button"
                        className={GRIP_HANDLE}
                        aria-label={`Reorder ${item.name}`}
                        aria-describedby="process-reorder-instructions"
                        onPointerDown={(event) => startDrag(event, id)}
                        onPointerMove={dragMove}
                        onPointerUp={() => finishDrag(false)}
                        onPointerCancel={() => finishDrag(true)}
                        onLostPointerCapture={() => finishDrag(true)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape' && escapeDrag()) {
                            event.preventDefault();
                          }
                          if (
                            event.key === 'ArrowUp' ||
                            event.key === 'ArrowDown' ||
                            event.key === 'Home' ||
                            event.key === 'End'
                          ) {
                            event.preventDefault();
                            moveFromKeyboard(
                              id,
                              event.key === 'Home'
                                ? 0
                                : event.key === 'End'
                                  ? order.length - 1
                                  : index + (event.key === 'ArrowUp' ? -1 : 1),
                            );
                          }
                        }}
                      >
                        <Grip />
                      </button>
                    ) : (
                      <span className={GRIP_PREVIEW} aria-hidden="true">
                        <Grip />
                      </span>
                    )}
                  </motion.div>
                  {customising ? (
                    <OverflowTooltip label={item.name}>
                      <span
                        className={cx(MENU_LABEL, 'flex-1')}
                        tabIndex={0}
                        role="img"
                        aria-label={item.name}
                      >
                        {item.name}
                      </span>
                    </OverflowTooltip>
                  ) : (
                    <OverflowTooltip label={item.name}>
                      <Link
                        className={cx(MENU_LABEL, 'process-menu-link')}
                        href={item.href}
                        onClick={(event) => {
                          if (
                            current === item.href ||
                            event.defaultPrevented ||
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return;
                          event.preventDefault();
                          leaveTo(item.href);
                        }}
                        aria-current={
                          current === item.href ? 'page' : undefined
                        }
                      >
                        {item.name}
                      </Link>
                    </OverflowTooltip>
                  )}
                  <Tooltip
                    label={item.name}
                    placement="right"
                    // Placed against the row, not the badge: the default gap
                    // is then measured from the row's edge, with no inset
                    // arithmetic to go stale.
                    triggerRef={rowAnchor(id)}
                    content={<ProcessStatusContent status={item.status} />}
                  >
                    <span
                      tabIndex={0}
                      role="img"
                      aria-label={`${item.name}: ${item.status.label}, ${item.status.totalLabel}`}
                      className={ROW_BADGE}
                      data-tone={item.status.tone}
                    >
                      <Glyph
                        name={
                          item.status.tone === 'blocked'
                            ? 'square'
                            : item.status.tone === 'caution'
                              ? 'triangle'
                              : item.status.tone === 'verified'
                                ? 'check'
                                : 'circle'
                        }
                        size={9}
                      />
                      <span aria-hidden="true">
                        {item.status.tone === 'blocked'
                          ? item.status.counts.blocked
                          : Object.values(item.status.counts).reduce(
                              (total, count) => total + count,
                              0,
                            )}
                      </span>
                    </span>
                  </Tooltip>
                </li>
              );
            })}
          </ol>
          {visibleOrder.length === 0 ? (
            <p className="text-muted text-meta px-2.5 py-3">
              No matching processes.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

/*
  One tone scale, two shapes: the summary pill and the four count cells read
  the same map, so a tone cannot mean one colour in one and another in the
  other. The 8% wash is what the tone's own text colour is legible on.

  `decision` is the tone a line waiting on a person takes -- see
  --sp-state-decision in app/styles/state.css for why it is not caution's
  amber -- and the runs rail paints the same three counts in the same three
  tones and the same order, so the two readings of one run agree.
*/
const TONE_CHIP: Record<
  ProcessNavigationItem['status']['tone'] | 'neutral' | 'decision',
  string
> = {
  blocked: 'text-state-blocked bg-state-blocked/8',
  decision: 'text-state-decision bg-state-decision/8',
  caution: 'text-state-caution bg-state-caution/8',
  verified: 'text-state-verified bg-state-verified/8',
  neutral: 'text-muted bg-surface-inset',
};

function ProcessStatusContent({
  status,
}: {
  status: ProcessNavigationItem['status'];
}) {
  const counts = [
    ['blocked', 'Blocked', status.counts.blocked],
    ['decision', 'Needs a decision', status.counts.needs_decision],
    ['neutral', 'Deferred', status.counts.deferred],
    ['verified', 'Ready for review', status.counts.will_apply],
  ] as const;

  return (
    <div className="grid gap-2.5">
      <div className="text-muted text-micro mt-0.5 flex justify-between gap-2.5">
        <span>Latest available run</span>
        <span>{status.totalLabel}</span>
      </div>
      <span
        className={cx(
          TONE_CHIP[status.tone],
          'text-micro justify-self-start rounded-full px-2 py-0.75 font-semibold',
        )}
      >
        {status.label}
      </span>
      <dl className="grid grid-cols-2 gap-1.25">
        {counts.map(([tone, label, count]) => (
          <div
            key={tone}
            className={cx(
              TONE_CHIP[tone],
              'rounded-section flex items-center justify-between gap-2 px-2 py-1.5',
            )}
          >
            <dt className="text-micro">{label}</dt>
            <dd className="text-meta [font-weight:650] tabular-nums">
              {count}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-rule-faint flex items-start gap-2 border-t pt-2.25">
        <span className="bg-state-advisory/10 text-state-advisory text-micro rounded-section px-1.25 py-0.5 font-semibold">
          {status.modeLabel}
        </span>
        <p className="text-muted text-micro">{status.modeDescription}</p>
      </div>
    </div>
  );
}
