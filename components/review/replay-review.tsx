'use client';

import { useCallback } from 'react';
import { reviewDetailSchema } from '@/lib/review/contracts';
import type { ReleasePlan } from '@/lib/review/plan-contract';
import type { ReviewProgress } from '@/lib/review/plan-derivations';
import { ReviewExperience, type ReviewOpenRequest } from './review-experience';

// The local replay host owns transport. The shared UI knows no URL or SKU.
export function ReplayReview({
  plan,
  progress,
  initialItemId,
  onCommit,
  openRequest,
}: {
  plan: ReleasePlan;
  progress?: ReviewProgress;
  initialItemId?: string;
  onCommit?: () => void;
  openRequest?: ReviewOpenRequest | null;
}) {
  const loadDetail = useCallback(
    async (id: string, signal: AbortSignal) => {
      const response = await fetch(
        `/api/replays/${encodeURIComponent(plan.id)}/items/${encodeURIComponent(id)}`,
        { signal },
      );
      if (!response.ok) throw new Error('Replay detail request failed');
      const data: unknown = await response.json();
      return reviewDetailSchema.parse(data);
    },
    [plan.id],
  );
  return (
    <ReviewExperience
      plan={plan}
      progress={progress}
      loadDetail={loadDetail}
      initialItemId={initialItemId}
      onCommit={onCommit}
      openRequest={openRequest}
    />
  );
}
