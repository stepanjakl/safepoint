import Check from 'blode-icons-react/icons/checkmark-1-small';
import Cross from 'blode-icons-react/icons/cross-small';
import { Button as AriaButton } from 'react-aria-components';
import type { ComponentProps, ReactNode } from 'react';

import { MorphingLabel, plainLabel } from '@/components/ui/morphing-text';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';

const DECISION = {
  accept: { severity: 3, Icon: Check },
  deny: { severity: 0, Icon: Cross },
} as const;

/*
  With `label` and no words, only its mark: the label is its accessible name
  and its tooltip, for decisions repeated down a table's rows.
*/
export function DecisionButton({
  decision,
  size,
  label,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof AriaButton>, 'children' | 'className'> & {
  decision: keyof typeof DECISION;
  // A step smaller, for decisions repeated down a table's rows.
  size?: 'small';
  className?: string;
} & (
    { label: string; children?: never } | { label?: never; children: ReactNode }
  )) {
  const { severity, Icon } = DECISION[decision];
  const button = (
    <AriaButton
      {...props}
      aria-label={label}
      data-severity={severity}
      className={cx(
        'control-face control-hairline control-tone text-severity-ink interact:control-tone-hover interact:control-tone-ink-hover data-[disabled]:control-off data-[disabled]:text-muted inline-flex cursor-pointer items-center gap-1 font-medium whitespace-nowrap data-[disabled]:cursor-not-allowed',
        label
          ? 'rounded-icon size-7.5 justify-center'
          : size === 'small'
            ? 'text-meta rounded-control h-7 pr-2.5 pl-2'
            : 'text-dense rounded-icon h-8 pr-3.5 pl-2.5',
        className,
      )}
    >
      <Icon
        aria-hidden
        size={label ? 14 : size === 'small' ? 12 : 14}
        strokeWidth={2.75}
        className={cx('flex-none', !label && 'opacity-70')}
      />
      {plainLabel(children) === null ? (
        children
      ) : (
        <MorphingLabel text={plainLabel(children)!} />
      )}
    </AriaButton>
  );
  return label ? (
    <Tooltip label={label} placement="top">
      {button}
    </Tooltip>
  ) : (
    button
  );
}
