import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

/*
  The one repeated structural device: a compact inset band with a readout
  title on the left and metadata or a count on the right.
*/
export function SectionBand({
  title,
  meta,
  id,
  as: Heading = 'h3',
  className,
}: {
  title: string;
  meta?: ReactNode;
  id?: string;
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
}) {
  return (
    <div
      className={cx(
        'border-rule-default bg-surface-inset flex min-h-8 items-center justify-between gap-4 border-b px-4 py-1.5',
        className,
      )}
    >
      <Heading id={id} className="readout text-muted">
        {title}
      </Heading>
      {meta ? (
        <div className="readout text-muted text-right">{meta}</div>
      ) : null}
    </div>
  );
}
