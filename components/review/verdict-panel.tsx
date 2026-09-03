import { Button } from '@/components/ui/button';
import { Glyph } from '@/components/ui/glyph';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { SectionBand } from '@/components/ui/section-band';
import type { LineDetail } from '@/lib/review-presentation';

import { eligibilityMarker, toneText } from './markers';

/*
  The disagreement, first. Agent judgement on the left stays neutral; the
  deterministic policy result on the right carries the strong rule and the
  semantic colour. The ledger beneath aligns threshold, basis, findings,
  next action and reviewer consequence.
*/
export function VerdictPanel({
  detail,
  headingId,
}: {
  detail: LineDetail;
  headingId: string;
}) {
  const { agent, policy, margin } = detail;
  const eligibility = eligibilityMarker[policy.eligibility];

  return (
    <section aria-labelledby={headingId}>
      <SectionBand
        id={headingId}
        title="Verdict"
        meta="Recorded judgement · deterministic policy"
      />

      <div className="grid @xl:grid-cols-2">
        <div className="border-rule-default border-b px-4 py-3 @xl:border-r @xl:border-b-0">
          <p className="readout text-muted">Agent recommendation</p>
          <p className="text-title mt-1 font-semibold">
            {agent.recommendationLabel}
          </p>
          <p className="text-dense text-muted mt-1.5">{agent.rationale}</p>
          {agent.uncertainties.length > 0 ? (
            <ul className="text-meta text-muted mt-1.5">
              {agent.uncertainties.map((item) => (
                <li key={item}>Uncertainty noted: {item}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="px-4 py-3">
          <p className="readout text-muted">Policy result</p>
          <p
            className={`text-title mt-1 flex items-center gap-2 font-semibold ${toneText[eligibility.tone]}`}
          >
            <Glyph name={eligibility.glyph} size={14} />
            {policy.eligibilityLabel}
          </p>
          <p className="text-dense mt-1.5">{policy.summary}</p>
        </div>
      </div>

      <Ledger className="border-rule-default border-t">
        {margin ? (
          <>
            <LedgerRow label="Projected margin">
              <MarginScale margin={margin} />
            </LedgerRow>
            <LedgerRow label="Basis">
              <span className="value">{margin.basis}</span>{' '}
              <span className="readout text-muted">derived display value</span>
            </LedgerRow>
          </>
        ) : null}

        {detail.noProposalReason ? (
          <LedgerRow label="Planned change">
            {detail.noProposalReason}
          </LedgerRow>
        ) : null}

        <LedgerRow label="Policy findings">
          {policy.findings.length === 0 ? (
            <span className="text-muted">None</span>
          ) : (
            <ul className="space-y-1.5">
              {policy.findings.map((finding) => (
                <li key={finding.id}>
                  <span className="font-medium">{finding.title}</span>
                  <span className="readout text-muted ml-2">
                    {finding.consequence === 'block'
                      ? 'blocks approval'
                      : finding.consequence === 'individual_approval'
                        ? 'individual approval'
                        : finding.severity}
                  </span>
                  <span className="text-dense block">
                    {finding.explanation}
                  </span>
                  <span className="value text-meta text-muted block">
                    {finding.evidence
                      .map((e) => `${e.sourceLabel} · ${e.observedAtLabel}`)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </LedgerRow>
        <LedgerRow label="Next action">{policy.nextAction}</LedgerRow>
        <LedgerRow label="Reviewer consequence">
          <span className="font-medium">{policy.reviewerConsequence}</span>
        </LedgerRow>
      </Ledger>

      <div className="border-rule-default flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3">
        <Button variant="primary" isDisabled>
          Approve item
        </Button>
        <Button isDisabled>Hold</Button>
        <Button isDisabled>Reject</Button>
        <p className="text-meta text-muted min-w-48 flex-1">
          {detail.actionNote}
        </p>
      </div>
    </section>
  );
}

function MarginScale({
  margin,
}: {
  margin: NonNullable<LineDetail['margin']>;
}) {
  // The scale spans 0–30% so the 15% floor sits at the midpoint.
  const scaleMax = 30;
  const fill = Math.min(100, (margin.projectedPercent / scaleMax) * 100);
  const floor = Math.min(100, (margin.floorPercent / scaleMax) * 100);
  const tone = margin.meetsFloor ? 'verified' : 'blocked';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className={`value text-counter ${toneText[tone]}`}>
        {margin.projectedLabel}
      </span>
      <div
        role="img"
        aria-label={`Projected margin ${margin.projectedLabel}, policy minimum ${margin.floorLabel}`}
        className="border-rule-default bg-surface-inset relative h-2 w-48 max-w-full border"
      >
        <span
          className={`absolute inset-y-0 left-0 ${margin.meetsFloor ? 'bg-state-verified' : 'bg-state-blocked'}`}
          style={{ width: `${fill}%` }}
        />
        <span
          className="bg-rule-strong absolute -top-1 -bottom-1 w-px"
          style={{ left: `${floor}%` }}
        />
      </div>
      <span className="readout text-muted">
        Policy minimum {margin.floorLabel}
      </span>
    </div>
  );
}
