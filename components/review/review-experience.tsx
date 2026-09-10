'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LoadReviewDetail } from '@/lib/review/contracts';
import type { Disposition, ReleasePlan } from '@/lib/review/plan-contract';
import { reviewEffects, initialReviewId } from '@/lib/review/review-navigation';
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
  // A row opens the modal at its own item; a tab's overflow link opens the
  // bucket. Both are the same operation, so the opener carries the narrowest
  // starting point it was given and the dialog decides what to do with it.
  const [open, setOpen] = useState<{
    filter: Disposition | 'all';
    itemId?: string;
  } | null>(null);
  return (
    <>
      <ReleaseCard
        plan={plan}
        onOpen={(disposition, itemId) =>
          setOpen({ filter: disposition ?? 'all', itemId })
        }
      />
      {open ? (
        <ReviewDialog
          plan={plan}
          loadDetail={loadDetail}
          // The row the reader actually clicked wins over the deep link that
          // brought them to the page.
          initialItemId={open.itemId ?? initialItemId}
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

  const selected = initialReviewId(reviewEffects(plan, filter), initialItemId);

  return (
    // `review-dialog` stays as a hook for the ::backdrop rule, which has no
    // markup of its own. Everything else about the dialog is here.
    <dialog
      ref={ref}
      className="review-dialog text-primary bg-surface-primary border-rule-strong rounded-shell m-auto h-[min(820px,calc(100dvh-64px))] max-h-none w-[min(1120px,calc(100%-64px))] max-w-none overflow-hidden border p-0 open:flex open:flex-col max-sm:h-dvh max-sm:w-full max-sm:rounded-none max-sm:border-0"
      aria-labelledby={id}
      onClose={onClose}
    >
      <header className="border-rule-default flex shrink-0 items-center justify-between gap-5 border-b px-6 py-5 max-sm:gap-3 max-sm:px-5 max-sm:py-4 [&>button]:min-h-11 [&>button]:shrink-0">
        <div>
          <p className="text-meta text-muted mb-1">
            Safepoint <span aria-hidden="true">/</span> {plan.source}
          </p>
          <h2
            id={id}
            tabIndex={-1}
            ref={heading}
            className="text-display max-sm:text-title [font-weight:550]"
          >
            {plan.title}
          </h2>
        </div>
        <Button onPress={() => ref.current?.close()} aria-label="Close review">
          Close <span aria-hidden="true">×</span>
        </Button>
      </header>
      <ReviewPanel
        key={JSON.stringify([plan.id, plan.revision])}
        plan={plan}
        loadDetail={loadDetail}
        initialItemId={selected}
        initialFilter={filter}
      />
    </dialog>
  );
}
