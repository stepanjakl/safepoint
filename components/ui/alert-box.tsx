import type { ReactNode } from 'react';

import { cx } from '@/lib/ui/cx';

import { SEVERITY, type Tone } from './pill';

export type AlertBoxTone =
  Exclude<Tone, 'ready' | 'neutral'> | 'accent' | 'neutral';

/*
  A bordered, tinted callout card used across the app: errors and warnings
  (severity tones `blocked` / `decision`, announced as `role="alert"`),
  accented suggestions (`accent`, cyan), and quiet neutral notes (`neutral`,
  such as model thinking). A title and optional `trailing` controls share the
  top row; the body spans full width underneath; `action` sits below.
*/
export function AlertBox({
  tone = 'blocked',
  size = 'default',
  role,
  title,
  trailing,
  action,
  className,
  children,
}: {
  tone?: AlertBoxTone;
  size?: 'default' | 'compact';
  role?: 'alert' | 'region' | 'note';
  title?: ReactNode;
  trailing?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const compact = size === 'compact';
  const isSeverity = tone === 'blocked' || tone === 'decision';
  const resolvedRole = role ?? (isSeverity ? 'alert' : undefined);
  return (
    <div
      role={resolvedRole}
      data-severity={isSeverity ? SEVERITY[tone] : undefined}
      data-tone={isSeverity ? undefined : tone}
      className={cx(
        'alert-box grid border text-pretty',
        isSeverity && 'bg-severity-fill border-severity-pill-ring',
        compact
          ? 'rounded-control gap-2 px-3 py-2'
          : 'rounded-shell gap-3 px-4.5 py-3.5',
        className,
      )}
    >
      <div className="grid min-w-0 gap-1.5">
        {title || trailing ? (
          <div className="flex min-w-0 items-center justify-between gap-3">
            {title ? (
              <div
                className={cx(
                  'alert-box-title min-w-0 flex-1 font-medium',
                  isSeverity && 'text-severity-strong',
                  compact ? 'text-meta' : 'text-dense',
                )}
              >
                {title}
              </div>
            ) : (
              <span />
            )}
            {trailing ? <div className="flex-none">{trailing}</div> : null}
          </div>
        ) : null}
        {children ? (
          <div
            className={cx(
              'alert-box-ink min-w-0 break-words',
              isSeverity && 'text-severity-ink',
              compact ? 'text-meta' : 'text-dense',
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="justify-self-start">{action}</div> : null}
    </div>
  );
}
