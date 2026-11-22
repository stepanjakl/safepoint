'use client';

import ChevronDown from 'blode-icons-react/icons/chevron-down';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { cx } from '@/lib/ui/cx';

/*
  The queue's filter, as one strip of tabs in a field-faced track. The choice
  is a single solid face that slides to the tab chosen, rather than each tab
  filling on its own: one object moving says "the same choice, somewhere
  else", where two fills trading places read as two things happening. Every
  tab leads with its count on a chip of its own, as the change counts in the
  rows do.
*/

export type FilterTab<Key extends string = string> = {
  key: Key;
  // Short, for the strip; `label` is the full name, for the tab's accessible
  // name and the announcement when it is chosen.
  short: string;
  label: string;
  count?: number;
  // The bucket's rank, for its colour. "All" has none and stays neutral.
  severity?: number;
};

/*
  The indicator is the selected fill. A bucket gains a faint face only when its
  group reaches the top of a scrolled list; at the starting position it rests
  bare. Ink settles on the shared state step, while scroll-driven fills change
  immediately so the cue stays with fast-moving headers.

  The buckets keep their content width and "All" takes what is left. In every
  tab the chip sits in the tab's own inset -- one padding on its three outer
  sides -- and the label's end takes more: against the tab's curve, the chip's
  inset put the text hard up to the edge of a chosen solid. The label is its
  own span, taking whatever width the tab has past the chip and centred in it,
  so a stretched "All" keeps its word in the middle of its section.
*/
const TAB =
  'review-filter-focus review-filter-wash group/tab relative inline-flex cursor-pointer items-center rounded-full font-medium whitespace-nowrap';
// Each size's type, height and ends; the small one sits beside a result.
const SIZE = {
  default: 'gap-1.5 py-1 pe-3 text-dense',
  small: 'min-h-5.5 gap-1.5 pe-2.5 text-meta',
} as const;
// The chip's inset on its three outer sides is the tab's own half-leftover:
// (line height + tab padding - chip) / 2, 4px at the default size. The small
// size has 3px: its chip is the tab's height less that on every side.
const CHIP_START = { default: 'ps-1', small: 'ps-0.75' } as const;
// A tab of words alone starts as far in as it ends (SIZE's pe-*).
const WORD_START = { default: 'ps-3', small: 'ps-2.5' } as const;
const HOVER_FACE =
  'data-[hovered]:not-data-[selected]:bg-filter-wash data-[pressed]:not-data-[selected]:bg-filter-wash';
// A bucket with nothing in it drops to muted ink, waking on the pointer.
const EMPTY_TAB =
  'text-muted data-[hovered]:not-data-[selected]:text-severity-strong data-[focus-visible]:not-data-[selected]:text-severity-strong data-[selected]:text-filter-ink';
const BUCKET_TAB =
  'text-severity-ink data-[hovered]:not-data-[selected]:text-severity-strong data-[focus-visible]:not-data-[selected]:text-severity-strong data-[selected]:text-filter-ink';
// "All" takes the strip's spare width, so the buckets sit together at the
// end; its end margin gives the divider after it room on both sides.
const ALL_BOX = 'me-3 flex-1';
const ALL_TAB = cx(
  ALL_BOX,
  'data-[hovered]:not-data-[selected]:bg-filter-chip data-[pressed]:not-data-[selected]:bg-filter-chip',
  'text-muted-strong data-[hovered]:not-data-[selected]:text-primary data-[focus-visible]:not-data-[selected]:text-primary data-[selected]:text-filter-neutral-on-solid',
);
const NEUTRAL_TAB = cx(
  HOVER_FACE,
  'text-muted-strong data-[hovered]:not-data-[selected]:text-primary data-[focus-visible]:not-data-[selected]:text-primary data-[selected]:text-filter-neutral-on-solid',
);
// The count's chip: a rung past the track at rest, a rung more under the
// pointer or when its group is spied, and a step of the solid when chosen.
const BUCKET_COUNT =
  'bg-filter-chip group-data-[hovered]/tab:bg-filter-chip-hover group-data-[focus-visible]/tab:bg-filter-chip-hover group-data-[spied]/tab:bg-filter-chip-hover group-data-[selected]/tab:bg-filter-chip-chosen group-data-[selected]/tab:text-filter-ink';
// "All"'s chip rests on the track's own face, a window through its tab.
const ALL_COUNT =
  'bg-filter-face group-data-[selected]/tab:bg-filter-chip-chosen group-data-[selected]/tab:text-filter-neutral-on-solid';
const COUNT =
  'review-tab-count review-filter-wash value relative z-2 text-micro font-label inline-grid place-items-center rounded-full px-1';
const DIVIDER = 'review-filter-divider';

// The chosen face, under the tabs: the bucket's solid, or a neutral one for
// "All". No edge: the solid is the whole mark.
const INDICATOR = 'review-tab-indicator';

