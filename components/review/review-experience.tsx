'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LoadReviewDetail } from '@/lib/review/contracts';
import type { Disposition, ReleasePlan } from '@/lib/review/plan-contract';
import { severityRank } from '@/lib/review/plan-contract';
import { Button } from '@/components/ui/button';
import { ReleaseCard } from './release-card';
import { ReviewPanel } from './review-panel';

export function ReviewExperience({
  plan,
  loadDetail,
  initialItemId,
}: {
  plan: ReleasePlan;
  loadDetail: LoadReviewDetail;
  initialItemId?: string;
}) {
  const [open, setOpen] = useState<{ filter: Disposition | 'all' } | null>(
    null,
  );
  return (
    <>
      <ReleaseCard
        plan={plan}
        onOpen={(disposition) => setOpen({ filter: disposition ?? 'all' })}
      />
      {open ? (
        <ReviewDialog
          plan={plan}
          loadDetail={loadDetail}
          initialItemId={initialItemId}
          filter={open.filter}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function ReviewDialog({
  plan,
  loadDetail,
  initialItemId,
  filter,
  onClose,
}: {
  plan: ReleasePlan;
  loadDetail: LoadReviewDetail;
  initialItemId?: string;
  filter: Disposition | 'all';
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

  // Lead with the most severe effect unless the host named one.
  const leading = [...plan.effects].sort(
    (a, b) => severityRank(a.disposition) - severityRank(b.disposition),
  )[0];
  const withinFilter = plan.effects.filter(
    (effect) => filter === 'all' || effect.disposition === filter,
  );
  const selected =
    withinFilter.find((effect) => effect.id === initialItemId)?.id ??
    withinFilter[0]?.id ??
    initialItemId ??
    leading?.id;

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
            Safepoint <span aria-hidden="true">/</span> {plan.source}
          </p>
          <h2 id={id} tabIndex={-1} ref={heading}>
            {plan.title}
          </h2>
        </div>
        <Button onPress={() => ref.current?.close()} aria-label="Close review">
          Close <span aria-hidden="true">×</span>
        </Button>
      </header>
      <ReviewPanel
        plan={plan}
        loadDetail={loadDetail}
        initialItemId={selected}
        initialFilter={filter}
      />
    </dialog>
  );
}
