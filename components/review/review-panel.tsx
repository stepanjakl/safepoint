'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { LoadReviewDetail, ReviewDetail } from '@/lib/review/contracts';
import {
  DISPOSITIONS,
  DISPOSITION_LABELS,
  severityRank,
  type Disposition,
  type ReleasePlan,
} from '@/lib/review/plan-contract';
import { evaluationCounts } from '@/lib/review/plan-derivations';
import { ReviewItemDetail } from './review-item-detail';

type DetailState =
  | { kind: 'loaded'; detail: ReviewDetail }
  | { kind: 'error'; id: string }
  | { kind: 'loading' };

type Filter = Disposition | 'all' | 'failures';

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
    initialItemId ?? plan.effects[0]?.id ?? '',
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

  const matches = (disposition: Disposition, effectId: string) =>
    filter === 'all'
      ? true
      : filter === 'failures'
        ? (failureIds?.has(effectId) ?? false)
        : disposition === filter;

  const selected = plan.effects.find((effect) => effect.id === selectedId);
  const visible = plan.effects
    .filter((effect) => matches(effect.disposition, effect.id))
    .toSorted(
      (a, b) => severityRank(a.disposition) - severityRank(b.disposition),
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
    const remaining = plan.effects.filter((effect) =>
      next === 'all'
        ? true
        : next === 'failures'
          ? (failureIds?.has(effect.id) ?? false)
          : effect.disposition === next,
    );
    setAnnouncement(`${remaining.length} shown. ${label}.`);
    if (remaining[0] && !remaining.some((effect) => effect.id === selectedId))
      setSelectedId(remaining[0].id);
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
    <div className="review-panel">
      <div className="review-context">
        <span>{plan.evaluatedAt} · Recorded review</span>
        <span>{plan.context}</span>
      </div>
      <div className="review-body" data-view={showDetail ? 'detail' : 'list'}>
        <section className="review-list-pane" aria-label="Review items">
          <div
            className="review-filters"
            role="group"
            aria-label="Filter by disposition"
          >
            {filters.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="review-filter"
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
          <div className="review-item-list" ref={list}>
            {visible.length === 0 ? (
              <p className="text-muted p-5">
                No {plan.noun.other} in this group.
              </p>
            ) : null}
            {DISPOSITIONS.map((disposition) => {
              const items = visible.filter(
                (effect) => effect.disposition === disposition,
              );
              return items.length ? (
                <section
                  key={disposition}
                  aria-labelledby={`${id}-${disposition}`}
                >
                  <h3
                    id={`${id}-${disposition}`}
                    className="review-group-heading"
                  >
                    {DISPOSITION_LABELS[disposition]}
                    <span className="value">{items.length}</span>
                  </h3>
                  <ul>
                    {items.map((effect) => (
                      <li key={effect.id}>
                        <button
                          className="review-item-button"
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
                          <span className="review-item-name">
                            {effect.subject}
                            {effect.requiresApproval ? (
                              <span className="release-chip">
                                Needs approval
                              </span>
                            ) : null}
                          </span>
                          <span className="review-item-reason">
                            {effect.reasonKey
                              ? (reasonLabels.get(effect.reasonKey) ??
                                effect.reasonKey)
                              : 'No recorded reason'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null;
            })}
          </div>
          <p className="review-list-accounting">
            {visible.length} of {plan.effects.length} {plan.noun.other} shown
          </p>
        </section>
        <section
          className="review-detail-pane"
          aria-labelledby={`${id}-item-title`}
        >
          <div className="review-detail-heading">
            <button
              className="review-back review-text-button"
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
            <h3 id={`${id}-item-title`} ref={heading} tabIndex={-1}>
              {selected.subject}
            </h3>
          </div>
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
      <footer className="review-panel-footer">
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
