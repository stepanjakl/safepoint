'use client';

import { useCallback } from 'react';
import { reviewDetailSchema, type ReviewBatch } from '@/lib/review/contracts';
import { ReviewExperience } from './review-experience';

// The local replay host owns transport. The shared UI knows no URL or SKU.
export function ReplayReview({
  batch,
  initialItemId,
}: {
  batch: ReviewBatch;
  initialItemId?: string;
}) {
  const loadDetail = useCallback(
    async (id: string, signal: AbortSignal) => {
      const response = await fetch(
        `/api/replays/${encodeURIComponent(batch.id)}/items/${encodeURIComponent(id)}`,
        { signal },
      );
      if (!response.ok) throw new Error('Replay detail request failed');
      const data: unknown = await response.json();
      return reviewDetailSchema.parse(data);
    },
    [batch.id],
  );
  return (
    <ReviewExperience
      batch={batch}
      loadDetail={loadDetail}
      initialItemId={initialItemId}
    />
  );
}
