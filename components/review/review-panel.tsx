'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { LoadReviewDetail, ReviewDetail } from '@/lib/review/contracts';
import {
  DISPOSITIONS,
  DISPOSITION_LABELS,
  severityRank,
  type ReleasePlan,
} from '@/lib/review/plan-contract';
import { evaluationCounts } from '@/lib/review/plan-derivations';
import {
  reviewEffects,
  initialReviewId,
  reviewPage,
  type ReviewFilter,
} from '@/lib/review/review-navigation';
import { ReviewItemDetail } from './review-item-detail';

type DetailState =
  | { kind: 'loaded'; detail: ReviewDetail }
  | { kind: 'error'; id: string }
  | { kind: 'loading' };

type Filter = ReviewFilter;

// A filter pill carries its bucket's colour on the count alone: the label is
// navigation, the figure is the quantity being filtered to.
const FILTER =
  'border-rule-default aria-pressed:bg-surface-selected aria-pressed:border-rule-strong inline-flex min-h-8 items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-[12px] whitespace-nowrap [&[data-severity]_.value]:text-severity-ink';

// 70px is the two-line row this list is built around, so a one-line item does
// not make the column jump.
const ITEM_BUTTON =
  'hover:bg-surface-inset aria-[current=true]:bg-surface-selected aria-[current=true]:border-l-primary block min-h-[70px] w-full border-l-2 border-l-transparent px-4.5 py-3 text-left focus-visible:-outline-offset-[3px] forced-colors:aria-[current=true]:border-l-[Highlight] forced-colors:aria-[current=true]:outline forced-colors:aria-[current=true]:outline-[Highlight] forced-colors:aria-[current=true]:-outline-offset-2';
const ITEM_REASON = 'text-muted mt-1 block text-[12px] leading-[1.5]';

