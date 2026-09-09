'use client';

import {
  createContext,
  use,
  type AriaAttributes,
  type ComponentType,
  type ReactNode,
} from 'react';
// Barrel import on purpose: Tabler ships no per-icon type declarations, and
// `@tabler/icons-react` is in Next's default `optimizePackageImports` list, so
// this is rewritten to per-icon imports at build time.
//
// Tabler's filled set is ~1000 of its ~6000 icons and skews to UI primitives,
// so a few of these are the nearest filled noun rather than the exact one the
// stroke set offered: boxes for a stock position, a cart for a storefront, a
// message for an operational note.
import {
  IconBookFilled,
  IconBoxMultipleFilled,
  IconChartAreaFilled,
  IconClipboardListFilled,
  IconCreditCardFilled,
  IconFileInvoiceFilled,
  IconIdFilled,
  IconLabelFilled,
  IconMailFilled,
  IconMessageFilled,
  IconScaleFilled,
  IconShoppingCartFilled,
  IconTagFilled,
  IconTruckFilled,
} from '@tabler/icons-react';
import type { IconKey } from '@/lib/process/system-links';

// Narrow on purpose. A disc passes nothing but the hidden flag, and the four
// candidate families type their props differently — Tabler omits `stroke`,
// Phosphor adds `weight`, Blode adds `absoluteStrokeWidth`. Asking only for
// what is actually passed is what lets all four satisfy one type. React's own
// `aria-hidden` is what widens it: Remix's icons are class components, whose
// `defaultProps` make the prop invariant, so a literal `'true'` would exclude
// the family for a reason that has nothing to do with how it draws.
export type SystemIconComponent = ComponentType<
  Pick<AriaAttributes, 'aria-hidden'>
>;

// A set is the whole vocabulary in one family's hand. Complete by construction:
// a family that cannot spell one of these nouns has to say so with a substitute
// rather than fall through to another family's glyph.
export type IconSet = Record<IconKey, SystemIconComponent>;

export const TABLER_ICONS: IconSet = {
  catalogue: IconBookFilled,
  shortlist: IconClipboardListFilled,
  forecast: IconChartAreaFilled,
  supply: IconBoxMultipleFilled,
  supplier: IconFileInvoiceFilled,
  channel: IconShoppingCartFilled,
  note: IconMessageFilled,
  policy: IconScaleFilled,
  pricebook: IconTagFilled,
  storefront: IconShoppingCartFilled,
  labels: IconLabelFilled,
  portal: IconTruckFilled,
  queue: IconMailFilled,
  identity: IconIdFilled,
  billing: IconCreditCardFilled,
};

// Defaulted rather than required, so nothing outside the workbench has to know
// that a choice exists — and so the alternates stay out of the app's bundle.
const IconSetContext = createContext<IconSet>(TABLER_ICONS);

export function IconSetProvider({
  set,
  children,
}: {
  set: IconSet;
  children: ReactNode;
}) {
  return <IconSetContext value={set}>{children}</IconSetContext>;
}

export function SystemIcon({ icon }: { icon: IconKey }) {
  const set = use(IconSetContext);
  // The fallback stays inside the chosen family: an unrecognised key is a data
  // problem, and borrowing a glyph from another family would hide it behind a
  // seam in the drawing instead.
  const Component = set[icon] ?? set.note;
  // No stroke prop: these are solid paths, so weight comes from the glyph.
  return <Component aria-hidden="true" />;
}
