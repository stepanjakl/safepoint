import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import { SEVERITY, type Tone } from './pill';

/*
  Something that went wrong, said where it happened: a box tinted in its
  tone, with a ring and the tone's ink, first in what it concerns so it is
  read before anything below it. A title says what happened; the body, what
  is known of it; an action, when there is one, what can be done now.
  Announced as an alert, since it arrives with the change it reports.
*/
export function AlertBox({
  tone = 'blocked',
  title,
  action,
  className,
  children,
}: {
  tone?: Exclude<Tone, 'ready' | 'neutral'>;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      data-severity={SEVERITY[tone]}
      className={cx(
        'bg-severity-fill border-severity-pill-ring text-severity-ink rounded-control text-meta grid justify-items-start gap-1.5 border px-3 py-2 text-pretty',
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children}
      {action ? <div className="pt-0.5">{action}</div> : null}
    </div>
  );
}
