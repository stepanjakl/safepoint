'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DrawerAside,
  type AsideLayer,
} from '@/components/app-shell/drawer-aside';
import {
  DRAWER_ASIDE_WIDTH,
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import { useAsidePanel } from '@/components/app-shell/use-aside-panel';
import type { LoadReviewDetail } from '@/lib/review/contracts';
import type { Disposition, ReleasePlan } from '@/lib/review/plan-contract';
import type { ReviewProgress } from '@/lib/review/plan-derivations';
import {
  reviewEffects,
  type ReviewFilter,
} from '@/lib/review/review-navigation';
import { ReleaseCard } from './release-card';
import { reviewItemLayer } from './review-item-aside';
import { ReviewQueue } from './review-queue';
import { useReviewDetailCache } from './use-review-detail';

/*
  A request to open the review from outside the card -- a flag in the run's
  thread, say. `key` changes with every request, so asking twice for the same
  line opens it twice.
*/
export type ReviewOpenRequest = {
  key: number;
  filter: Disposition | 'all';
  itemId?: string;
};

// One opening of the review: where it starts. Kept after the overlay closes so
// the panels leave with what they held. No filter means none was asked for,
// and the review goes back to the one last used on this plan.
type Opening = { key: number; filter?: ReviewFilter; itemId?: string };

// The filter last used on a plan, per browser. A convenience only: storage can
// be missing or refuse, and the review then opens on "All".
const filterKey = (plan: ReleasePlan) =>
  `safepoint:review-filter:${plan.id}:${plan.revision}`;
function rememberedFilter(plan: ReleasePlan): ReviewFilter | null {
  try {
    const value = localStorage.getItem(filterKey(plan));
    return value && reviewEffects(plan, value as ReviewFilter).length
      ? (value as ReviewFilter)
      : null;
  } catch {
    return null;
  }
}
function rememberFilter(plan: ReleasePlan, filter: ReviewFilter) {
  try {
    localStorage.setItem(filterKey(plan), filter);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

export function ReviewExperience({
  plan,
  progress,
  loadDetail,
  initialItemId,
  onCommit,
  openRequest,
}: {
  plan: ReleasePlan;
  progress?: ReviewProgress;
  loadDetail: LoadReviewDetail;
  initialItemId?: string;
  onCommit?: () => void;
  openRequest?: ReviewOpenRequest | null;
}) {
  // A row opens the review at its own item; a button or a bucket's overflow
  // opens the list alone. Both are the same operation, so the opener carries
  // the narrowest starting point it was given.
  const [opening, setOpening] = useState<Opening | null>(null);
  const [isOpen, setOpen] = useState(false);
  const open = (filter?: ReviewFilter, itemId?: string) => {
    setOpening({ key: (opening?.key ?? 0) + 1, filter, itemId });
    setOpen(true);
  };
  const [answered, setAnswered] = useState(openRequest?.key);
  if (openRequest && openRequest.key !== answered) {
    setAnswered(openRequest.key);
    open(openRequest.filter, openRequest.itemId);
  }
  // Details already fetched outlive an opening: coming back to an item does
  // not fetch it again.
  const cache = useReviewDetailCache();
  // Items opened in this visit, so both lists can set what is left to look at
  // in the heavier weight. Not a decision: nothing is recorded by opening.
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const markSeen = useCallback(
    (id: string) =>
      setSeen((was) => (was.has(id) ? was : new Set(was).add(id))),
    [],
  );

  return (
    <>
      <ReleaseCard
        plan={plan}
        progress={progress}
        onCommit={onCommit}
        seen={seen}
        onOpen={(disposition, itemId) => open(disposition, itemId)}
      />
      {opening ? (
        <DrawerOverlay isOpen={isOpen} onOpenChange={setOpen}>
          <ReviewSession
            key={JSON.stringify([opening.key, plan.id, plan.revision])}
            plan={plan}
            loadDetail={loadDetail}
            cache={cache}
            seen={seen}
            onSeen={markSeen}
            initialFilter={opening.filter}
            // The row the reader actually clicked wins over the deep link
            // that brought them to the page; a plain opening takes the link.
            initialItemId={opening.itemId ?? initialItemId}
          />
        </DrawerOverlay>
      ) : null}
    </>
  );
}

/*
  The two panels for one opening: the queue on the right, and the item it
  opened beside it. The queue's rows open and close the item; Escape closes
  the item before the review, and the scrim closes both.
*/
function ReviewSession({
  plan,
  loadDetail,
  cache,
  seen,
  onSeen,
  initialFilter,
  initialItemId,
}: {
  plan: ReleasePlan;
  loadDetail: LoadReviewDetail;
  cache: ReturnType<typeof useReviewDetailCache>;
  seen: ReadonlySet<string>;
  onSeen: (id: string) => void;
  initialFilter?: ReviewFilter;
  initialItemId?: string;
}) {
  // Asked for, or else the one last used -- unless that one leaves out the
  // item named on the way in.
  const [filter, setFilter] = useState<ReviewFilter>(() => {
    if (initialFilter) return initialFilter;
    const last = rememberedFilter(plan);
    return last &&
      (!initialItemId ||
        reviewEffects(plan, last).some((effect) => effect.id === initialItemId))
      ? last
      : 'all';
  });
  const visible = reviewEffects(plan, filter);
  // An item named on the way in opens beside the list, if it is in it.
  const [start] = useState(() =>
    visible.some((effect) => effect.id === initialItemId)
      ? initialItemId!
      : null,
  );
  // The item the pager last moved to, so the list can show its page without
  // opening it.
  const [anchor, setAnchor] = useState<string | null>(start);
  const {
    aside,
    exiting,
    leaving,
    direction,
    openAside,
    closeAside,
    finishExit,
    onKeyDownCapture,
    settleLeaving,
  } = useAsidePanel<string>({
    initial: start,
    viewKey: (id) => id,
    // Where an item sits in the list it was chosen from, so moving to one
    // further down rises and one further up falls.
    place: (id) => visible.findIndex((effect) => effect.id === id),
    scope: '.review-queue',
  });
  const failures = new Map(
    plan.status.kind === 'partially_applied'
      ? plan.status.failures.map((failure) => [
          failure.effectId,
          failure.reason,
        ])
      : [],
  );

  const layer = (id: string | null): AsideLayer | null => {
    const effect = id ? plan.effects.find((entry) => entry.id === id) : null;
    return effect
      ? reviewItemLayer({
          plan,
          effect,
          failure: failures.get(effect.id) ?? null,
          loadDetail,
          cache,
          onBack: () => closeAside(),
        })
      : null;
  };
  // Whatever the item panel shows has been seen, however it was opened.
  useEffect(() => {
    if (aside) onSeen(aside);
  }, [aside, onSeen]);
  const current = layer(aside);
  const leavingLayer = leaving && leaving !== aside ? layer(leaving) : null;
  const openId = exiting ? null : aside;

  return (
    <DrawerPanels
      title="Release review"
      closeLabel="Close review"
      className="review-queue"
      onKeyDownCapture={onKeyDownCapture}
      aside={
        current ? (
          <DrawerAside
            current={current}
            leaving={leavingLayer}
            direction={direction}
            exiting={exiting}
            onExited={finishExit}
            onLeft={settleLeaving}
            className={DRAWER_ASIDE_WIDTH}
          />
        ) : null
      }
    >
      <ReviewQueue
        plan={plan}
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next);
          rememberFilter(plan, next);
          // The item belongs to the list it was opened from; a filter that
          // leaves it out takes it with it.
          if (
            openId &&
            !reviewEffects(plan, next).some((effect) => effect.id === openId)
          )
            closeAside();
        }}
        openId={openId}
        seen={seen}
        onOpen={(id) => {
          setAnchor(id);
          openAside(id);
        }}
        anchorId={anchor}
        onPage={setAnchor}
      />
    </DrawerPanels>
  );
}