export function FilterTabs<Key extends string>({
  tabs,
  selected,
  spied = null,
  scrolling = false,
  onChange,
  leadKey = 'all',
  ariaLabel = 'Filter by disposition',
  menuLabel = 'Other filters',
  collapseToMenu = true,
  numberShortcuts = false,
  size = 'default',
  className,
  trackRef,
  descriptionId,
}: {
  tabs: FilterTab<Key>[];
  selected: Key;
  spied?: Key | null;
  scrolling?: boolean;
  onChange: (filter: Key) => void;
  leadKey?: string | null;
  ariaLabel?: string;
  menuLabel?: string;
  collapseToMenu?: boolean;
  numberShortcuts?: boolean;
  size?: keyof typeof SIZE;
  className?: string;
  trackRef?: RefObject<HTMLDivElement | null>;
  descriptionId?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    // Off for the first placement and for a resize, so the face appears
    // where it belongs rather than travelling there.
    glide: boolean;
  } | null>(null);
  const [dividerLeft, setDividerLeft] = useState<number | null>(null);
  // "All"'s resting face, under the chosen solid: see `.review-tab-home`.
  const [home, setHome] = useState<{ left: number; width: number } | null>(
    null,
  );
  // Whether the whole strip fits on one line. Where it does not, the chosen
  // tab stays and the rest move into a select, rather than wrapping the track
  // into two rows of pills.
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const element = track.current;
    const ruler = measure.current;
    if (!collapseToMenu || !element || !ruler) return;
    const fit = () => {
      // The ruler is the full strip, laid out but unseen; the track's own
      // content box is the room it has.
      const style = getComputedStyle(element);
      const room =
        element.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth);
      setCollapsed(ruler.getBoundingClientRect().width > room + 0.5);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    observer.observe(ruler);
    return () => observer.disconnect();
  }, [collapseToMenu, tabs]);

  const showMenu = collapseToMenu && collapsed;

  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const place = (glide: boolean) => {
      const tab = element.querySelector<HTMLElement>('[data-selected]');
      if (!tab) return;
      // From the boxes as painted, not offsetLeft and offsetWidth: those round
      // to whole pixels, and spread tabs sit on fractions of one, so the solid
      // sat up to half a pixel off its tab and the chip's inset looked uneven.
      // Measured from the track's padding edge, where the absolute parts start.
      const origin =
        element.getBoundingClientRect().left +
        parseFloat(getComputedStyle(element).borderLeftWidth);
      const rect = tab.getBoundingClientRect();
      const left = rect.left - origin;
      const width = rect.width;
      // Midway between "All" and the first bucket, while both are in the strip.
      const allTab =
        leadKey === null
          ? null
          : Array.from(
              element.querySelectorAll<HTMLElement>('[data-review-filter]'),
            ).find((tab) => tab.dataset.reviewFilter === leadKey);
      const nextTab = allTab?.nextElementSibling;
      const divider =
        !showMenu && allTab && nextTab
          ? (allTab.getBoundingClientRect().right +
              nextTab.getBoundingClientRect().left) /
              2 -
            origin
          : null;
      setDividerLeft((was) =>
        was !== null && divider !== null && Math.abs(was - divider) < 0.01
          ? was
          : divider,
      );
      const allRect = allTab?.getBoundingClientRect();
      setHome((was) =>
        !allRect
          ? null
          : was &&
              Math.abs(was.left - (allRect.left - origin)) < 0.01 &&
              Math.abs(was.width - allRect.width) < 0.01
            ? was
            : { left: allRect.left - origin, width: allRect.width },
      );
      // The observer reports once as soon as it starts, in the same frame as
      // a choice: with nothing moved it must leave the glide alone, or it
      // switches the transition off before the move is ever painted.
      setIndicator((was) =>
        was &&
        Math.abs(was.left - left) < 0.01 &&
        Math.abs(was.width - width) < 0.01
          ? was
          : { left, width, glide: glide && was !== null },
      );
    };
    place(true);
    // The track, and every tab in it: a tab can change width -- a face that
    // finishes loading -- without the track changing size at all.
    const observer = new ResizeObserver(() => place(false));
    observer.observe(element);
    for (const tab of element.querySelectorAll('[data-review-filter]'))
      observer.observe(tab);
    return () => observer.disconnect();
  }, [selected, tabs.length, showMenu, leadKey]);

  const chosen = tabs.find((tab) => tab.key === selected);
  const shown = showMenu ? tabs.filter((tab) => tab.key === selected) : tabs;
  const rest = showMenu ? tabs.filter((tab) => tab.key !== selected) : [];

  return (
    <div
      ref={(element) => {
        track.current = element;
        if (trackRef) trackRef.current = element;
      }}
      data-size={size}
      data-scroll-tabs={!collapseToMenu || undefined}
      aria-describedby={descriptionId}
      className={cx(
        // Isolated: its layers (z-1 solid, z-2 words) stay inside the strip
        // rather than rising over a sticky header it scrolls under.
        'field-track relative isolate flex justify-start gap-0.5 rounded-full',
        collapseToMenu ? 'max-w-full' : 'w-max',
        collapseToMenu && (showMenu ? 'w-full' : 'w-fit'),
        className,
      )}
    >
      {/* A layer of its own rather than the tab's background: tabs paint over
          the sliding solid, so a fill on the tab would sit on top of it. */}
      {home ? (
        <span
          aria-hidden="true"
          className="review-tab-home"
          style={{
            width: home.width,
            transform: `translateX(${home.left}px)`,
          }}
        />
      ) : null}
      {indicator ? (
        <span
          aria-hidden="true"
          className={INDICATOR}
          data-severity={chosen?.severity}
          data-glide={indicator.glide || undefined}
          style={{
            width: indicator.width,
            transform: `translateX(${indicator.left}px)`,
          }}
        />
      ) : null}
      <ToggleButtonGroup
        aria-label={ariaLabel}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[selected]}
        onSelectionChange={(keys) => {
          const [next] = keys;
          if (next !== undefined && next !== selected) onChange(next as Key);
        }}
        className="flex min-w-0 justify-start gap-0.5"
      >
        {shown.map((tab) => (
          <ToggleButton
            key={tab.key}
            id={tab.key}
            aria-label={
              tab.count === undefined ? tab.label : `${tab.label}, ${tab.count}`
            }
            aria-keyshortcuts={
              numberShortcuts ? String(tabs.indexOf(tab) + 1) : undefined
            }
            className={cx(
              TAB,
              SIZE[size],
              showMenu && 'min-w-0',
              // The inset is the count chip's; a tab without one pads evenly.
              tab.count === undefined ? WORD_START[size] : CHIP_START[size],
              tab.severity !== undefined
                ? cx(HOVER_FACE, tab.count === 0 ? EMPTY_TAB : BUCKET_TAB)
                : tab.key === leadKey
                  ? ALL_TAB
                  : NEUTRAL_TAB,
            )}
            data-review-filter={tab.key}
            data-severity={tab.severity}
            data-spied={
              spied === tab.key && selected !== tab.key ? '' : undefined
            }
            data-scroll-active={
              scrolling && tab.severity !== undefined ? '' : undefined
            }
          >
            <Content tab={tab} lead={tab.key === leadKey} truncate={showMenu} />
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {dividerLeft !== null ? (
        <span
          aria-hidden="true"
          className={DIVIDER}
          style={{ left: dividerLeft }}
        />
      ) : null}
      {rest.length ? (
        <span
          data-review-filter-more
          className={cx(
            TAB,
            SIZE[size],
            WORD_START[size],
            'text-muted-strong hover:text-primary has-[:focus-visible]:text-primary hover:bg-filter-wash active:bg-filter-wash shrink-0',
          )}
        >
          <span aria-hidden="true">More</span>
          <ChevronDown
            aria-hidden
            size={14}
            strokeWidth={2.25}
            className="relative start-0.5"
          />
          <select
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label={`More: ${menuLabel}`}
            value=""
            onChange={(event) => {
              const tab = rest[event.currentTarget.selectedIndex - 1];
              if (tab) onChange(tab.key);
            }}
          >
            <option value="" disabled>
              More
            </option>
            {rest.map((tab, index) => (
              <option key={tab.key} value={index}>
                {tab.count === undefined
                  ? tab.label
                  : `${tab.label} (${tab.count})`}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      {/* The full strip, unseen, for measuring whether it fits. */}
      {collapseToMenu && (
        <div
          ref={measure}
          aria-hidden="true"
          // Its own full width, not capped at the track's: an absolute box
          // shrinks to fit its container, and would never measure as too wide.
          className="pointer-events-none invisible absolute flex w-max gap-0.5"
        >
          {tabs.map((tab) => (
            // With each tab's own padding and margin, so the ruler is as wide as
            // the strip at its narrowest.
            <span
              key={tab.key}
              className={cx(
                TAB,
                SIZE[size],
                tab.count === undefined ? WORD_START[size] : CHIP_START[size],
                tab.key === leadKey && ALL_BOX,
              )}
            >
              <Content tab={tab} lead={tab.key === leadKey} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Content<Key extends string>({
  tab,
  lead,
  truncate = false,
}: {
  tab: FilterTab<Key>;
  lead: boolean;
  truncate?: boolean;
}) {
  return (
    <>
      {tab.count === undefined ? null : (
        <span
          className={cx(
            COUNT,
            // Only the lead tab's chip is a window onto the track; any other
            // tab without a tone takes the bucket chip in neutral steps.
            lead && tab.severity === undefined ? ALL_COUNT : BUCKET_COUNT,
          )}
        >
          {tab.count}
        </span>
      )}
      <span
        className={cx(
          'relative z-2 flex-1 text-center',
          truncate && 'truncate',
        )}
      >
        {tab.short}
      </span>
    </>
  );
}
