'use client';

import { styleDebug } from '@/lib/style-debug';
import type { ReactNode } from 'react';
import {
  Switch as AriaSwitch,
  type SwitchProps as AriaSwitchProps,
} from 'react-aria-components';
import { cx } from '@/lib/cx';

const TRACK = 'switch-track control-face control-hairline rounded-full';
const THUMB = 'switch-thumb';

export type SwitchSize = 'sm' | 'md' | 'lg';

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
  size = 'md',
  ...props
}: Omit<AriaSwitchProps, 'children' | 'className' | 'size'> & {
  children?: ReactNode;
  className?: string;
  size?: SwitchSize;
}) {
  return (
    <AriaSwitch
      {...props}
      {...styleDebug({ component: 'Switch', appearance: 'switch' })}
      data-size={size}
      className={cx(
        'switch text-meta text-muted inline-flex min-h-6 cursor-pointer items-center gap-2 data-[disabled]:cursor-not-allowed',
        className,
      )}
    >
      {children}
      <span
        aria-hidden="true"
        {...styleDebug({
          component: 'Switch',
          part: 'track',
          appearance: 'switch-track',
        })}
        className={TRACK}
      >
        <span
          {...styleDebug({
            component: 'Switch',
            part: 'thumb',
            appearance: 'switch-thumb',
          })}
          className={THUMB}
        />
      </span>
    </AriaSwitch>
  );
}