export function ReviewPanel({
  plan,
  loadDetail,
  initialItemId,
  initialFilter = 'all',
}: {
  plan: ReleasePlan;
  loadDetail: LoadReviewDetail;
  initialItemId?: string;
  initialFilter?: Filter;
}) {
  const id = useId();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [selectedId, setSelectedId] = useState(
    () =>
      initialReviewId(reviewEffects(plan, initialFilter), initialItemId) ?? '',
  );
  const [showDetail, setShowDetail] = useState(true);
  const [state, setState] = useState<DetailState>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const cache = useRef(new Map<string, ReviewDetail>());
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  const counts = evaluationCounts(plan.effects);
  const reasonLabels = useMemo(
    () => new Map(plan.reasons.map((reason) => [reason.key, reason.label])),
    [plan.reasons],
  );
  // Post-apply failures reuse the row contract, so they are a filter over the
  // same list rather than a separate error view.
  const failureIds = useMemo(
    () =>
      plan.status.kind === 'partially_applied'
        ? new Set(plan.status.failures.map((failure) => failure.effectId))
        : null,
    [plan.status],
  );

  const selected = plan.effects.find((effect) => effect.id === selectedId);
  const visible = reviewEffects(plan, filter);
  const pagination = reviewPage(visible, selectedId);
  const executionFailures = new Map(
    plan.status.kind === 'partially_applied'
      ? plan.status.failures.map((failure) => [
          failure.effectId,
          failure.reason,
        ])
      : [],
  );

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const key = `${plan.id}:${plan.revision}:${selectedId}`;
    const cached = cache.current.get(key);
    const pending = cached
      ? Promise.resolve(cached)
      : loadDetail(selectedId, controller.signal);
    pending
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (detail.id !== selectedId || detail.revision !== plan.revision)
          throw new Error('Review identity or revision changed');
        cache.current.set(key, detail);
        setState({ kind: 'loaded', detail });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ kind: 'error', id: selectedId });
      });
    return () => controller.abort();
  }, [plan.id, plan.revision, selectedId, loadDetail, retry]);

  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      if (showDetail) heading.current?.focus();
      else
        list.current
          ?.querySelector<HTMLButtonElement>('[aria-current="true"]')
          ?.focus();
    }
  }, [selectedId, showDetail]);

  if (!selected)
    return <p className="p-6">This item is not part of the review.</p>;

  const detail =
    state.kind === 'loaded' &&
    state.detail.id === selectedId &&
    state.detail.revision === plan.revision
      ? state.detail
      : null;
  const failed = state.kind === 'error' && state.id === selectedId;

  const applyFilter = (next: Filter, label: string) => {
    setFilter(next);
    const remaining = reviewEffects(plan, next);
    setAnnouncement(`${remaining.length} shown. ${label}.`);
    if (remaining[0] && !remaining.some((effect) => effect.id === selectedId))
      setSelectedId(remaining[0].id);
  };

  const changePage = (direction: number) => {
    const next = visible[pagination.start + direction * pagination.size];
    if (!next) return;
    setSelectedId(next.id);
    setAnnouncement(
      `Page ${pagination.page + direction + 1} of ${pagination.totalPages}.`,
    );
    list.current?.scrollTo({ top: 0 });
  };

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: `All ${plan.noun.other}`, count: plan.effects.length },
    ...DISPOSITIONS.filter((disposition) => counts[disposition] > 0).map(
      (disposition) => ({
        key: disposition as Filter,
        label: DISPOSITION_LABELS[disposition],
        count: counts[disposition],
      }),
    ),
    ...(failureIds
      ? [
          {
            key: 'failures' as Filter,
            label: 'Failures',
            count: failureIds.size,
          },
        ]
      : []),
  ];

  return (
    <div className="severity-scale @container/review flex min-h-0 flex-1 flex-col">
      <div className="bg-surface-inset border-rule-faint text-muted flex shrink-0 flex-wrap justify-between gap-x-5 gap-y-1 border-b px-6 py-2.5 text-[12px] @max-3xl/review:px-5">
        <span>{plan.evaluatedAt} · Recorded review</span>
        <span>{plan.context}</span>
      </div>
      {/* Both panes stay in the DOM; the container's width decides which is
          shown, and the hiding lives inside the narrow query so neither pane
          depends on out-specifying the other. */}
      <div
        className="group/view grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] @max-3xl/review:grid-cols-[minmax(0,1fr)]"
        data-view={showDetail ? 'detail' : 'list'}
      >
        <section
          className="border-rule-default flex min-h-0 flex-col border-r @max-3xl/review:border-r-0 group-data-[view=detail]/view:@max-3xl/review:hidden"
          aria-label="Review items"
        >
          <div
            className="border-rule-faint flex flex-wrap gap-1.5 border-b px-4 py-3"
            role="group"
            aria-label="Filter by disposition"
          >
            {filters.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={FILTER}
                data-severity={
                  entry.key === 'all' || entry.key === 'failures'
                    ? undefined
                    : severityRank(entry.key)
                }
                aria-pressed={filter === entry.key}
                onClick={() => applyFilter(entry.key, entry.label)}
              >
                {entry.label} <span className="value">{entry.count}</span>
              </button>
            ))}
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-0.5"
            ref={list}
          >
            {visible.length === 0 ? (
              <p className="text-muted p-5">
                No {plan.noun.other} in this group.
              </p>
            ) : null}
            {DISPOSITIONS.map((disposition) => {
              const items = pagination.items.filter(
                (effect) => effect.disposition === disposition,
              );
              return items.length ? (
                <section
                  key={disposition}
                  aria-labelledby={`${id}-${disposition}`}
                >
                  <h3
                    id={`${id}-${disposition}`}
                    className="text-muted flex items-center justify-between px-5 pt-4 pb-2 text-[12px] font-medium"
                  >
                    {DISPOSITION_LABELS[disposition]}
                    <span className="value">{items.length}</span>
                  </h3>
                  <ul>
                    {items.map((effect) => (
                      <li key={effect.id}>
                        <button
                          className={ITEM_BUTTON}
                          aria-current={
                            selectedId === effect.id ? 'true' : undefined
                          }
                          onClick={() => {
                            if (selectedId === effect.id && showDetail) {
                              heading.current?.focus();
                              return;
                            }
                            moveFocus.current = true;
                            setSelectedId(effect.id);
                            setShowDetail(true);
                          }}
                        >
                          <span className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-[13px] [font-weight:550]">
                            {effect.subject}
                            {effect.requiresApproval ? (
                              <span className="border-rule-default text-muted rounded-full border px-[7px] py-0.5 text-[11px] whitespace-nowrap">
                                Needs approval
                              </span>
                            ) : null}
                          </span>
                          <span className={ITEM_REASON}>
                            {effect.reasonKey
                              ? (reasonLabels.get(effect.reasonKey) ??
                                effect.reasonKey)
                              : 'No recorded reason'}
                          </span>
                          {executionFailures.has(effect.id) ? (
                            <span
                              className={`${ITEM_REASON} text-state-blocked`}
                            >
                              Application failed:{' '}
                              {executionFailures.get(effect.id)}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null;
            })}
          </div>
          {pagination.totalPages > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 [&_button]:min-h-9 [&_button]:px-2 [&_button]:py-1 [&_button:disabled]:opacity-50 [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-current"
              aria-label="Review pages"
            >
              <button
                type="button"
                disabled={pagination.page === 0}
                onClick={() => changePage(-1)}
              >
                Previous page
              </button>
              <span>
                Page {pagination.page + 1} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={pagination.page + 1 === pagination.totalPages}
                onClick={() => changePage(1)}
              >
                Next page
              </button>
            </nav>
          ) : null}
          <p className="border-rule-faint text-muted border-t px-5 py-3 text-[12px]">
            {visible.length
              ? `${pagination.start + 1}–${pagination.start + pagination.items.length}`
              : '0'}{' '}
            of {visible.length} matching {plan.noun.other} shown ·{' '}
            {plan.effects.length} total
          </p>
        </section>
        <section
          className="min-h-0 min-w-0 scroll-p-6 overflow-y-auto overscroll-contain group-data-[view=list]/view:@max-3xl/review:hidden"
          aria-labelledby={`${id}-item-title`}
        >
          <div className="px-8 pt-7 pb-5 @max-3xl/review:px-5 @max-3xl/review:pt-3">
            <button
              className="text-muted mb-3 inline-flex min-h-11 items-center text-left text-[13px] underline underline-offset-4 @3xl/review:hidden"
              onClick={() => {
                moveFocus.current = true;
                setShowDetail(false);
              }}
            >
              ← All review items
            </button>
            <p className="text-meta text-muted mb-2">
              <span className="value">{selected.id}</span> · {selected.subtitle}
            </p>
            <h3
              id={`${id}-item-title`}
              ref={heading}
              tabIndex={-1}
              className="text-[26px] leading-[1.25] [font-weight:550] tracking-[-0.035em] @max-3xl/review:text-[24px]"
            >
              {selected.subject}
            </h3>
          </div>
          {executionFailures.has(selectedId) ? (
            <p className="text-state-blocked px-6 py-4">
              <strong>Application failed</strong> ·{' '}
              {executionFailures.get(selectedId)}
            </p>
          ) : null}
          <div aria-busy={!detail && !failed}>
            {detail ? (
              <ReviewItemDetail
                key={detail.id}
                detail={detail}
                idPrefix={`${id}-${detail.id}`}
              />
            ) : failed ? (
              <div className="p-6">
                <p>
                  Details could not be loaded. Your selected item is unchanged.
                </p>
                <Button
                  className="mt-4"
                  onPress={() => {
                    setState({ kind: 'loading' });
                    setRetry((value) => value + 1);
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <p className="text-muted px-6 py-8">Loading item details…</p>
            )}
          </div>
          <p className="sr-only" role="status">
            {failed
              ? 'Item details could not be loaded. Try again is available.'
              : detail
                ? `Details loaded for ${selected.subject}.`
                : 'Loading item details.'}
          </p>
        </section>
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {/* The counter is live from pass 2, when exclusion lands. It reads from
          the plan today so it can never disagree with the list above it. */}
      <footer className="border-rule-default bg-surface-inset text-muted [&_strong]:text-primary flex shrink-0 flex-wrap justify-between gap-x-5 gap-y-1 border-t px-6 py-3.5 text-[12px] @max-3xl/review:px-5 [&_strong]:[font-weight:550]">
        <span>
          <strong>Replay preview</strong> · Explore the recorded proposal and
          evidence.
        </span>
        <span>
          {plan.effects.length} of {plan.effects.length} {plan.noun.other}{' '}
          selected · Nothing applied.
        </span>
      </footer>
    </div>
  );
}
