'use client';

import { Button as AriaButton, type ButtonProps } from 'react-aria-components';

import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex h-9 min-w-11 items-center justify-center gap-2 px-3.5 text-dense font-medium whitespace-nowrap transition-colors duration-150 outline-none data-[focus-visible]:outline-solid data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus data-[disabled]:cursor-not-allowed';

const variants: Record<Variant, string> = {
  // Neutral graphite face with the complete encased edge.
  primary:
    'edge-2 rounded-control bg-action text-inverse data-[hovered]:bg-action-hover data-[pressed]:[--edge-strength:0.2] data-[disabled]:[--edge-strength:0] data-[disabled]:border-rule-default data-[disabled]:bg-surface-disabled data-[disabled]:text-muted',
  // Opaque control surface with a quiet inner edge.
  secondary:
    'edge-1 rounded-section bg-surface-control text-primary data-[hovered]:border-rule-strong data-[pressed]:bg-surface-selected data-[disabled]:[--edge-strength:0] data-[disabled]:bg-surface-disabled data-[disabled]:text-muted',
};

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonProps & { variant?: Variant; className?: string }) {
  return (
    <AriaButton {...props} className={cx(base, variants[variant], className)} />
  );
}
