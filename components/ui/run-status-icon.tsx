'use client';

import { useId, type SVGProps } from 'react';
import type { RunStatus } from '@/lib/process/model';

/*
  The nine states a run can be in, as one family.

  The review's glyphs -- circle, triangle, square, struck -- say what an outcome
  is, and they are deliberately different shapes so that colour is never the
  only signal on a line of a plan. A run is a different question: it is not an
  outcome but a lifecycle, the same thing moving through stages, and a family
  of unrelated shapes makes a sequence look like a set of unrelated verdicts.
  So every state here is the same circle, and what changes inside it is what
  the state is: empty and dotted before it starts, part-filled while it runs,
  solid once it is settled.

  Two rules hold the family together. A ring means the run is still open --
  nobody has to live with it yet. A solid disc means it is settled, and the
  mark is knocked out of the fill rather than drawn on top, so a settled state
  is heavier at a glance even in grey. Colour is carried by the caller, as
  currentColor, from the tone the state maps to in markers.ts.
*/

// 16px of viewBox, so a stroke width reads the same whatever size it is drawn
// at. The ring sits one stroke in from the edge; the disc fills to it.
const RING = 6.25;
const DISC = 7;

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
  The wedge a running state fills, swept 120 degrees from twelve o'clock. Drawn
  rather than animated: the rail lists runs, and a spinner in a list of four
  rows is four things moving for no information.
*/
const WEDGE = 'M8 8 L8 4.25 A3.75 3.75 0 0 1 11.25 9.875 Z';

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
        strokeDasharray="0.1 3"
        strokeWidth={1.75}
      />
    ),
  },
  // Under way: the ring is whole and the wedge inside it is filling.
  running: {
    ring,
    mark: <path d={WEDGE} fill="currentColor" stroke="none" />,
  },
  // The one state that is asking for something. A solid disc, because it is
  // the loudest thing the rail can show, and the mark that means "you".
  awaiting_review: {
    fill: true,
    mark: (
      <>
        <path d="M8 4.4 L8 8.6" />
        {/* A round cap on a hair of a line: the dot under the bar. */}
        <path d="M8 11.05 L8 11.1" />
      </>
    ),
  },
  // Decided, but it has not reached anything yet: the ring is still open.
  approved: {
    ring,
    mark: <path d="M5 8.2 L7.1 10.3 L11 5.9" strokeWidth={1.6} />,
  },
  // Decided and applied. The only state a reader can stop thinking about.
  completed: { fill: true, mark: <path d="M4.9 8.2 L7.1 10.4 L11.1 5.8" /> },
  // Stopped on purpose, and it can still move.
  held: {
    fill: true,
    mark: (
      <>
        <path d="M6.3 5.3 L6.3 10.7" />
        <path d="M9.7 5.3 L9.7 10.7" />
      </>
    ),
  },
  failed: {
    fill: true,
    mark: (
      <>
        <path d="M5.7 5.7 L10.3 10.3" />
        <path d="M10.3 5.7 L5.7 10.3" />
      </>
    ),
  },
  cancelled: { fill: true, mark: <path d="M5.3 8 L10.7 8" /> },
  // Passed over rather than stopped: nobody decided, and a newer run replaced
  // it. Hollow, because it was never settled -- only overtaken.
  superseded: {
    ring,
    mark: <path d="M5.2 10.8 L10.8 5.2" strokeWidth={1.6} />,
  },
};
