'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Tooltip } from '@/components/ui/tooltip';

/*
  The round icon buttons of a section header: the schedule on its own, and the
  start and its chevron inside one pill. They share a shape, an ink ladder
  (muted-strong at rest, primary once the button or its pill is under the
  pointer) and the unavailable pattern; they differ in size and in where
  the wash comes from.

  A button that cannot act stays announced as unavailable but focusable, so its
  tooltip can say why.
*/

// A standalone circle, and the two sizes that sit inside a pill.
const SIZES = {
  alone: '-my-1 size-7',
  'in-pill': 'h-6 w-7',
  'in-pill-small': 'mr-0.5 size-5',
} as const;

// Where the wash comes from, at rest and while it answers. `rest` is the
// button's own; `none` leaves it to the pill around it; `strong` is a circle
// one step past the pill's, so the pill stays behind it.
const WASHES = {
  rest: 'bg-surface-hover hover:bg-surface-hover-strong focus-visible:bg-surface-selected data-[pressed]:bg-surface-hover-strong',
  none: '',
  strong:
    'hover:bg-surface-selected-strong focus-visible:bg-surface-selected-strong data-[pressed]:bg-surface-selected-strong',
} as const;

// Ink on the wash: primary wherever the wash is the darker step. Each button
// answers its own pointer, and an open popover looks as the pointer left it;
// keyboard focus takes the darker wash, as the app draws no focus outline.
const INK =
  'control-wash hover:text-primary focus-visible:text-primary data-[pressed]:text-primary';

export function HeadIconButton({
  label,
  tooltip,
  size,
  wash,
  active = false,
  unavailable = false,
  mark = false,
  leads = false,
  onPress,
  className = '',
  children,
}: {
  // The accessible name.
  label: string;
  tooltip: Pick<
    ComponentProps<typeof Tooltip>,
    'label' | 'description' | 'placement' | 'triggerRef'
  >;
  size: keyof typeof SIZES;
  wash: keyof typeof WASHES;
  // Full ink at rest: a setting that is on.
  active?: boolean;
  unavailable?: boolean;
  // A dot on the circle's edge at the top right, a shape and not only a colour.
  mark?: boolean;
  // In a pill: the button whose pointer brings up the pill's own wash.
  leads?: boolean;
  onPress?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip {...tooltip}>
      <AriaButton
        aria-label={label}
        aria-disabled={unavailable ? 'true' : undefined}
        data-leads={leads || undefined}
        onPress={unavailable ? undefined : onPress}
        className={`relative grid place-items-center rounded-full ${SIZES[size]} ${WASHES[wash]} ${
          unavailable
            ? 'text-muted cursor-default'
            : `${INK} ${active ? 'text-primary' : 'text-muted-strong'}`
        } ${className}`}
      >
        {children}
        {mark ? (
          // The box is turned 45deg so the dot, centred on its top edge,
          // lands centred on the circle's edge at the top right.
          <span aria-hidden className="absolute inset-0 rotate-45">
            <span className="accent-mark absolute top-0 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" />
          </span>
        ) : null}
      </AriaButton>
    </Tooltip>
  );
}
