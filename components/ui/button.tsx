'use client';

import { Button as AriaButton, type ButtonProps } from 'react-aria-components';

import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary';

// --edge-face and --edge-strength are registered in tokens.css, so listing them
// here means the face and the rim settle with the colours instead of snapping.
const base =
  'inline-flex h-9 min-w-11 items-center justify-center gap-2 px-3.5 text-dense font-medium whitespace-nowrap transition-[background-color,border-color,color,--edge-face,--edge-strength] duration-150 outline-none data-[focus-visible]:outline-solid data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus data-[disabled]:cursor-not-allowed data-[disabled]:bg-surface-disabled data-[disabled]:text-muted data-[disabled]:[--edge-strength:0] data-[disabled]:[--edge-rule:var(--sp-rule-default)]';

const variants: Record<Variant, string> = {
  // Graphite face inside the encased edge. --edge-face matches the fill so the
  // rim stays confined to the ring; the two move together.
  primary:
    'edge-2 rounded-control bg-action [--edge-face:var(--sp-action)] text-white data-[hovered]:bg-action-hover data-[hovered]:[--edge-face:var(--sp-action-hover)] data-[pressed]:[--edge-strength:0.2] data-[disabled]:[--edge-face:var(--sp-surface-disabled)]',
  // Flat control surface: a solid rule, no rim. The direction reserves the
  // encased edge for high-priority actions.
  secondary:
    'edge-1 rounded-section bg-surface-control text-primary data-[hovered]:border-rule-strong data-[pressed]:bg-surface-selected',
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
