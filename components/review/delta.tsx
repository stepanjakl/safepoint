import type { DisplayHint, LabelledDelta } from '@/lib/review/plan-contract';

function formatScalar(value: number, display?: DisplayHint): string {
  const scaled = value / (display?.scale ?? 1);
  return `${display?.prefix ?? ''}${scaled.toFixed(display?.precision ?? 0)}${display?.suffix ?? ''}`;
}

// A before value that was never observed is said so, never rendered as zero or
// as an empty cell. `create` is the different case: no before exists at all.
function Unobserved() {
  return <span className="delta-unobserved">Snapshot not supplied</span>;
}

// The arrow carries the relationship between the two values, so it has to be
// readable rather than decorative: without it the pair announces as two bare
// values with nothing joining them.
function Arrow() {
  return (
    <>
      <span aria-hidden="true" className="delta-arrow">
        →
      </span>
      <span className="sr-only"> changes to </span>
    </>
  );
}

export function DeltaValue({ delta }: { delta: LabelledDelta }) {
  switch (delta.kind) {
    case 'scalar':
      return (
        <span className="delta delta-scalar">
          {delta.before === null ? (
            <Unobserved />
          ) : (
            <span className="value">
              {formatScalar(delta.before, delta.display)}
            </span>
          )}
          <Arrow />
          <span className="value">
            {formatScalar(delta.after, delta.display)}
          </span>
          {delta.derived ? (
            <span
              className="delta-derived"
              data-direction={delta.derivedDirection ?? 'none'}
            >
              {delta.derived}
            </span>
          ) : null}
        </span>
      );

    case 'categorical':
      return (
        <span className="delta delta-categorical">
          {delta.before === null ? (
            <Unobserved />
          ) : (
            <span className="delta-chip" data-state="before">
              {delta.before}
            </span>
          )}
          <Arrow />
          <span className="delta-chip" data-state="after">
            {delta.after}
          </span>
        </span>
      );

    case 'create':
      return (
        <span className="delta delta-create">
          <span aria-hidden="true">+</span>
          <span className="value">{delta.after}</span>
          <span className="sr-only">added</span>
        </span>
      );

    case 'destroy':
      return (
        <span className="delta delta-destroy">
          <span className="value">{delta.before}</span>
          <span className="sr-only">removed</span>
        </span>
      );

    case 'set': {
      const parts = [
        delta.added.length > 0 ? `${delta.added.length} added` : null,
        delta.removed.length > 0 ? `${delta.removed.length} removed` : null,
      ].filter(Boolean);
      return (
        <span className="delta delta-set">
          {parts.length > 0 ? parts.join(', ') : 'No membership change'}
        </span>
      );
    }

    // Also the default: a row must never render as a gap.
    case 'opaque':
    default:
      return <span className="delta delta-opaque">{delta.summary}</span>;
  }
}

export function DeltaRow({ delta }: { delta: LabelledDelta }) {
  return (
    <div className="delta-row">
      <span className="delta-label">{delta.label}</span>
      <DeltaValue delta={delta} />
    </div>
  );
}
