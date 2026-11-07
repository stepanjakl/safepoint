import ChainLink1Filled from 'blode-icons-react/icons/chain-link-1-filled';
import type { ComponentPropsWithRef } from 'react';

import { cx } from '@/lib/cx';

export function ExternalLink({
  children,
  className,
  ...props
}: Omit<ComponentPropsWithRef<'a'>, 'target' | 'rel'> & { href: string }) {
  return (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'external-link text-meta inline-flex items-center gap-1.5 font-medium',
        className,
      )}
    >
      {children}
      <ChainLink1Filled aria-hidden size={14} className="flex-none" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
