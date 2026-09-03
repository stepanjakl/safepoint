import Link from 'next/link';
import type { RefObject } from 'react';

import { Glyph } from '@/components/ui/glyph';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { SectionBand } from '@/components/ui/section-band';
import type { LineDetail as LineDetailData } from '@/lib/review-presentation';

import { EffectsRail } from './effects-rail';
import { EvidenceSection } from './evidence-section';
import { eligibilityMarker, outcomeMarker, toneText } from './markers';
import { ReadinessMatrix } from './readiness-matrix';
import { VerdictPanel } from './verdict-panel';

/*
  The selected line, top to bottom: identity, verdict, values, effects,
  readiness, evidence. Everything above the rail is visible without
  interaction.
*/
export function LineDetail({
  detail,
  headingId,
  headingRef,
  idPrefix,
}: {
  detail: LineDetailData;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  idPrefix: string;
}) {
  const outcome = outcomeMarker[detail.outcome];
  const eligibility = eligibilityMarker[detail.policy.eligibility];

  return (
    <article className="@container">
      <div className="border-rule-strong border-b px-4 py-3">
        <Link
          href="/"
          scroll={false}
          className="text-meta text-muted mb-2 inline-flex min-h-6 items-center gap-1 underline-offset-4 hover:underline @3xl:hidden"
        >
          <span aria-hidden="true">←</span> Back to candidates
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="text-title focus-visible:outline-focus font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid"
            >
              {detail.name}{' '}
              <span className="text-muted font-normal">{detail.unit}</span>
            </h2>
            <p className="value text-meta text-muted mt-0.5">
              {detail.sku} · {detail.categoryLabel} · {detail.supplierLabel}
            </p>
          </div>
          <dl className="flex gap-6">
            <div>
              <dt className="readout text-muted">Policy</dt>
              <dd
                className={`text-dense mt-0.5 flex items-center gap-1.5 font-medium ${toneText[eligibility.tone]}`}
              >
                <Glyph name={eligibility.glyph} />
                {detail.policy.eligibilityLabel}
              </dd>
            </div>
            <div>
              <dt className="readout text-muted">Outcome</dt>
              <dd
                className={`text-dense mt-0.5 flex items-center gap-1.5 font-medium ${toneText[outcome.tone]}`}
              >
                <Glyph name={outcome.glyph} />
                {detail.outcomeLabel}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="divide-rule-strong divide-y">
        <VerdictPanel detail={detail} headingId={`${idPrefix}-verdict`} />

        {detail.values ? (
          <section aria-labelledby={`${idPrefix}-values`}>
            <SectionBand
              id={`${idPrefix}-values`}
              title="Values"
              meta="Current → proposed"
            />
            <Ledger>
              {detail.values.map((row) => (
                <LedgerRow key={row.label} label={row.label}>
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    {row.current ? (
                      <>
                        <span className="value text-muted">{row.current}</span>
                        <span aria-hidden="true" className="text-muted">
                          →
                        </span>
                        <span className="sr-only">to</span>
                      </>
                    ) : null}
                    <span className="value">{row.proposed}</span>
                  </span>
                  {row.note ? (
                    <span className="text-meta text-muted block">
                      {row.note}
                    </span>
                  ) : null}
                </LedgerRow>
              ))}
            </Ledger>
          </section>
        ) : null}

        {detail.effects ? (
          <EffectsRail
            effects={detail.effects}
            headingId={`${idPrefix}-effects`}
          />
        ) : null}

        <ReadinessMatrix
          gates={detail.gates}
          summary={detail.gateSummary}
          headingId={`${idPrefix}-readiness`}
        />

        <EvidenceSection
          evidence={detail.evidence}
          headingId={`${idPrefix}-evidence`}
        />
      </div>
    </article>
  );
}
