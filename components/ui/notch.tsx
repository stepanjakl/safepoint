import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

/*
  The bite a pane's corner takes, so controls can sit on the canvas beside a
  header. Place it as the last cell of a header row, pulled over the pane's
  edge (`-mt-control-edge -mr-control-edge`): it stretches with the row, so its
  floor lands on whatever rule the rest of the row draws, at any height.

  Controls inside it lean with it when they are slanted -- `<Button slant>` --
  and keep an even gap to the slope, because both read `--notch-angle`.
  Geometry and colour are tokens; override any of them on this element.
*/
export function Notch({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('notch', className)}>
      <span aria-hidden="true" className="notch-slant" />
      {children}
    </div>
  );
}
