'use client';

import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
// Deep import: Blode's barrel is the whole icon library.
import Pencil from 'blode-icons-react/icons/pencil-2-filled';
import { Button } from '@/components/ui/button';
import { Glyph } from '@/components/ui/glyph';
import { cx } from '@/lib/cx';
import {
  DISPOSITIONS,
  DISPOSITION_LABELS,
  severityRank,
  type Disposition,
  type Effect,
  type ReleasePlan,
} from '@/lib/review/plan-contract';
import { evaluationCounts, planState } from '@/lib/review/plan-derivations';
import {
  reviewEffects,
  reviewPage,
  type ReviewFilter,
} from '@/lib/review/review-navigation';
import { dispositionGlyph } from './markers';
import { AttentionLine, StaleRow } from './release-card';
import { ReviewFilterTabs, type FilterTab } from './review-filter-tabs';

/*
  The review's first panel: what the release needs, and every item in it. The
  item itself opens in the panel beside this one (review-item-aside.tsx), so
  this list stays in view and choosing another item swaps that panel's content.

  It is the release card grown into a list. The card's buckets head it as one
  tab strip -- here they filter rather than switch -- and its rows are the
  card's rows on one line: the subject, why it is in its bucket in that
  bucket's colour, and how many changes it would make.
*/

// The strip's word for each bucket. Short, because the panel is as wide as
// the strip on one line; the full name is the tab's accessible name and heads
// the bucket's group in the list.
const SHORT_LABELS: Record<Disposition, string> = {
  blocked: 'Blocked',
  needs_decision: 'Decision',
  deferred: 'Deferred',
  will_apply: 'Ready',
};

// The runs sheet's section row, on the panel's recess as the item's header
// is: opaque, since rows pass beneath it, and above the rows' dividers. Its
// lit line is its own (`.review-group-head`), so it stays with it while stuck.
// No count: at the row's end it lined up with the change counts and read as a
// total of them.
const GROUP_HEAD =
  'review-group-head readout text-muted border-floating-ring bg-surface-inset sticky top-0 z-2 flex h-sheet-head items-center gap-2 border-b px-5 [font-weight:var(--sp-mono-weight-strong)]';
const LIST = 'release-list';
// The whole row is the control. Open is the selected ground, and every part
// of it keeps the ink it has at rest, so nothing muted lands on that ground.
// One line: the subject, the reason, and the count ending the row; the reason
// truncates before the subject does. No set height: the line and the padding
// make it, so the rows follow the type scale.
const ROW =
  'release-row group/row control-wash hover:bg-surface-hover focus-visible:bg-surface-hover aria-expanded:bg-surface-selected grid w-full cursor-pointer grid-cols-[minmax(0,max-content)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-2.5 text-left';
// Opened items step back (`.release-row[data-seen]` in release-card.css).
const ROW_SUBJECT =
  'release-row-subject text-dense col-start-1 row-start-1 truncate';
// A step quieter than the subject: its bucket's ink a touch under the
// subject's weight, the strong ink when the row is lit.
const ROW_REASON =
  'text-severity-ink group-hover/row:text-severity-strong group-focus-visible/row:text-severity-strong group-aria-expanded/row:text-severity-strong col-start-2 row-start-1 control-wash truncate text-right text-meta [font-weight:450]';
// How many changes the item would make: an edit mark and the figure, no face,
// so it reads as a quantity rather than a second status. The pencil stays a
// step quieter than the figure in every state. Right-aligned in one cell, empty
// or not (`.review-row-count`), so counts line up at the row's end and every
// reason ends at the same place.
const ROW_CHANGE =
  'review-row-count value text-muted-strong group-hover/row:text-primary group-focus-visible/row:text-primary group-aria-expanded/row:text-primary control-wash col-start-3 row-start-1 inline-flex items-center justify-end gap-1 text-meta';
const ROW_FAILURE = 'text-state-blocked col-span-full text-meta';

