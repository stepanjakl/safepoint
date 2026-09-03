import { Glyph } from '@/components/ui/glyph';
import { SectionBand } from '@/components/ui/section-band';
import type { PresentedGate } from '@/lib/review-presentation';

import { gateMarker, toneText } from './markers';

/*
  Seven compact disclosure rows. Failed, not-checked and evidence-unavailable
  gates open by default; passed and not-applicable gates stay closed.
*/
export function ReadinessMatrix({
  gates,
  summary,
  headingId,
}: {
  gates: PresentedGate[];
  summary: string;
  headingId: string;
}) {
  return (
    <section aria-labelledby={headingId}>
      <SectionBand id={headingId} title="Readiness" meta={summary} />
      <div className="divide-rule-faint divide-y">
        {gates.map((gate) => {
          const marker = gateMarker[gate.result];
          return (
            <details
              key={gate.gate}
              open={gate.openByDefault}
              className="group"
            >
              <summary className="focus-visible:outline-focus flex min-h-10 list-none items-center gap-3 px-4 py-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid [&::-webkit-details-marker]:hidden">
                <span
                  className={`flex w-3 shrink-0 justify-center ${toneText[marker.tone]}`}
                >
                  <Glyph name={marker.glyph} />
                </span>
                <span className="text-dense w-32 shrink-0 font-medium">
                  {gate.label}
                </span>
                <span className={`text-dense ${toneText[marker.tone]}`}>
                  {gate.resultLabel}
                </span>
                <span className="readout text-muted ml-auto">
                  {gate.obligationLabel}
                </span>
                <span
                  aria-hidden="true"
                  className="text-muted transition-transform duration-150 group-open:rotate-90"
                >
                  ›
                </span>
              </summary>
              <div className="text-dense px-4 pb-3 pl-10">
                <p>{gate.explanation}</p>
                <p className="text-meta text-muted mt-1">
                  {gate.obligationReason}
                </p>
                <p className="value text-meta text-muted mt-1">
                  {gate.evidence
                    .map((e) => `${e.sourceLabel} · ${e.observedAtLabel}`)
                    .join(' · ')}
                </p>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
