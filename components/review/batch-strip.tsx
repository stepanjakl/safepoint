import { Glyph } from '@/components/ui/glyph';
import type { BatchPresentation } from '@/lib/review-presentation';

import { outcomeMarker, toneText } from './markers';

/*
  Proposal outcomes for the whole batch. Four aligned cells separated by
  rules, not statistic cards. The last cell keeps the complete accounting of
  non-releasable lines visible.
*/
export function BatchStrip({ batch }: { batch: BatchPresentation }) {
  const { counts } = batch;
  const ready = outcomeMarker.ready;
  const attention = outcomeMarker.needs_attention;
  const held = outcomeMarker.held;

  return (
    <dl
      aria-label="Proposal outcomes"
      className="border-rule-strong bg-surface-primary grid grid-cols-2 border-b @3xl:grid-cols-4"
    >
      <Cell
        label="Evaluated"
        value={counts.evaluated}
        note="All lines accounted for"
      />
      <Cell
        label="Ready"
        value={counts.ready}
        note="Eligible, no attention needed"
        marker={<Glyph name={ready.glyph} className={toneText[ready.tone]} />}
      />
      <Cell
        label="Need attention"
        value={counts.needsAttention}
        note="Eligible, individual approval"
        marker={
          <Glyph name={attention.glyph} className={toneText[attention.tone]} />
        }
      />
      <Cell
        label="Not releasable"
        value={counts.nonReleasable}
        note={`${counts.held} held · ${counts.excluded} excluded · ${counts.unverifiable} unverifiable`}
        marker={<Glyph name={held.glyph} className={toneText[held.tone]} />}
        last
      />
    </dl>
  );
}

function Cell({
  label,
  value,
  note,
  marker,
  last = false,
}: {
  label: string;
  value: number;
  note: string;
  marker?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={
        last
          ? 'px-4 py-3'
          : 'border-rule-default border-b px-4 py-3 @3xl:border-r @3xl:border-b-0'
      }
    >
      <dd className="value text-counter flex items-center gap-2">
        {marker}
        {value}
      </dd>
      <dt className="readout text-muted mt-0.5">{label}</dt>
      <dd className="text-meta text-muted mt-0.5">{note}</dd>
    </div>
  );
}
