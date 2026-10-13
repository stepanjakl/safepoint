import Check from 'blode-icons-react/icons/checkmark-1-small';
import Cross from 'blode-icons-react/icons/cross-small';
import { Button as AriaButton } from 'react-aria-components';
import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/lib/cx';

const DECISION = {
  accept: { severity: 3, Icon: Check },
  deny: { severity: 0, Icon: Cross },
} as const;

export function DecisionButton({
  decision,
  size,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof AriaButton>, 'children' | 'className'> & {
  decision: keyof typeof DECISION;
  // A step smaller, for decisions repeated down a table's rows.
  size?: 'small';
  children: ReactNode;
  className?: string;
}) {
  const { severity, Icon } = DECISION[decision];
  return (
    <AriaButton
      {...props}
      data-severity={severity}
      className={cx(
        'control-face control-hairline control-tone text-severity-ink interact:control-tone-hover interact:control-tone-ink-hover data-[disabled]:control-off data-[disabled]:text-muted inline-flex cursor-pointer items-center gap-1 rounded-full font-medium whitespace-nowrap data-[disabled]:cursor-not-allowed',
        size === 'small'
          ? 'text-meta h-7 pr-2.5 pl-2'
          : 'text-dense h-8 pr-3.5 pl-2.5',
        className,
      )}
    >
      <Icon
        aria-hidden
        size={size === 'small' ? 12 : 14}
        strokeWidth={2.75}
        className="flex-none opacity-70"
      />
      {children}
    </AriaButton>
  );
}
