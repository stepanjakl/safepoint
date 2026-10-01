'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  Button as AriaButton,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  ToggleButton,
  ToggleButtonGroup,
} from 'react-aria-components';
import { cx } from '@/lib/cx';
import type { ReviewFilter } from '@/lib/review/review-navigation';

/*
  The queue's filter, as one strip of tabs in a field-faced track. The choice
  is a single solid face that slides to the tab chosen, rather than each tab
  filling on its own: one object moving says "the same choice, somewhere
  else", where two fills trading places read as two things happening. Every
  tab leads with its count on a chip of its own, as the change counts in the
  rows do.
*/

export type FilterTab = {
  key: ReviewFilter;
  // Short, for the strip; `label` is the full name, for the tab's accessible
  // name and the announcement when it is chosen.
  short: string;
  label: string;
  count: number;
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
  'review-filter-focus review-filter-wash group/tab relative inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 ps-1 pe-3 text-dense font-medium whitespace-nowrap outline-none';
const BUCKET_TAB =
  'text-severity-ink data-[spied]:bg-surface-hover data-[hovered]:not-data-[selected]:text-severity-strong data-[focus-visible]:not-data-[selected]:text-severity-strong data-[selected]:text-severity-on-solid';
// "All" takes the strip's spare width, so the buckets sit together at the
// end; its end margin gives the divider after it room on both sides.
const ALL_BOX = 'me-3 flex-1';
const ALL_TAB = cx(
  ALL_BOX,
  'text-muted-strong data-[hovered]:not-data-[selected]:text-primary data-[focus-visible]:not-data-[selected]:text-primary data-[selected]:text-inverse',
);
// The count's chip: a rung past the track at rest, the field face when its
// group is spied, and inverted on the chosen solid.
const BUCKET_COUNT =
  'bg-severity-fill-strong group-data-[hovered]/tab:bg-severity-pill-hover group-data-[focus-visible]/tab:bg-severity-pill-hover group-data-[spied]/tab:bg-field-face group-data-[selected]/tab:bg-severity-on-solid group-data-[selected]/tab:text-severity-solid';
// "All"'s chip is the track's own face, a window through its resting face.
const ALL_COUNT =
  'bg-field-face group-data-[selected]/tab:bg-inverse group-data-[selected]/tab:text-review-all-solid';
const COUNT =
  'review-tab-count review-filter-wash value text-micro inline-grid place-items-center rounded-full px-1 [font-weight:550]';
const DIVIDER = 'review-filter-divider';

// The chosen face, under the tabs: the bucket's solid, or a neutral one for
// "All". No edge: the solid is the whole mark.
const INDICATOR =
  'review-tab-indicator bg-review-all-solid data-[severity]:bg-severity-solid';

// The other tabs, where the strip is too narrow to show them: the tab's own
// shape and ink, so "More" reads as part of the strip.
const MORE =
  'review-filter-focus control-wash text-muted-strong interact:text-primary data-[pressed]:text-primary inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-dense font-medium whitespace-nowrap outline-none';
const MENU_ITEM =
  'control-wash text-primary data-[focused]:bg-surface-hover flex cursor-pointer items-center gap-2 rounded-control p-1 pe-2.5 text-dense font-medium outline-none';

export function ReviewFilterTabs({
  tabs,
  selected,
  spied,
  scrolling,
  onChange,
}: {
  tabs: FilterTab[];
  selected: ReviewFilter;
  spied: ReviewFilter | null;
  scrolling: boolean;
  onChange: (filter: ReviewFilter) => void;
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
  // tab stays and the rest move into a menu, rather than wrapping the track
  // into two rows of pills.
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const element = track.current;
    const ruler = measure.current;
    if (!element || !ruler) return;
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
    return () => observer.disconnect();
  }, [tabs]);

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
      const allTab = element.querySelector<HTMLElement>(
        '[data-review-filter="all"]',
      );
      const nextTab = allTab?.nextElementSibling;
      const divider =
        !collapsed && allTab && nextTab
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
  }, [selected, tabs.length, collapsed]);

  const chosen = tabs.find((tab) => tab.key === selected);
  const shown = collapsed ? tabs.filter((tab) => tab.key === selected) : tabs;
  const rest = collapsed ? tabs.filter((tab) => tab.key !== selected) : [];

  return (
    <div
      ref={track}
      className="field-track relative mt-3 flex justify-between gap-0.5 rounded-full"
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
        aria-label="Filter by disposition"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[selected]}
        onSelectionChange={(keys) => {
          const [next] = keys;
          if (next !== undefined && next !== selected)
            onChange(next as ReviewFilter);
        }}
        className="flex min-w-0 flex-1 justify-between gap-0.5"
      >
        {shown.map((tab) => (
          <ToggleButton
            key={tab.key}
            id={tab.key}
            aria-label={`${tab.label}, ${tab.count}`}
            aria-keyshortcuts={String(tabs.indexOf(tab) + 1)}
            className={cx(
              TAB,
              tab.severity !== undefined ? BUCKET_TAB : ALL_TAB,
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
            <Content tab={tab} />
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
        <MenuTrigger>
          <AriaButton className={MORE}>
            More
            <span aria-hidden="true">▾</span>
          </AriaButton>
          <Popover
            placement="bottom end"
            offset={6}
            className="control-face surface-floating rounded-shell p-1"
          >
            <Menu
              aria-label="Other filters"
              className="grid gap-0.5 outline-none"
              onAction={(key) => onChange(key as ReviewFilter)}
            >
              {rest.map((tab) => (
                <MenuItem
                  key={tab.key}
                  id={tab.key}
                  textValue={tab.label}
                  className={MENU_ITEM}
                  data-severity={tab.severity}
                >
                  <span
                    className={cx(
                      COUNT,
                      tab.severity !== undefined
                        ? 'bg-severity-fill-strong text-severity-strong'
                        : 'bg-surface-selected',
                    )}
                  >
                    {tab.count}
                  </span>
                  {tab.label}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
      ) : null}
      {/* The full strip, unseen, for measuring whether it fits. */}
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
            className={cx(TAB, tab.severity === undefined && ALL_BOX)}
          >
            <Content tab={tab} />
          </span>
        ))}
      </div>
    </div>
  );
}

function Content({ tab }: { tab: FilterTab }) {
  return (
    <>
      <span
        className={cx(
          COUNT,
          tab.severity !== undefined ? BUCKET_COUNT : ALL_COUNT,
        )}
      >
        {tab.count}
      </span>
      <span className="flex-1 text-center">{tab.short}</span>
    </>
  );
}
