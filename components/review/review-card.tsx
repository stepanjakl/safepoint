'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  countReviewGroups,
  type ReviewBatch,
  type ReviewGroup,
} from '@/lib/review/contracts';

export function ReviewCard({
  batch,
  onOpen,
}: {
  batch: ReviewBatch;
  onOpen: (group?: ReviewGroup) => void;
}) {
  const id = useId();
  const counts = countReviewGroups(batch.items);
  const leadingItem = batch.items.find(
    (item) => item.id === batch.initialItemId,
  );

  return (
    <article className="review-card" aria-labelledby={id}>
      <header className="review-card-heading">
        <span className="review-brand">
          <span aria-hidden="true" className="review-brand-mark">
            s.
          </span>{' '}
          Safepoint
        </span>
        <span className="text-meta text-muted">
          {batch.processLabel} <span aria-hidden="true">/</span> Replay
        </span>
      </header>
      <div className="review-card-body">
        <p className="text-meta text-muted mb-2">
          {batch.items.length} items evaluated
        </p>
        <h2 id={id} className="review-card-title">
          {batch.title}
        </h2>
        <p className="text-muted mt-2">
          {counts.blocked > 0
            ? 'A few items need a closer look before this can proceed.'
            : 'The proposed changes are ready for a closer look.'}
        </p>
        <dl className="review-counts">
          <div>
            <dt>Ready for review</dt>
            <dd>{counts.ready}</dd>
          </div>
          <div>
            <dt>Need attention</dt>
            <dd>{counts.attention}</dd>
          </div>
          <div>
            <dt>Cannot proceed</dt>
            <dd>{counts.blocked}</dd>
          </div>
        </dl>
        {leadingItem && leadingItem.group !== 'ready' ? (
          <p className="review-card-finding">
            <span aria-hidden="true" className="text-state-caution">
              !
            </span>
            <span>
              <strong>{leadingItem.title}.</strong> {leadingItem.reason}.
            </span>
          </p>
        ) : null}
        <div className="review-card-actions">
          <Button variant="primary" onPress={() => onOpen()}>
            {batch.reviewLabel}
            <span aria-hidden="true">↗</span>
          </Button>
          <button
            className="review-text-button"
            onClick={() => onOpen('blocked')}
            disabled={counts.blocked === 0}
          >
            View {counts.blocked} unable to proceed
          </button>
        </div>
      </div>
      <footer className="review-card-footer">
        <span>All {batch.items.length} items accounted for</span>
        <span>Nothing applied</span>
      </footer>
    </article>
  );
}
