'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type {
  LoadReviewDetail,
  ReviewBatch,
  ReviewGroup,
} from '@/lib/review/contracts';
import { Button } from '@/components/ui/button';
import { ReviewCard } from './review-card';
import { ReviewPanel } from './review-panel';

export function ReviewExperience({
  batch,
  loadDetail,
  initialItemId,
}: {
  batch: ReviewBatch;
  loadDetail: LoadReviewDetail;
  initialItemId?: string;
}) {
  const [open, setOpen] = useState<{ group: ReviewGroup | 'all' } | null>(null);
  return (
    <>
      <ReviewCard
        batch={batch}
        onOpen={(group) => setOpen({ group: group ?? 'all' })}
      />
      {open ? (
        <ReviewDialog
          batch={batch}
          loadDetail={loadDetail}
          initialItemId={initialItemId}
          group={open.group}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function ReviewDialog({
  batch,
  loadDetail,
  initialItemId,
  group,
  onClose,
}: {
  batch: ReviewBatch;
  loadDetail: LoadReviewDetail;
  initialItemId?: string;
  group: ReviewGroup | 'all';
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    const invoker = document.activeElement;
    dialog?.showModal();
    heading.current?.focus();
    return () => {
      if (invoker instanceof HTMLElement && invoker.isConnected)
        invoker.focus();
    };
  }, []);

  const selected =
    group === 'all'
      ? (initialItemId ?? batch.initialItemId)
      : (batch.items.find(
          (item) => item.id === batch.initialItemId && item.group === group,
        )?.id ??
        batch.items.find((item) => item.group === group)?.id ??
        batch.initialItemId);

  return (
    <dialog
      ref={ref}
      className="review-dialog"
      aria-labelledby={id}
      onClose={onClose}
    >
      <header className="review-dialog-heading">
        <div>
          <p className="text-meta text-muted mb-1">
            Safepoint <span aria-hidden="true">/</span> {batch.processLabel}{' '}
            <span aria-hidden="true">/</span> Replay
          </p>
          <h2 id={id} tabIndex={-1} ref={heading}>
            {batch.title}
          </h2>
        </div>
        <Button onPress={() => ref.current?.close()} aria-label="Close review">
          Close <span aria-hidden="true">×</span>
        </Button>
      </header>
      <ReviewPanel
        batch={batch}
        loadDetail={loadDetail}
        initialItemId={selected}
        initialGroup={group}
      />
    </dialog>
  );
}
