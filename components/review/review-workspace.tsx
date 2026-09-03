'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import type { Sku } from '@/lib/promotion-release';
import {
  parseSkuParam,
  type ReviewPresentation,
} from '@/lib/review-presentation';
import { cx } from '@/lib/cx';

import { AppHeader } from './app-header';
import { BatchStrip } from './batch-strip';
import { CandidateList } from './candidate-list';
import { LineDetail } from './line-detail';
import { ReviewerSummary } from './reviewer-summary';

/*
  The only client state is the selected SKU, and it lives in the URL.
  Wide layouts replace the history entry so arrow keys do not pollute Back.
  Narrow layouts push an entry, so the detail view is a page the reviewer can
  leave with browser Back.
*/
export function ReviewWorkspace({
  presentation,
  initialSku,
  mainId,
  className,
}: {
  presentation: ReviewPresentation;
  initialSku: Sku;
  mainId?: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const skuParam = parseSkuParam(searchParams.get('sku'));
  // Remembers the last selection so the row stays highlighted after
  // browser Back removes the parameter on a narrow layout.
  const [lastSelected, setLastSelected] = useState<Sku>(initialSku);
  const selectedSku = skuParam ?? lastSelected;
  const hasParam = skuParam !== null;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingAfterRender = useRef(false);
  const id = useId();
  const ids = {
    batchHeading: `${id}-batch`,
    candidatesHeading: `${id}-candidates`,
    listHint: `${id}-hint`,
    detail: `${id}-detail`,
    lineHeading: `${id}-line`,
    progress: `${id}-progress`,
  };

  // The selection lands one render before the parameter reaches
  // useSearchParams(), so the detail pane is still hidden at that point and
  // focusing its heading would be dropped. Wait for the view to switch.
  useEffect(() => {
    if (focusHeadingAfterRender.current && hasParam) {
      focusHeadingAfterRender.current = false;
      headingRef.current?.focus();
    }
  }, [selectedSku, hasParam]);

  function select(sku: Sku) {
    if (sku === selectedSku && hasParam) return;
    setLastSelected(sku);
    const url = `?sku=${sku}`;
    if (isNarrowLayout()) {
      focusHeadingAfterRender.current = true;
      window.history.pushState(null, '', url);
    } else {
      window.history.replaceState(null, '', url);
    }
  }

  const rowsBySku = Object.fromEntries(
    presentation.candidates.map((row) => [row.sku, row]),
  ) as Record<Sku, ReviewPresentation['candidates'][number]>;

  return (
    <div
      className={cx(
        'workspace bg-canvas @container/workspace flex flex-col',
        className,
      )}
      data-view={hasParam ? 'detail' : 'list'}
    >
      <AppHeader batch={presentation.batch} headingId={ids.batchHeading} />

      <main id={mainId} className="flex flex-1 flex-col">
        <BatchStrip batch={presentation.batch} />

        <div className="grid flex-1 @3xl:grid-cols-[22rem_minmax(0,1fr)]">
          <section
            aria-labelledby={ids.candidatesHeading}
            className="pane-list border-rule-strong bg-surface-primary @3xl:sticky @3xl:top-0 @3xl:max-h-dvh @3xl:overflow-y-auto @3xl:border-r"
          >
            <div className="border-rule-default bg-surface-inset flex min-h-8 items-center justify-between border-b px-4 py-1.5">
              <h2 id={ids.candidatesHeading} className="readout text-muted">
                Candidates
              </h2>
              <span className="readout text-muted">
                {presentation.candidates.length} of{' '}
                {presentation.batch.counts.evaluated} shown
              </span>
            </div>
            <p id={ids.listHint} className="sr-only">
              Use the up and down arrow keys to move between candidates. The
              line detail after this list updates to the selected candidate.
            </p>
            <CandidateList
              categories={presentation.categories}
              rowsBySku={rowsBySku}
              selectedSku={selectedSku}
              onSelect={select}
              describedBy={ids.listHint}
            />
          </section>

          <section
            id={ids.detail}
            aria-labelledby={ids.lineHeading}
            className="pane-detail bg-surface-primary min-w-0"
          >
            <LineDetail
              detail={presentation.details[selectedSku]}
              headingId={ids.lineHeading}
              headingRef={headingRef}
              idPrefix={ids.detail}
            />
          </section>
        </div>

        <ReviewerSummary
          reviewer={presentation.batch.reviewer}
          headingId={ids.progress}
        />
      </main>
    </div>
  );
}

// Narrow means the list and detail cannot be shown together. This mirrors
// the container breakpoint in globals.css for the product page, where the
// workspace spans the viewport.
function isNarrowLayout(): boolean {
  return window.matchMedia('(max-width: 47.99rem)').matches;
}
