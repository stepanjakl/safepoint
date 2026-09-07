'use client';

import { Button as AriaButton, type ButtonProps } from 'react-aria-components';

import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary';

// No transition utility here: control-face owns the timing, because the
// gradient stops it animates are its own contract.
const base =
  'inline-flex h-9 min-w-11 items-center justify-center gap-2 px-3.5 text-dense font-medium whitespace-nowrap outline-none data-[focus-visible]:outline-solid data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus data-[disabled]:cursor-not-allowed data-[disabled]:control-off data-[disabled]:text-muted';

const variants: Record<Variant, string> = {
  // The one accented control on a page: a lit face with a brighter ring.
  primary:
    'control-face control-accent rounded-control text-white data-[hovered]:control-accent-hover data-[pressed]:control-accent-hover',
  // Everything else: the same construction, one step quieter.
  secondary:
    'control-face control-quiet rounded-section text-primary data-[hovered]:control-quiet-hover data-[pressed]:control-quiet-hover',
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
