import type { ReactNode } from 'react';

import { cx } from '@/lib/ui/cx';

import { NotchSnap } from './notch-snap';

/*
  The bite a pane's corner takes, so controls can sit on the canvas beside a
  header. Place it as the last cell of a header row, pulled over the pane's
  edge (`-mt-pane-inset -mr-pane-inset`): it stretches with the row, so its
  floor lands on whatever rule the rest of the row draws, at any height.

  Controls inside it lean with it when they are slanted -- `<Button slant>` --
  and keep an even gap to the slope, because both read `--notch-angle`.
  Geometry and colour are tokens; override any of them on this element.

  The spans are the painted layers, each nested in the wrapper that computes
  the outline at its offset: see `.notch` in notch.css beside this file.
*/
export function Notch({
  children,
  className,
  side = 'right',
}: {
  children: ReactNode;
  className?: string;
  side?: 'left' | 'right';
}) {
  return (
    <div className={cx('notch', className)} data-side={side}>
      <span aria-hidden="true" className="notch-shape">
        <span className="notch-paint notch-face" />
        <span className="notch-at" data-k="1">
          <span className="notch-at" data-k="2">
            <span className="notch-paint notch-under" />
            <span className="notch-paint notch-sheen" />
          </span>
          <span className="notch-paint notch-edge" />
        </span>
      </span>
      <NotchSnap />
      {children}
    </div>
  );
}
