'use client';

import { useEffect, useState } from 'react';
import type { LoadReviewDetail, ReviewDetail } from '@/lib/review/contracts';
import type { ReleasePlan } from '@/lib/review/plan-contract';

type DetailState =
  | { kind: 'loaded'; detail: ReviewDetail }
  | { kind: 'error'; id: string }
  | { kind: 'loading' };

// Details already fetched, by plan, revision and item. One per review, shared
// by every panel that shows an item, so going back to one does not refetch.
export type ReviewDetailCache = Map<string, ReviewDetail>;

export function useReviewDetailCache() {
  const [cache] = useState<ReviewDetailCache>(() => new Map());
  return cache;
}

/**
 * The evidence behind one item, fetched once per plan revision. A detail that
 * answers for another item or another revision is refused rather than shown
 * under the wrong heading.
 */
export function useReviewDetail(
  plan: ReleasePlan,
  itemId: string | null,
  loadDetail: LoadReviewDetail,
  cache: ReviewDetailCache,
) {
  const [state, setState] = useState<DetailState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!itemId) return;
    const controller = new AbortController();
    const key = `${plan.id}:${plan.revision}:${itemId}`;
    const cached = cache.get(key);
    const pending = cached
      ? Promise.resolve(cached)
      : loadDetail(itemId, controller.signal);
    pending
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (detail.id !== itemId || detail.revision !== plan.revision)
          throw new Error('Review identity or revision changed');
        cache.set(key, detail);
        setState({ kind: 'loaded', detail });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error', id: itemId });
      });
    return () => controller.abort();
  }, [plan.id, plan.revision, itemId, loadDetail, cache, attempt]);

  const detail =
    state.kind === 'loaded' &&
    state.detail.id === itemId &&
    state.detail.revision === plan.revision
      ? state.detail
      : null;
  return {
    detail,
    failed: state.kind === 'error' && state.id === itemId,
    retry: () => {
      setState({ kind: 'loading' });
      setAttempt((value) => value + 1);
    },
  };
}
