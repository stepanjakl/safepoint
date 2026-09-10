import type { DisplayHint, LabelledDelta } from '@/lib/review/plan-contract';

function formatScalar(value: number, display?: DisplayHint): string {
  const scaled = value / (display?.scale ?? 1);
  return `${display?.prefix ?? ''}${scaled.toFixed(display?.precision ?? 0)}${display?.suffix ?? ''}`;
}

/*
  One grammar for every change shape: a term, an arrow, a term. The six delta
  kinds used to render in five visual languages -- bare values, bordered chips,
  a green plus, a strikethrough, plain prose -- so the same mark meant something
  different depending on which kind you were looking at. Here the marks mean one
  thing each, and the kind is carried by which terms are present rather than by
  a treatment of its own.

  Only two things still take colour: a term that was never observed, and the
  derived annotation, whose direction is the one piece of judgement the adapter
  actually supplies. Severity is the row's job, not the delta's.
*/

/*
  One grammar, three marks. `set` and `opaque` are statements rather than pairs
  -- membership, or a shape the adapter could not describe -- so their term is
  recessive: there is no change to read across.
*/
const DELTA = 'group inline-flex min-w-0 flex-wrap items-baseline gap-1.5';
const TERM = 'min-w-0 [overflow-wrap:anywhere]';
const RECESSIVE =
  'group-data-[kind=set]:text-muted group-data-[kind=opaque]:text-muted';

// A side of the change. `numeric` gets the tabular face, because that role is
// for figures; a categorical value is a word and reads as one.
function Term({
  children,
  numeric = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <span
      className={
        numeric ? `${TERM} ${RECESSIVE} value` : `${TERM} ${RECESSIVE}`
      }
    >
      {children}
    </span>
  );
}

// A side that does not exist -- the before of a creation, the after of a
// removal, a value the snapshot never captured. Drawn rather than left blank:
// an empty cell reads as a rendering fault, and a zero would be a lie.
function Absent({ reason }: { reason: string }) {
  return (
    // Muted and mono so the dash sits on the same rhythm as the figures it
    // stands in for.
    <span className={`${TERM} value text-muted`}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}

// The arrow carries the relationship between the two terms, so it has to be
// readable rather than decorative: without it the pair announces as two bare
// values with nothing joining them.
function Arrow() {
  return (
    <>
      <span aria-hidden="true" className="text-muted">
        →
      </span>
      <span className="sr-only"> changes to </span>
    </>
  );
}

export function DeltaValue({
  delta,
  expanded = false,
}: {
  delta: LabelledDelta;
  expanded?: boolean;
}) {
  switch (delta.kind) {
    case 'scalar':
      return (
        <span className={DELTA} data-kind="scalar">
          {delta.before === null ? (
            <Absent reason="Snapshot not supplied" />
          ) : (
            <Term numeric>{formatScalar(delta.before, delta.display)}</Term>
          )}
          <Arrow />
          <Term numeric>{formatScalar(delta.after, delta.display)}</Term>
          {delta.derived ? (
            <span
              className="text-muted data-[direction=down]:text-state-verified data-[direction=up]:text-state-caution text-[12px]"
              data-direction={delta.derivedDirection ?? 'none'}
            >
              {delta.derived}
            </span>
          ) : null}
        </span>
      );

    case 'categorical':
      return (
        <span className={DELTA} data-kind="categorical">
          {delta.before === null ? (
            <Absent reason="Snapshot not supplied" />
          ) : (
            <Term>{delta.before}</Term>
          )}
          <Arrow />
          <Term>{delta.after}</Term>
        </span>
      );

    // A creation and a removal are the same sentence with one side missing,
    // which is what the arrow direction already says. Neither needs a marker
    // or a colour of its own to be told apart.
    case 'create':
      return (
        <span className={DELTA} data-kind="create">
          <Absent reason="did not exist" />
          <Arrow />
          <Term>{delta.after}</Term>
        </span>
      );

    case 'destroy':
      return (
        <span className={DELTA} data-kind="destroy">
          <Term>{delta.before}</Term>
          <Arrow />
          <Absent reason="removed" />
        </span>
      );

    // No before and no after: membership changed, and the change itself is the
    // whole statement. One term, no arrow.
    case 'set': {
      const parts = [
        delta.added.length > 0 ? `${delta.added.length} added` : null,
        delta.removed.length > 0 ? `${delta.removed.length} removed` : null,
      ].filter(Boolean);
      return (
        <span className={DELTA} data-kind="set">
          {expanded && parts.length > 0 ? (
            <>
              {delta.added.length > 0 ? (
                <Term>Added: {delta.added.join(', ')}</Term>
              ) : null}
              {delta.removed.length > 0 ? (
                <Term>Removed: {delta.removed.join(', ')}</Term>
              ) : null}
            </>
          ) : parts.length > 0 ? (
            <Term>{parts.join(', ')}</Term>
          ) : (
            <Term>No membership change</Term>
          )}
        </span>
      );
    }

    // Also the default: a row must never render as a gap.
    case 'opaque':
    default:
      return (
        <span className={DELTA} data-kind="opaque">
          <Term>{delta.summary}</Term>
        </span>
      );
  }
}

export function DeltaRow({ delta }: { delta: LabelledDelta }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <span className="text-muted text-[13px]">{delta.label}</span>
      <DeltaValue delta={delta} />
    </div>
  );
}
