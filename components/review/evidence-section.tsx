import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { SectionBand } from '@/components/ui/section-band';
import type { LineDetail } from '@/lib/review-presentation';

/*
  Narrative excerpt, agent interpretation, source fact and policy
  consequence as four labelled rows, so interpretation is never mistaken for
  fact. Full source records are one closed disclosure with provenance.
*/
export function EvidenceSection({
  evidence,
  headingId,
}: {
  evidence: LineDetail['evidence'];
  headingId: string;
}) {
  return (
    <section aria-labelledby={headingId}>
      <SectionBand
        id={headingId}
        title="Evidence and provenance"
        meta={`${evidence.sources.length} source records`}
      />
      <Ledger>
        {evidence.note ? (
          <LedgerRow
            label={
              <>
                Narrative note
                <span className="readout text-state-caution block">
                  untrusted evidence
                </span>
              </>
            }
          >
            <blockquote className="text-dense">
              “{evidence.note.text}”
            </blockquote>
            <p className="value text-meta text-muted mt-1">
              {evidence.note.sourceLabel} · {evidence.note.observedAtLabel}
            </p>
          </LedgerRow>
        ) : null}
        <LedgerRow label="Agent interpretation">
          {evidence.agentInterpretation}
        </LedgerRow>
        <LedgerRow label="Source fact">
          <span className="value">{evidence.sourceFact}</span>
        </LedgerRow>
        <LedgerRow label="Policy consequence">
          {evidence.policyConsequence}
        </LedgerRow>
      </Ledger>
      <details className="border-rule-default border-t">
        <summary className="readout text-muted focus-visible:outline-focus flex min-h-10 list-none items-center gap-2 px-4 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true">›</span>
          Source records ({evidence.sources.length})
        </summary>
        <ul className="divide-rule-faint border-rule-faint divide-y border-t">
          {evidence.sources.map((source) => (
            <li
              key={source.id}
              className="grid gap-x-4 gap-y-1 px-4 py-2 @md:grid-cols-[9rem_minmax(0,1fr)]"
            >
              <div>
                <p className="text-meta font-medium">{source.sourceLabel}</p>
                <p className="value text-meta text-muted">
                  {source.observedAtLabel}
                </p>
                <p className="value text-meta text-muted">{source.id}</p>
              </div>
              <ul className="text-dense">
                {source.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
