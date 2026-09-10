'use client';

import { useCallback } from 'react';
import type { ReleasePlan } from '@/lib/review/plan-contract';
import { planState } from '@/lib/review/plan-derivations';
import { galleryPlans, galleryDetail } from '@/lib/review/states-fixture';
import { ReviewExperience } from './review-experience';

function GalleryReview({ plan }: { plan: ReleasePlan }) {
  const loadDetail = useCallback(
    async (id: string) => galleryDetail(plan, id),
    [plan],
  );
  return <ReviewExperience plan={plan} loadDetail={loadDetail} />;
}

export function StatesGallery() {
  return (
    <div className="flex flex-col gap-10">
      {galleryPlans.map(([label, plan]) => (
        <section key={label} aria-label={label}>
          <p className="readout text-muted mb-2.5">
            {label} <span aria-hidden="true">·</span> {planState(plan)}
          </p>
          <GalleryReview plan={plan} />
        </section>
      ))}
    </div>
  );
}
