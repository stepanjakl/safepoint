'use client';

import { useState, type ReactNode, type Ref } from 'react';
import { Button as AriaButton, type ButtonProps } from 'react-aria-components';
import { cx } from '@/lib/cx';
import { ICON_BOX, ICON_QUIET, type Shape } from './button';
import { Tooltip } from './tooltip';

/*
  A square icon button with its name in a tooltip: the sidebar's search and
  arrange buttons' shape and ink, with their corners or fully round -- the
  same two shapes a Button has. `quiet` shows its wash only to the pointer
  and to focus; `filled` keeps one at rest, for a control that stands alone
  with no row or heading around it to say it can be pressed. Either way an
  open popover holds the pressed wash, as the pointer left it.
*/
const FACES = {
  quiet: ICON_QUIET,
  filled:
    'control-wash bg-surface-hover text-icon-quiet-ink hover:bg-surface-selected hover:text-icon-quiet-ink-hover focus-visible:bg-surface-selected focus-visible:text-icon-quiet-ink-hover',
} as const;
const SHAPES = {
  corners: 'rounded-icon',
  round: 'rounded-full',
} satisfies Record<Shape, string>;

export function IconButton({
  label,
  description,
  placement = 'bottom',
  face = 'filled',
  shape = 'corners',
  hideTooltip = false,
  className,
  children,
  ref,
  ...props
}: Omit<ButtonProps, 'children' | 'className'> & {
  // The accessible name, and the tooltip's title.
  label: string;
  description?: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  face?: keyof typeof FACES;
  shape?: Shape;
  // Inside an inert region -- a closed panel kept for its transition --
  // nothing can focus it, and a tooltip's trigger requires something that
  // can be focused.
  hideTooltip?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  /*
    Pressed, the name has been read: the tooltip stays away until the pointer
    leaves, as it does for the sidebar's buttons. A popover it opens hands
    focus back to it on closing, under a pointer that never left, and the
    tooltip would otherwise open again then. Focus leaving for anywhere but
    its own open popover also lifts the hold.
  */
  const [held, setHeld] = useState(false);
  const button = (
    <AriaButton
      {...props}
      ref={ref}
      aria-label={label}
      onPressStart={(event) => {
        setHeld(true);
        props.onPressStart?.(event);
      }}
      onHoverEnd={(event) => {
        // An open popover's underlay ends the hover without the pointer
        // moving; only a real leave lifts the hold.
        if (event.target.getAttribute('aria-expanded') !== 'true')
          setHeld(false);
        props.onHoverEnd?.(event);
      }}
      onBlur={(event) => {
        // Into its own popover is not away: that focus comes back.
        const next = event.relatedTarget;
        if (!(
          next instanceof Element &&
          next.closest('[role="dialog"], [role="menu"]')
        ))
          setHeld(false);
        props.onBlur?.(event);
      }}
      className={cx(
        ICON_BOX,
        SHAPES[shape],
        FACES[face],
        'aria-expanded:bg-surface-selected aria-expanded:text-primary size-7.5',
        className,
      )}
    >
      {children}
    </AriaButton>
  );
  if (hideTooltip) return button;
  return (
    <Tooltip
      label={label}
      description={description}
      placement={placement}
      isDisabled={held}
    >
      {button}
    </Tooltip>
  );
}
