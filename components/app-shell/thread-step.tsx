// A client component for the marker's sake: `Focusable` resolves its single
// child on the client, and a child handed to it from a server component
// arrives unresolved. The step's box is still server-rendered -- it comes in
// as `children` and is never touched here.
'use client';

import type { ReactNode } from 'react';
import { Glyph } from '@/components/ui/glyph';
import { Tooltip } from '@/components/ui/tooltip';
import { stepMarker, toneText } from '@/components/review/markers';
import {
  STEP_STATUS_LABELS,
  type ProcessStep,
} from '@/lib/process/placeholder-process';
import { cx } from '@/lib/cx';

/*
  One step of the run, on a timeline. The marker is the only thing in the rail:
  a disc on a line with the name and its label beside it, and the step's box
  beneath.

  The disc is the system disc one level up -- the same enclosure, the same
  reveal on hover and on focus -- so a mark that carries state looks the same
  wherever it appears. It holds a glyph rather than a bare colour, because
  colour alone would leave the status unreadable to anyone who cannot see it,
  and it is focusable because a hover-only reveal puts the status word out of
  reach of a keyboard.
*/
function Marker({ step }: { step: ProcessStep }) {
  const marker = stepMarker[step.status];
  const status = STEP_STATUS_LABELS[step.status];
  return (
    <Tooltip label={status} description={step.note} placement="right">
      <span
        className={cx('thread-dot', toneText[marker.tone])}
        tabIndex={0}
        role="img"
        aria-label={`${step.name}. ${status}.${step.note ? ` ${step.note}` : ''}`}
      >
        <Glyph name={marker.glyph} />
      </span>
    </Tooltip>
  );
}

export function ThreadStep({
  step,
  children,
}: {
  step: ProcessStep;
  children: ReactNode;
}) {
  return (
    <li className="thread-step">
      <span className="thread-marker">
        <Marker step={step} />
      </span>
      {/* The name sits above the box rather than inside it, so the box stays
          whatever it needs to be -- a card, a message, a placeholder -- and
          the timeline still reads as one column of named steps. */}
      <p className="thread-step-name">
        {step.name}
        {step.label ? (
          <span className="text-muted text-[12px] font-normal">
            {step.label}
          </span>
        ) : null}
      </p>
      <div className="thread-step-body">{children}</div>
    </li>
  );
}
