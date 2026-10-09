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
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof AriaButton>, 'children' | 'className'> & {
  decision: keyof typeof DECISION;
  children: ReactNode;
  className?: string;
}) {
  const { severity, Icon } = DECISION[decision];
  return (
    <AriaButton
      {...props}
      data-severity={severity}
      className={cx(
        'control-face control-hairline control-tone text-severity-ink interact:control-tone-hover interact:control-tone-ink-hover data-[disabled]:control-off data-[disabled]:text-muted text-dense inline-flex h-8 cursor-pointer items-center gap-1 rounded-full pr-3.5 pl-2.5 font-medium whitespace-nowrap data-[disabled]:cursor-not-allowed',
        className,
      )}
    >
      <Icon
        aria-hidden
        size={14}
        strokeWidth={2.75}
        className="flex-none opacity-70"
      />
      {children}
    </AriaButton>
  );
}