export function ReviewQueue({
  plan,
  filter,
  onFilterChange,
  openId,
  seen,
  onOpen,
  anchorId,
  onPage,
}: {
  plan: ReleasePlan;
  filter: ReviewFilter;
  onFilterChange: (filter: ReviewFilter) => void;
  // The item open beside the list, if one is.
  openId: string | null;
  // Items already opened.
  seen?: ReadonlySet<string>;
  onOpen: (id: string) => void;
  // An item on the page to show: the open one, or the first of the page the
  // pager moved to.
  anchorId: string | null;
  onPage: (id: string) => void;
}) {
  const id = useId();
  const [announcement, setAnnouncement] = useState('');
  const counts = evaluationCounts(plan.effects);
  const reasonLabels = useMemo(
    () => new Map(plan.reasons.map((reason) => [reason.key, reason.label])),
    [plan.reasons],
  );
  const failures = new Map(
    plan.status.kind === 'partially_applied'
      ? plan.status.failures.map((failure) => [
          failure.effectId,
          failure.reason,
        ])
      : [],
  );
  const visible = reviewEffects(plan, filter);
  const pagination = reviewPage(visible, anchorId ?? '');

  const filters: FilterTab[] = [
    {
      key: 'all',
      short: 'All',
      label: `All ${plan.noun.other}`,
      count: plan.effects.length,
    },
    ...DISPOSITIONS.filter((disposition) => counts[disposition] > 0).map(
      (disposition) => ({
        key: disposition as ReviewFilter,
        short: SHORT_LABELS[disposition],
        label: DISPOSITION_LABELS[disposition],
        count: counts[disposition],
        severity: severityRank(disposition),
      }),
    ),
    ...(failures.size
      ? [
          {
            key: 'failures' as ReviewFilter,
            short: 'Failures',
            label: 'Failures',
            count: failures.size,
            severity: severityRank('blocked'),
          },
        ]
      : []),
  ];

  const chooseFilter = (next: ReviewFilter) => {
    const entry = filters.find((candidate) => candidate.key === next);
    onFilterChange(next);
    setAnnouncement(
      `${reviewEffects(plan, next).length} shown. ${entry?.label ?? ''}.`,
    );
  };
  const changePage = (direction: number) => {
    const next = visible[pagination.start + direction * pagination.size];
    if (!next) return;
    onPage(next.id);
    setAnnouncement(
      `Page ${pagination.page + direction + 1} of ${pagination.totalPages}.`,
    );
  };
  // A bucket gets a quiet cue only after the list has moved from the top.
  const list = useRef<HTMLDivElement>(null);
  const [spied, setSpied] = useState<ReviewFilter | null>(null);
  const spy = () => {
    const scroller = list.current;
    if (!scroller || filter !== 'all' || scroller.scrollTop <= 0) {
      setSpied(null);
      return;
    }
    let current: ReviewFilter | null = null;
    for (const section of scroller.querySelectorAll<HTMLElement>(
      '[data-group]',
    )) {
      if (section.offsetTop <= scroller.scrollTop + 1)
        current =
          DISPOSITIONS.find(
            (disposition) => disposition === section.dataset.group,
          ) ?? null;
    }
    setSpied(current);
  };
  useLayoutEffect(spy);

  // 1 to 9 pick a tab from anywhere in the queue, in the strip's order, as
  // each tab's aria-keyshortcuts says. Not while typing, and not with a
  // modifier, which belongs to the browser or the app.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
      return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const entry = filters[Number(event.key) - 1];
    if (!/^[1-9]$/.test(event.key) || !entry) return;
    event.preventDefault();
    if (entry.key !== filter) chooseFilter(entry.key);
  };

  return (
    // Contents only: the panel lays out the parts; this is where the keys are
    // heard from.
    <div className="contents" onKeyDown={onKeyDown}>
      <div className="border-floating-ring shadow-separator-bottom-solid shrink-0 border-b px-5 pt-4 pb-5">
        {/* Contained, so the lines wrap to the tab strip rather than widening
            the panel past it. */}
        <div className="contain-inline-size">
          <StaleRow plan={plan} />
          <p
            className={cx(
              'text-dense [font-weight:550] text-pretty',
              planState(plan) === 'fully_blocked' && 'text-state-blocked',
            )}
          >
            <AttentionLine counts={counts} noun={plan.noun} />
          </p>
        </div>
        <ReviewFilterTabs
          tabs={filters}
          selected={filter}
          spied={spied}
          onChange={chooseFilter}
        />
      </div>

      {/* The rows fit the panel; only the tabs size it. */}
      <div
        ref={list}
        onScroll={spy}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain contain-inline-size"
      >
        {visible.length === 0 ? (
          <p className="text-muted text-dense p-5">
            No {plan.noun.other} in this group.
          </p>
        ) : null}
        {DISPOSITIONS.map((disposition) => {
          const items = pagination.items.filter(
            (effect) => effect.disposition === disposition,
          );
          if (!items.length) return null;
          const headId = `${id}-${disposition}`;
          return (
            <section
              key={disposition}
              aria-labelledby={headId}
              data-group={disposition}
            >
              <h3
                id={headId}
                className={GROUP_HEAD}
                data-severity={severityRank(disposition)}
              >
                <span className="text-severity-ink flex" aria-hidden="true">
                  <Glyph name={dispositionGlyph[disposition]} size={8} />
                </span>
                {DISPOSITION_LABELS[disposition]}
              </h3>
              <ul className={LIST} data-inset="drawer">
                {items.map((effect) => (
                  <QueueRow
                    key={effect.id}
                    effect={effect}
                    reason={
                      effect.reasonKey
                        ? (reasonLabels.get(effect.reasonKey) ??
                          effect.reasonKey)
                        : null
                    }
                    failure={failures.get(effect.id) ?? null}
                    open={openId === effect.id}
                    seen={seen?.has(effect.id) ?? false}
                    onOpen={() => onOpen(effect.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Only for a plan too long to list at once. Ordinary controls, so the
          end of the range wears the same off face as every other unavailable
          control. */}
      {pagination.totalPages > 1 ? (
        <nav
          className="border-floating-ring text-muted text-meta flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3 contain-inline-size"
          aria-label="Review pages"
        >
          <Button
            isDisabled={pagination.page === 0}
            onPress={() => changePage(-1)}
          >
            Previous page
          </Button>
          <span>
            <span className="value">
              {pagination.start + 1}–
              {pagination.start + pagination.items.length}
            </span>{' '}
            of <span className="value">{visible.length}</span>
          </span>
          <Button
            isDisabled={pagination.page + 1 === pagination.totalPages}
            onPress={() => changePage(1)}
          >
            Next page
          </Button>
        </nav>
      ) : null}
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </div>
  );
}

// One item, on one line: what it is, how many changes it carries, and why it
// is in its bucket. The whole row opens it beside the list, and closes it.
function QueueRow({
  effect,
  reason,
  failure,
  open,
  seen,
  onOpen,
}: {
  effect: Effect;
  reason: string | null;
  failure: string | null;
  open: boolean;
  seen: boolean;
  onOpen: () => void;
}) {
  const changes = effect.deltas.length;
  // A ready item usually has no reason to give, and says nothing rather than
  // printing an absence down the column.
  const why = [reason, effect.requiresApproval && 'Needs approval']
    .filter(Boolean)
    .join(' · ');
  return (
    <li>
      <button
        type="button"
        className={ROW}
        data-severity={severityRank(effect.disposition)}
        data-seen={seen || undefined}
        aria-expanded={open}
        onClick={onOpen}
      >
        <span className={ROW_SUBJECT}>{effect.subject}</span>
        {why ? <span className={ROW_REASON}>{why}</span> : null}
        <span className={ROW_CHANGE}>
          {changes ? (
            <>
              {/* Its size and the gap after it are in `.review-row-count`. */}
              <Pencil
                aria-hidden
                size={12}
                className="text-muted-soft group-hover/row:text-muted group-focus-visible/row:text-muted group-aria-expanded/row:text-muted flex-none transition-colors duration-(--duration-state) ease-out"
              />
              {changes}
              <span className="sr-only">
                {changes === 1 ? ' change' : ' changes'}
              </span>
            </>
          ) : null}
        </span>
        {failure ? (
          <span className={ROW_FAILURE}>Application failed: {failure}</span>
        ) : null}
      </button>
    </li>
  );
}
