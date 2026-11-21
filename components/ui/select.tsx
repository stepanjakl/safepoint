import type { ComponentPropsWithRef } from 'react';
import ChevronDown from 'blode-icons-react/icons/chevron-down';

import { cx } from '@/lib/ui/cx';

const SIZES = {
  small: 'min-h-7',
  medium: 'min-h-8',
  large: 'min-h-9',
} as const;

export type SelectSize = keyof typeof SIZES;

/**
 * Native `<select>` styled as `.field` with a custom `blode-icons-react` chevron
 * aligned inside the trailing edge.
 */
export function Select({
  size = 'medium',
  className,
  children,
  ...props
}: Omit<ComponentPropsWithRef<'select'>, 'size'> & {
  size?: SelectSize;
}) {
  return (
    <span className={cx('group relative inline-grid items-center', className)}>
      <select
        {...props}
        className={cx(
          'field text-dense col-start-1 row-start-1 w-full min-w-0 appearance-none py-1 pr-7 pl-2.5',
          SIZES[size],
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={14}
        strokeWidth={2.25}
        className="text-muted group-has-[select:enabled:hover]:text-primary group-has-[select:focus-visible]:text-primary pointer-events-none col-start-1 row-start-1 mr-2.5 justify-self-end transition-colors group-has-[select:disabled]:opacity-60"
      />
    </span>
  );
}
