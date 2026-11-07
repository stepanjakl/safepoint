'use client';

import { Button as AriaButton, type ButtonProps } from 'react-aria-components';

import type { Ref } from 'react';

import { cx } from '@/lib/cx';
import { MorphingLabel, plainLabel } from './morphing-text';

type Variant = 'primary' | 'secondary' | 'danger';

/*
  Which edges lean. A slanted button sits in a Notch, parallel to its slope;
  `both` is for the first of two that share a seam. Physical sides, because a
  skew is physical.
*/
export type Slant = 'left' | 'right' | 'both';

// No transition utility here: control-face owns the timing, because the
// gradient stops it animates are its own contract.
const base =
  'inline-flex min-w-11 items-center justify-center gap-2 font-medium whitespace-nowrap data-[disabled]:cursor-not-allowed data-[disabled]:control-off data-[disabled]:text-muted';

/*
  Each variant in two halves: the stops, which say what colour the face is in
  each state, and the shape they are painted onto. A square button is its own
  shape; a slanted one hands the stops to the `slant` layers.

  Keyboard focus takes the hover stops. The app draws no focus outline of its
  own (see :focus-visible in app/styles/base.css), and because focus is carried by
  the stops rather than by the box, a slanted button shows it on its slanted
  shape with nothing extra to draw.
*/
const faces = {
  // The one accented control on a page: a coloured face with its ring outside it.
  primary:
    'control-button-primary text-white interact:control-button-primary-hover',
  // An action that throws work away, once it has been confirmed.
  danger:
    'control-button-danger text-white interact:control-button-danger-hover',
  // Everything else: the same construction, one step quieter.
  secondary:
    'control-button-secondary text-primary interact:control-button-secondary-hover',
} satisfies Record<Variant, string>;

/*
  Corners follow the height, so all three sizes read as one shape. `round`
  is the other shape at every size, for a set of suggestions offered rather
  than an action taken; a round end wants a little more room before the
  label, so it takes the next padding step.
*/
const sizes = {
  xsmall: 'control-face text-micro h-6',
  small: 'control-face text-meta h-7',
  medium: 'control-face text-dense h-8',
  large: 'control-face text-dense h-9',
} as const;
const shapes = {
  corners: {
    xsmall: 'rounded-control px-2',
    small: 'rounded-control px-2.5',
    medium: 'rounded-icon px-3',
    large: 'rounded-shell px-3.5',
  },
  round: {
    xsmall: 'rounded-full px-2.5',
    small: 'rounded-full px-3',
    medium: 'rounded-full px-3.5',
    large: 'rounded-full px-4',
  },
} as const;
export type Shape = keyof typeof shapes;

/*
  A slant's painted layers, each nested in the wrapper that computes its
  outline at one offset. The nesting is the mechanism, not decoration: see
  `.slant` in components/ui/notch.css.
*/
const SLANT_LAYERS = (
  <span aria-hidden="true" className="slant-shape">
    <span className="slant-at" data-d="focus">
      <span className="slant-paint slant-focus" />
    </span>
    <span className="slant-at" data-d="edge">
      <span className="slant-paint slant-ring" />
      <span className="slant-at" data-d="face">
        <span className="slant-paint slant-face" />
        <span className="slant-at" data-d="sheen">
          <span className="slant-paint slant-sheen" />
        </span>
      </span>
    </span>
  </span>
);

export function Button({
  variant = 'secondary',
  slant,
  size = 'large',
  shape = 'corners',
  className,
  children,
  ...props
}: ButtonProps & {
  variant?: Variant;
  slant?: Slant;
  // `medium` is a call to action that stands alone, not in a toolbar; `small`
  // is for actions repeated down a table's rows; `xsmall` sits in a table's
  // heading row, beside its column names. A slant ignores it.
  size?: keyof typeof sizes;
  // Corners that follow the height, or fully round ends. A slant ignores it.
  shape?: Shape;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <AriaButton
      {...props}
      data-slant={slant}
      className={cx(
        base,
        faces[variant],
        // Size with the shape, not in `base`: a slant's height is a token
        // sized to its header, and two utilities for one property would be
        // settled by stylesheet order.
        slant
          ? 'slant text-dense h-(--slant-height) px-3.5'
          : `${sizes[size]} ${shapes[shape][size]}`,
        className,
      )}
    >
      {(values) => {
        const content =
          typeof children === 'function' ? children(values) : children;
        // A label of words morphs when it changes, whoever renders it.
        const label = plainLabel(content);
        return (
          <>
            {slant ? SLANT_LAYERS : null}
            {label === null ? content : <MorphingLabel text={label} />}
          </>
        );
      }}
    </AriaButton>
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

  The pointer holds even while a square is aria-disabled. The squares disabled
  today are the sidebar's placeholders -- Add process, Settings -- which are
  drawn as live controls, and a default cursor over something drawn as live
  reads as a dead spot rather than as unavailability. Assistive technology
  still hears that they are unavailable.
*/
// The icon button's box, with no corners of its own; ICON_SHAPE adds them.
export const ICON_BOX =
  'inline-grid flex-none cursor-pointer place-items-center p-0';
export const ICON_SHAPE = `${ICON_BOX} rounded-icon`;

/*
  The quiet face: a wash on hover or keyboard focus, nothing at rest. The two
  are one state -- the app draws no focus outline of its own, so focus is this
  wash (see :focus-visible in app/styles/base.css). It carries the transition,
  so a pressed or open square recolours the same background -- the sidebar's
  Save-order and search toggles -- rather than adding a face that would trail it.
*/
export const ICON_QUIET =
  'control-wash text-icon-quiet-ink hover:bg-surface-selected hover:text-icon-quiet-ink-hover focus-visible:bg-surface-selected focus-visible:text-icon-quiet-ink-hover';
