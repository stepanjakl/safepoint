'use client';

import { Button as AriaButton, type ButtonProps } from 'react-aria-components';

import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary';

/*
  Which edges lean. A slanted button sits in a Notch, parallel to its slope;
  `both` is for the first of two that share a seam. Physical sides, because a
  skew is physical.
*/
export type Slant = 'left' | 'right' | 'both';

// No transition utility here: control-face owns the timing, because the
// gradient stops it animates are its own contract.
const base =
  'inline-flex h-9 min-w-11 items-center justify-center gap-2 px-3.5 text-dense font-medium whitespace-nowrap outline-none data-[disabled]:cursor-not-allowed data-[disabled]:control-off data-[disabled]:text-muted';

// A square button draws its own ring. A slanted one cannot -- the element is a
// rectangle and the shape is not -- so its layers draw it instead.
const focusRing =
  'data-[focus-visible]:outline-solid data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus';

/*
  Each variant in two halves: the stops, which say what colour the face is in
  each state, and the shape they are painted onto. A square button is its own
  shape; a slanted one hands the stops to the `slant` layers.
*/
const faces: Record<Variant, string> = {
  // The one accented control on a page: a lit face with a brighter ring.
  primary:
    'control-accent text-white data-[hovered]:control-accent-hover data-[pressed]:control-accent-hover',
  // Everything else: the same construction, one step quieter.
  secondary:
    'control-quiet text-primary data-[hovered]:control-quiet-hover data-[pressed]:control-quiet-hover',
};

const shapes: Record<Variant, string> = {
  primary: 'control-face rounded-control',
  secondary: 'control-face rounded-section',
};

export function Button({
  variant = 'secondary',
  slant,
  className,
  ...props
}: ButtonProps & { variant?: Variant; slant?: Slant; className?: string }) {
  return (
    <AriaButton
      {...props}
      data-slant={slant}
      className={cx(
        base,
        faces[variant],
        slant ? 'slant' : cx(shapes[variant], focusRing),
        className,
      )}
    />
  );
}

/*
  Icon squares, in the same two halves the text button is built from: a shape
  that commits to no colour, and a face laid over it. Strings rather than a
  component because the squares in the interface are buttons, links and spans
  by turns, and wrapping each of those would cost more than it saves.

  The shape states no size. A square is sized by the rail or the header it
  sits in, and two size utilities in one concatenated string would be settled
  by stylesheet order rather than by the call site.
*/
export const ICON_SHAPE =
  'inline-grid flex-none place-items-center rounded-control p-0 aria-disabled:cursor-default';

/*
  The quiet face: a wash on hover, nothing at rest. It carries the transition,
  so a square that swaps this out for control-face -- the sidebar's Save-order
  button does exactly that -- is left with control-face's own timing rather
  than a `transition-colors` that names none of the gradient stops and so
  snaps every one of them.
*/
export const ICON_QUIET =
  'control-wash text-muted hover:bg-surface-selected hover:text-primary';

export const ICON_BUTTON = `${ICON_SHAPE} ${ICON_QUIET}`;
