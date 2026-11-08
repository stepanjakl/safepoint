import type { ComponentPropsWithRef } from 'react';

import { cx } from '@/lib/cx';

import { MorphingLabel, plainLabel } from './morphing-text';

/*
  A short state or label on its tone's rungs (severity.css). Filled for a
  state; ringed for context, such as what failing a check would do, so it
  does not read as a verdict on this run. An icon goes first in its children,
  with `me-1`.

  Pills drawn with motion of their own -- a thread step's facts, a release
  row's count, a cross-checked value -- keep their stylesheets and take their
  colours from the same rungs.

  Like those, a pill eases into a new tone (control-wash: the state duration,
  ease-out) and morphs words that change, so a verdict or a count never jumps.
  Its face, ring and ink follow the ground it sits on (severity.css), so it
  keeps its distance on a pane, a card, a recess or a band.
*/

export type Tone = 'blocked' | 'decision' | 'neutral' | 'ready';
export const SEVERITY: Record<Tone, number> = {
  blocked: 0,
  decision: 1,
  neutral: 2,
  ready: 3,
};

const FACE = {
  filled: 'bg-severity-pill font-medium',
  ringed: 'ring-severity-pill-ring ring-1 ring-inset',
} as const;

export function Pill({
  tone,
  variant = 'filled',
  interactive = false,
  className,
  children,
  ...props
}: ComponentPropsWithRef<'span'> & {
  tone: Tone;
  variant?: keyof typeof FACE;
  // A pill that opens a tooltip answers the pointer and focus.
  interactive?: boolean;
}) {
  return (
    <span
      {...props}
      data-severity={SEVERITY[tone]}
      className={cx(
        'pill-shape control-wash text-severity-pill-ink text-meta px-2 py-0.5',
        FACE[variant],
        interactive &&
          'hover:bg-severity-pill-hover hover:text-severity-pill-strong focus-visible:bg-severity-pill-hover focus-visible:text-severity-pill-strong cursor-default',
        className,
      )}
    >
      {plainLabel(children) === null ? (
        children
      ) : (
        <MorphingLabel text={plainLabel(children)!} />
      )}
    </span>
  );
}
