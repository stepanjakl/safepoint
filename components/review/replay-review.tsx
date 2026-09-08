'use client';

import { useCallback } from 'react';
import { reviewDetailSchema } from '@/lib/review/contracts';
import type { ReleasePlan } from '@/lib/review/plan-contract';
import { ReviewExperience } from './review-experience';

// The local replay host owns transport. The shared UI knows no URL or SKU.
export function ReplayReview({
  plan,
  initialItemId,
}: {
  plan: ReleasePlan;
  initialItemId?: string;
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
      loadDetail={loadDetail}
      initialItemId={initialItemId}
    />
  );
}
