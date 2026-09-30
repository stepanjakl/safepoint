import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

/*
  Aligned label/value rows on faint rules. Labels sit in a fixed column at
  container widths of 28rem and above, and stack above the value below that.
*/
export function Ledger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cx('@container', className)}>{children}</dl>;
}

export function LedgerRow({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'border-rule-faint grid gap-x-4 gap-y-1 border-b px-4 py-2 last:border-b-0 @md:grid-cols-[9rem_minmax(0,1fr)]',
        className,
      )}
    >
      <dt className="text-meta text-muted @md:pt-0.5">{label}</dt>
      <dd className="text-dense min-w-0">{children}</dd>
    </div>
  );
}
