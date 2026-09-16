import type { ComponentType } from 'react';
// Deep imports: Blode's barrel is the whole icon library.
import ArrowBoxLeft from 'blode-icons-react/icons/arrow-box-left';
import ArrowBoxRight from 'blode-icons-react/icons/arrow-box-right';
import ArrowDownSquare from 'blode-icons-react/icons/arrow-down-square';
import ArrowFromLineDown from 'blode-icons-react/icons/arrow-from-line-down';
import ArrowFromLineUp from 'blode-icons-react/icons/arrow-from-line-up';
import ArrowInbox from 'blode-icons-react/icons/arrow-inbox';
import ArrowOutOfBox from 'blode-icons-react/icons/arrow-out-of-box';
import ArrowUpSquare from 'blode-icons-react/icons/arrow-up-square';
import CloudDownload from 'blode-icons-react/icons/cloud-download';
import CloudUpload from 'blode-icons-react/icons/cloud-upload';
import FileArrowRightIn from 'blode-icons-react/icons/file-arrow-right-in';
import FileArrowRightOut from 'blode-icons-react/icons/file-arrow-right-out';
import SquareArrowInTopLeft from 'blode-icons-react/icons/square-arrow-in-top-left';
import SquareArrowOutTopLeft from 'blode-icons-react/icons/square-arrow-out-top-left';

/*
  Candidates for the header's Inputs and Outputs controls, drawn in the control
  they would sit in and at the size they would be drawn there.

  A pair only counts as one if the two glyphs are the same drawing with the
  direction reversed. Everything else -- a file beside a cloud, a tray beside
  an arrow -- reads as two pictures that happen to be next to each other. Each
  note says where the pair falls short, because that is what the rendering
  cannot show.
*/

type Icon = ComponentType<{
  'aria-hidden'?: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

const PAIRS: { name: string; note: string; In: Icon; Out: Icon }[] = [
  {
    name: 'arrow-inbox · arrow-out-of-box',
    note: 'In use. One tray, arrow down into it and up out of it. Closest thing to a mirrored pair in the set.',
    In: ArrowInbox,
    Out: ArrowOutOfBox,
  },
  {
    name: 'arrow-box-left · arrow-box-right',
    note: 'One open-sided box, arrow through the opening. Reads as door in / door out; the box is bigger, so the glyph is heavier.',
    In: ArrowBoxLeft,
    Out: ArrowBoxRight,
  },
  {
    name: 'arrow-down-square · arrow-up-square',
    note: 'Arrow inside a closed square. Geometric and quiet, but a square is the review’s held marker at small sizes.',
    In: ArrowDownSquare,
    Out: ArrowUpSquare,
  },
  {
    name: 'arrow-from-line-down · arrow-from-line-up',
    note: 'Bare arrow off a line. Lightest of the set and the least specific: no container, so nothing says where the data sits.',
    In: ArrowFromLineDown,
    Out: ArrowFromLineUp,
  },
  {
    name: 'square-arrow-in-top-left · square-arrow-out-top-left',
    note: 'Diagonal through a square corner. Distinct at a glance, but diagonals read as open in a new window elsewhere.',
    In: SquareArrowInTopLeft,
    Out: SquareArrowOutTopLeft,
  },
  {
    name: 'file-arrow-right-in · file-arrow-right-out',
    note: 'A file, which is what an input is here. The output is not a file, so the pair says something untrue about half of it.',
    In: FileArrowRightIn,
    Out: FileArrowRightOut,
  },
  {
    name: 'cloud-download · cloud-upload',
    note: 'Reads as network transfer. Wrong twice over: the inputs are local files, and nothing is downloaded.',
    In: CloudDownload,
    Out: CloudUpload,
  },
];

const PILL =
  'header-button control-face control-header-button text-primary text-dense inline-flex flex-none items-center gap-2 rounded-full ps-3 font-medium whitespace-nowrap';
const COUNT =
  'value header-button-count bg-header-button-count text-meta inline-grid place-items-center rounded-full px-1.5';

export function IconPairGallery() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {PAIRS.map(({ name, note, In, Out }) => (
        <div
          key={name}
          className="border-rule-default bg-surface-primary grid gap-2.5 border p-4"
        >
          <p className="value text-micro text-muted">{name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${PILL} control-header-button-blocked`}>
              <In
                aria-hidden
                size={16}
                strokeWidth={1.8}
                className="flex-none -translate-y-px"
              />
              Inputs
              <span className={COUNT}>9</span>
              <span className="bg-state-blocked size-1.5 flex-none rounded-full" />
            </span>
            <span className={PILL}>
              <Out
                aria-hidden
                size={16}
                strokeWidth={1.8}
                className="flex-none -translate-y-px"
              />
              Outputs
              <span className={COUNT}>4</span>
            </span>
          </div>
          <p className="text-meta text-muted leading-normal">{note}</p>
        </div>
      ))}
    </div>
  );
}
