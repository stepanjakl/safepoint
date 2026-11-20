'use client';

import { useId, type SVGProps } from 'react';
import type { RunStatus } from '@/lib/shell/model';

/*
  The nine states a run can be in, as one family.

  The review's glyphs -- circle, triangle, square, struck -- say what an outcome
  is, and they are deliberately different shapes so that colour is never the
  only signal on a line of a plan. A run is a different question: it is not an
  outcome but a lifecycle, the same thing moving through stages, and a family
  of unrelated shapes makes a sequence look like a set of unrelated verdicts.
  So every state here is the same circle, and what changes inside it is what
  the state is: empty and dotted before it starts, an arc on its track while it
  runs, solid once it is settled.

  Two rules hold the family together. A ring means the run is still open --
  nobody has to live with it yet. A solid disc means it is settled, and the
  mark is knocked out of the fill rather than drawn on top, so a settled state
  is heavier at a glance even in grey. Colour is carried by the caller, as
  currentColor, from the tone the state maps to in components/app-shell/markers.ts.
*/

// 16px of viewBox, so a stroke width reads the same whatever size it is drawn
// at. Solid discs step slightly inside the ring's outer edge (6.6 vs 7.0) so
// filled and hollow states match optically at 16px.
const RING = 6.25;
const DISC = 6.6;

export function RunStatusIcon({
  status,
  size = 16,
  style,
  ...props
}: { status: RunStatus; size?: number } & Omit<
  SVGProps<SVGSVGElement>,
  'status'
>) {
  // A knockout needs a mask, and a mask needs an id no other instance shares.
  // React's own ids carry punctuation that has no business in a url(#...)
  // fragment, so only the word characters are kept.
  const id = `run-status-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const shape = SHAPES[status];
  // Emitted in rem so the icon grows with the text beside it when the reader
  // enlarges type, the same way `Glyph` does.
  const edge = `${size / 16}rem`;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      // Merged rather than spread over: a caller passing a colour must not
      // take the size with it.
      style={{ width: edge, height: edge, ...style }}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {shape.fill ? (
        <>
          {/* The mark is a hole in the disc: white keeps, black cuts. */}
          <mask
            id={id}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="16"
            height="16"
          >
            {/* stroke:none matters: the root sets currentColor, and a stroked
                white circle would cut a ring of its own out of the disc. */}
            <circle cx="8" cy="8" r={DISC} fill="#fff" stroke="none" />
            <g stroke="#000" strokeWidth={1.7} fill="none">
              {shape.mark}
            </g>
          </mask>
          <circle
            cx="8"
            cy="8"
            r={DISC}
            fill="currentColor"
            stroke="none"
            mask={`url(#${id})`}
          />
        </>
      ) : (
        <>
          {shape.ring}
          {shape.mark}
        </>
      )}
    </svg>
  );
}

const ring = <circle cx="8" cy="8" r={RING} />;

/*
  A running run is drawn as the run thread's active step is: a pale track, an
  arc of the state's own colour most of the way round it, and a dot in the
  middle. Still rather than turning: the rail lists runs, and a spinner in a
  list of four rows is four things moving for no information. The thread's
  marker is the one that turns.
*/
const ARC = 'M8 1.75 A6.25 6.25 0 1 1 3.98 12.79';

type Shape = {
  // A solid disc with the mark knocked out of it, rather than a ring.
  fill?: true;
  ring?: React.ReactNode;
  mark?: React.ReactNode;
};

const SHAPES: Record<RunStatus, Shape> = {
  // Nothing has happened yet, and the ring says so by not being whole.
  queued: {
    ring: (
      <circle
        cx="8"
        cy="8"
        r={RING}
        strokeDasharray="0.1 2.9"
        strokeWidth={1.5}
      />
    ),
  },
  // Under way: an arc on its track, and the dot at the centre.
  running: {
    ring: (
      <circle
        cx="8"
        cy="8"
        r={RING}
        style={{ stroke: 'var(--sp-running-track)' }}
      />
    ),
    mark: (
      <>
        <path d={ARC} />
        <circle cx="8" cy="8" r="2.25" fill="currentColor" stroke="none" />
      </>
    ),
  },
  // Still open and waiting on a person: a closed ring with the centre dot,
  // matching `running` and `approved` in stroke weight so it stands out by
  // hue rather than visual mass.
  awaiting_review: {
    ring,
    mark: <circle cx="8" cy="8" r="2.25" fill="currentColor" stroke="none" />,
  },
  // Decided, but it has not reached anything yet: the ring is still open.
  approved: {
    ring,
    mark: <path d="M5.1 8.2 L7.1 10.2 L10.9 6" strokeWidth={1.6} />,
  },
  // Decided and applied. The only state a reader can stop thinking about.
  completed: { fill: true, mark: <path d="M5.1 8.2 L7.1 10.2 L10.9 6" /> },
  // Stopped on purpose, and it can still move: hollow ring with pause bars so
  // it stays distinct from terminal failure.
  held: {
    ring,
    mark: (
      <>
        <path d="M6.4 5.5 L6.4 10.5" strokeWidth={1.6} />
        <path d="M9.6 5.5 L9.6 10.5" strokeWidth={1.6} />
      </>
    ),
  },
  failed: {
    fill: true,
    mark: (
      <>
        <path d="M5.8 5.8 L10.2 10.2" />
        <path d="M10.2 5.8 L5.8 10.2" />
      </>
    ),
  },
  cancelled: { fill: true, mark: <path d="M5.4 8 L10.6 8" /> },
  // Passed over rather than stopped: nobody decided, and a newer run replaced
  // it. Hollow, with a small forward arrow.
  superseded: {
    ring,
    mark: (
      <>
        <path d="M5.7 10.3 L10.1 5.9" strokeWidth={1.5} />
        <path d="M6.8 5.9 L10.1 5.9 L10.1 9.2" strokeWidth={1.5} />
      </>
    ),
  },
};
