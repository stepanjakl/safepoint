'use client';

import { useId } from 'react';
// Deep import: Blode's barrel is the whole icon library.
import ChevronLeft from 'blode-icons-react/icons/chevron-left';
import {
  CLOSE_BUTTON,
  type AsideLayer,
} from '@/components/app-shell/drawer-aside';
import { Button } from '@/components/ui/button';
import { Glyph } from '@/components/ui/glyph';
import { cx } from '@/lib/cx';
import type { LoadReviewDetail } from '@/lib/review/contracts';
import {
  DISPOSITION_LABELS,
  severityRank,
  type Effect,
  type ReleasePlan,
} from '@/lib/review/plan-contract';
import { dispositionGlyph } from './markers';
import { ReviewItemDetail } from './review-item-detail';
import { useReviewDetail, type ReviewDetailCache } from './use-review-detail';

/*
  One item, as the review's second panel shows it: its bucket on a disc where
  an input shows its system, the subject as the title, and the evidence below.
  Each layer fetches for its own item, so the one fading out keeps what it
  showed while the next one loads.
*/
export function reviewItemLayer({
  plan,
  effect,
  failure,
  loadDetail,
  cache,
  onBack,
}: {
  plan: ReleasePlan;
  effect: Effect;
  failure: string | null;
  loadDetail: LoadReviewDetail;
  cache: ReviewDetailCache;
  // Back to the list, where this panel has taken its place.
  onBack: () => void;
}): AsideLayer {
  return {
    key: effect.id,
    eyebrow: DISPOSITION_LABELS[effect.disposition],
    title: effect.subject,
    announce: effect.subject,
    band: true,
    leading: (
      <>
        {/* Only where this panel hides the list: elsewhere the row that opened
            it closes it, and so does Escape. */}
        <button
          type="button"
          onClick={onBack}
          className={cx(CLOSE_BUTTON, 'lg:hidden')}
        >
          <ChevronLeft aria-hidden size={16} className="size-3.5 flex-none" />
          <span className="sr-only">All {plan.noun.other}</span>
        </button>
        <span
          aria-hidden="true"
          className="system-disc text-severity-ink pointer-events-none"
          data-severity={severityRank(effect.disposition)}
        >
          <Glyph name={dispositionGlyph[effect.disposition]} size={10} />
        </span>
      </>
    ),
    meta: (
      <>
        <span className="value">{effect.id}</span> · {effect.subtitle}
      </>
    ),
    body: (
      <ReviewItemBody
        plan={plan}
        itemId={effect.id}
        subject={effect.subject}
        failure={failure}
        loadDetail={loadDetail}
        cache={cache}
      />
    ),
  };
}

function ReviewItemBody({
  plan,
  itemId,
  subject,
  failure,
  loadDetail,
  cache,
}: {
  plan: ReleasePlan;
  itemId: string;
  subject: string;
  failure: string | null;
  loadDetail: LoadReviewDetail;
  cache: ReviewDetailCache;
}) {
  const id = useId();
  const { detail, failed, retry } = useReviewDetail(
    plan,
    itemId,
    loadDetail,
    cache,
  );
  return (
    // The detail's narrow rules answer to this panel's width.
    <div className="@container/review">
      {failure ? (
        <p className="text-state-blocked text-dense px-5 pt-5">
          <strong>Application failed</strong> · {failure}
        </p>
      ) : null}
      <div aria-busy={!detail && !failed}>
        {detail ? (
          <ReviewItemDetail detail={detail} idPrefix={`${id}-${detail.id}`} />
        ) : failed ? (
          <div className="text-dense p-5">
            <p>Details could not be loaded. Your selected item is unchanged.</p>
            <Button className="mt-4" onPress={retry}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="text-muted text-dense p-5">Loading item details…</p>
        )}
      </div>
      <p className="sr-only" role="status">
        {failed
          ? 'Item details could not be loaded. Try again is available.'
          : detail
            ? `Details loaded for ${subject}.`
            : 'Loading item details.'}
      </p>
    </div>
  );
}
