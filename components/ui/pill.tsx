import type { ComponentPropsWithRef } from 'react';

import { cx } from '@/lib/ui/cx';

import { MorphingLabel, plainLabel } from './morphing-text';

/*
  A short state or label on its tone's rungs (severity.css), or neutral on its
  own ramp steps without participating in severity. Filled for a state; ringed
  for context, such as what failing a check would do, so it does not read as a
  verdict on this run; dashed for a queued placeholder. An icon goes first in
  its children, with `me-1`.

  Pills drawn with motion of their own -- a thread step's facts, a release
  row's count, a cross-checked value -- keep their stylesheets and take their
  colours from the same rungs.

  Like those, a pill eases into a new tone (control-wash: the state duration,
  ease-out) and morphs words that change, so a verdict or a count never jumps.
  Its face, ring and ink follow the ground it sits on (severity.css), so it
  keeps its distance on a pane, a card, a recess or a band.
*/

export type Tone = 'blocked' | 'decision' | 'neutral' | 'ready';
export type PillTone = Tone | 'advisory';
export const SEVERITY: Record<Tone, number> = {
  blocked: 0,
  decision: 1,
  neutral: 2,
  ready: 3,
};

const SIZE = {
  default: 'text-meta px-2 py-0.5',
  compact: 'text-micro h-5 px-2',
} as const;

const SEVERITY_FACE = {
  filled: 'bg-severity-pill text-severity-pill-ink font-label',
  ringed: 'ring-severity-pill-ring text-severity-pill-ink ring-1 ring-inset',
  dashed: 'pill-dashed text-severity-pill-ink font-label',
} as const;

const NEUTRAL_FACE = {
  filled: 'bg-neutral-pill text-neutral-pill-ink font-label',
  ringed: 'ring-neutral-pill-ring text-neutral-pill-ink ring-1 ring-inset',
  dashed: 'pill-dashed text-muted font-label',
} as const;

const ADVISORY_FACE = {
  filled: 'bg-tried-face text-state-advisory font-label',
  ringed: 'ring-neutral-pill-ring text-state-advisory ring-1 ring-inset',
  dashed: 'pill-dashed text-state-advisory font-label',
} as const;

const INTERACTIVE = {
  severity:
    'hover:bg-severity-pill-hover hover:text-severity-pill-strong focus-visible:bg-severity-pill-hover focus-visible:text-severity-pill-strong cursor-default',
  neutral:
    'hover:bg-neutral-pill-hover hover:text-neutral-pill-strong focus-visible:bg-neutral-pill-hover focus-visible:text-neutral-pill-strong cursor-default',
  advisory: 'cursor-default',
} as const;

export function Pill({
  tone,
  variant = 'filled',
  size = 'default',
  interactive = false,
  className,
  children,
  ...props
}: ComponentPropsWithRef<'span'> & {
  tone: PillTone;
  variant?: keyof typeof SEVERITY_FACE;
  size?: keyof typeof SIZE;
  // A pill that opens a tooltip answers the pointer and focus.
  interactive?: boolean;
}) {
  const isNeutral = tone === 'neutral';
  const isAdvisory = tone === 'advisory';
  const face = isNeutral
    ? NEUTRAL_FACE[variant]
    : isAdvisory
      ? ADVISORY_FACE[variant]
      : SEVERITY_FACE[variant];
  const interactiveClasses = interactive
    ? isNeutral
      ? INTERACTIVE.neutral
      : isAdvisory
        ? INTERACTIVE.advisory
        : INTERACTIVE.severity
    : undefined;

  return (
    <span
      {...props}
      data-severity={isNeutral || isAdvisory ? undefined : SEVERITY[tone]}
      className={cx(
        'pill-shape control-wash',
        SIZE[size],
        face,
        interactiveClasses,
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
