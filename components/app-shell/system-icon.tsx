'use client';

import {
  createContext,
  use,
  type AriaAttributes,
  type ComponentType,
  type ReactNode,
} from 'react';
// Deep imports: Blode's barrel is the whole ~4000-icon library and is not on
// Next's `optimizePackageImports` list, so the subpath export is what keeps the
// app from compiling the entire set.
import BarcodeFilled from 'blode-icons-react/icons/barcode-filled';
import BookFilled from 'blode-icons-react/icons/book-filled';
import Box2Filled from 'blode-icons-react/icons/box-2-filled';
import Chart2Filled from 'blode-icons-react/icons/chart-2-filled';
import ChatBubble7Filled from 'blode-icons-react/icons/chat-bubble-7-filled';
import ChecklistFilled from 'blode-icons-react/icons/checklist-filled';
import ContactsFilled from 'blode-icons-react/icons/contacts-filled';
import CreditCard1Filled from 'blode-icons-react/icons/credit-card-1-filled';
import Email1Filled from 'blode-icons-react/icons/email-1-filled';
import LawFilled from 'blode-icons-react/icons/law-filled';
import ReceiptBillFilled from 'blode-icons-react/icons/receipt-bill-filled';
import ShoppingBag1Filled from 'blode-icons-react/icons/shopping-bag-1-filled';
import Store1Filled from 'blode-icons-react/icons/store-1-filled';
import TagFilled from 'blode-icons-react/icons/tag-filled';
import TruckFilled from 'blode-icons-react/icons/truck-filled';
import type { IconKey } from '@/lib/process/system-links';

// Narrow on purpose. A disc passes nothing but the hidden flag, and the
// candidate families type their props differently — Tabler omits `stroke`,
// Phosphor adds `weight`, Blode adds `absoluteStrokeWidth`. Asking only for
// what is actually passed is what lets all of them satisfy one type. React's own
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

export const BLODE_ICONS: IconSet = {
  catalogue: BookFilled,
  shortlist: ChecklistFilled,
  forecast: Chart2Filled,
  supply: Box2Filled,
  // No invoice; a receipt is the nearest document with a total on it.
  supplier: ReceiptBillFilled,
  // No cart in the filled set, so a bag stands for the sales channel.
  channel: ShoppingBag1Filled,
  note: ChatBubble7Filled,
  policy: LawFilled,
  storefront: Store1Filled,
  pricebook: TagFilled,
  labels: BarcodeFilled,
  portal: TruckFilled,
  queue: Email1Filled,
  // No ID card; a contact record is the nearest thing that identifies a person.
  identity: ContactsFilled,
  billing: CreditCard1Filled,
};

// Defaulted rather than required, so nothing outside the workbench has to know
// that a choice exists — and so the alternates stay out of the app's bundle.
const IconSetContext = createContext<IconSet>(BLODE_ICONS);

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
