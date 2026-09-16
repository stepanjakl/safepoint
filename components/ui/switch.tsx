'use client';

import type { ReactNode } from 'react';
import {
  Switch as AriaSwitch,
  type SwitchProps as AriaSwitchProps,
} from 'react-aria-components';
import { cx } from '@/lib/cx';

const TRACK = 'switch-track control-face control-hairline rounded-full';
const THUMB = 'switch-thumb';

/*
  An on/off switch: its label, then the track. The label is whatever the
  children are -- a word beside the track, or a whole row of title and
  description, which then all toggles it.

  control-face owns its timing, so the track swaps faces and animates nothing
  itself; only the thumb travels. Unavailable, the track goes flat like any
  control that cannot be used.
*/
export function Switch({
  children,
  className,
  ...props
}: Omit<AriaSwitchProps, 'children' | 'className'> & {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <AriaSwitch
      {...props}
      className={cx(
        'switch text-meta text-muted inline-flex cursor-pointer items-center gap-2 data-[disabled]:cursor-not-allowed',
        className,
      )}
    >
      {children}
      <span aria-hidden="true" className={TRACK}>
        <span className={THUMB} />
      </span>
    </AriaSwitch>
  );
}
