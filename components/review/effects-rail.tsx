import { Glyph } from '@/components/ui/glyph';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { SectionBand } from '@/components/ui/section-band';
import type { EffectNode } from '@/lib/review-presentation';

import { modeMarker, toneText } from './markers';

/*
  The signature element: one signal line with mode-shaped markers, inside
  the only Level 2 encased enclosure in the detail. The band says
  "none executed" so the static view cannot imply that anything ran.
*/
export function EffectsRail({
  effects,
  headingId,
}: {
  effects: EffectNode[];
  headingId: string;
}) {
  return (
    <section aria-labelledby={headingId}>
      <SectionBand
        id={headingId}
        title="Affected systems"
        meta={`${effects.length} planned · none executed`}
      />
      <div className="px-4 pt-4 pb-3">
        <div className="edge-2 rounded-control bg-surface-primary px-4 py-4">
          <ol
            className="rail"
            style={{ '--rail-count': effects.length } as React.CSSProperties}
          >
            {effects.map((node) => {
              const marker = modeMarker[node.mode];
              return (
                <li key={node.id} className="rail-node">
                  <span className={`rail-marker ${toneText[marker.tone]}`}>
                    <Glyph name={marker.glyph} size={14} />
                  </span>
                  <span className="rail-labels">
                    <span className="text-dense font-medium">
                      {node.destination}
                    </span>
                    <span className={`readout ${toneText[marker.tone]}`}>
                      {node.modeLabel}
                    </span>
                    <span className="readout text-muted">
                      {node.stateLabel}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="readout text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Legend mode="live_sandbox">Live sandbox</Legend>
          <Legend mode="simulated">Simulated</Legend>
          <Legend mode="preview_only">Preview only</Legend>
        </p>
      </div>
      <Ledger className="border-rule-faint border-t">
        {effects.map((node) => (
          <LedgerRow
            key={node.id}
            label={`Undo · ${node.destination.split(' · ')[0]}`}
          >
            {node.undo}
          </LedgerRow>
        ))}
      </Ledger>
    </section>
  );
}

function Legend({
  mode,
  children,
}: {
  mode: EffectNode['mode'];
  children: React.ReactNode;
}) {
  const marker = modeMarker[mode];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Glyph name={marker.glyph} className={toneText[marker.tone]} />
      {children}
    </span>
  );
}
