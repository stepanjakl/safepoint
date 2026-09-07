'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  countReviewGroups,
  GROUP_LABELS,
  type LoadReviewDetail,
  type ReviewBatch,
  type ReviewDetail,
  type ReviewGroup,
} from '@/lib/review/contracts';
import { ReviewItemDetail } from './review-item-detail';

type DetailState =
  | { kind: 'loaded'; detail: ReviewDetail }
  | { kind: 'error'; id: string }
  | { kind: 'loading' };
const priority: Record<ReviewGroup, number> = {
  blocked: 0,
  attention: 1,
  ready: 2,
};

export function ReviewPanel({
  batch,
  loadDetail,
  initialItemId = batch.initialItemId,
  initialGroup = 'all',
}: {
  batch: ReviewBatch;
  loadDetail: LoadReviewDetail;
  initialItemId?: string;
  initialGroup?: ReviewGroup | 'all';
}) {
  const id = useId();
  const [filter, setFilter] = useState<ReviewGroup | 'all'>(initialGroup);
  const [selectedId, setSelectedId] = useState(initialItemId);
  const [showDetail, setShowDetail] = useState(true);
  const [state, setState] = useState<DetailState>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const cache = useRef(new Map<string, ReviewDetail>());
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const counts = countReviewGroups(batch.items);
  const selected = batch.items.find((item) => item.id === selectedId);
  const visible = batch.items
    .filter((item) => filter === 'all' || item.group === filter)
    .toSorted((a, b) => priority[a.group] - priority[b.group]);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${batch.id}:${batch.revision}:${selectedId}`;
    const cached = cache.current.get(key);
    const pending = cached
      ? Promise.resolve(cached)
      : loadDetail(selectedId, controller.signal);
    pending
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (detail.id !== selectedId || detail.revision !== batch.revision)
          throw new Error('Review identity or revision changed');
        cache.current.set(key, detail);
        setState({ kind: 'loaded', detail });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ kind: 'error', id: selectedId });
      });
    return () => controller.abort();
  }, [batch.id, batch.revision, selectedId, loadDetail, retry]);

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
    state.detail.revision === batch.revision
      ? state.detail
      : null;
  const failed = state.kind === 'error' && state.id === selectedId;

  return (
    <div className="review-panel">
      <div className="review-context">
        <span>{batch.evaluatedAt} · Recorded review</span>
        <span>{batch.context}</span>
      </div>
      <div className="review-body" data-view={showDetail ? 'detail' : 'list'}>
        <section className="review-list-pane" aria-label="Review items">
          <div className="review-list-controls">
            <label htmlFor={`${id}-filter`}>Items to review</label>
            <select
              id={`${id}-filter`}
              value={filter}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value !== 'all' &&
                  value !== 'attention' &&
                  value !== 'blocked' &&
                  value !== 'ready'
                )
                  return;
                setFilter(value);
                const next = batch.items
                  .filter((item) => value === 'all' || item.group === value)
                  .toSorted((a, b) => priority[a.group] - priority[b.group]);
                setAnnouncement(
                  `${next.length} items shown. ${value === 'all' ? 'All items' : GROUP_LABELS[value]}.`,
                );
                if (next[0] && !next.some((item) => item.id === selectedId))
                  setSelectedId(next[0].id);
              }}
            >
              <option value="all">All items · {batch.items.length}</option>
              <option value="blocked">Cannot proceed · {counts.blocked}</option>
              <option value="attention">
                Needs attention · {counts.attention}
              </option>
              <option value="ready">Ready for review · {counts.ready}</option>
            </select>
          </div>
          <div className="review-item-list" ref={list}>
            {visible.length === 0 ? (
              <p className="text-muted p-5">No items in this group.</p>
            ) : null}
            {(['blocked', 'attention', 'ready'] as const).map((group) => {
              const items = visible.filter((item) => item.group === group);
              return items.length ? (
                <section key={group} aria-labelledby={`${id}-${group}`}>
                  <h3 id={`${id}-${group}`} className="review-group-heading">
                    {GROUP_LABELS[group]}
                    <span className="value">{items.length}</span>
                  </h3>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          className="review-item-button"
                          aria-current={
                            selectedId === item.id ? 'true' : undefined
                          }
                          onClick={() => {
                            if (selectedId === item.id && showDetail) {
                              heading.current?.focus();
                              return;
                            }
                            moveFocus.current = true;
                            setSelectedId(item.id);
                            setShowDetail(true);
                          }}
                        >
                          <span className="review-item-name">
                            {item.title}
                            <span className="text-meta text-muted font-normal">
                              {item.outcome}
                            </span>
                          </span>
                          <span className="review-item-reason">
                            {item.reason}
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
            {visible.length} of {batch.items.length} items shown
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
              {selected.title}
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
                ? `Details loaded for ${selected.title}.`
                : 'Loading item details.'}
          </p>
        </section>
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      <footer className="review-panel-footer">
        <span>
          <strong>Replay preview</strong> · Explore the recorded proposal and
          evidence.
        </span>
        <span>Approval and execution are not enabled. Nothing applied.</span>
      </footer>
    </div>
  );
}
