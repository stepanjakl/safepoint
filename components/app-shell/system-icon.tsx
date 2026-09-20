'use client';

import type { AriaAttributes, ComponentType } from 'react';
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
import MegaphoneFilled from 'blode-icons-react/icons/megaphone-filled';
import ReceiptBillFilled from 'blode-icons-react/icons/receipt-bill-filled';
import ShoppingBag1Filled from 'blode-icons-react/icons/shopping-bag-1-filled';
import Store1Filled from 'blode-icons-react/icons/store-1-filled';
import TagFilled from 'blode-icons-react/icons/tag-filled';
import TruckFilled from 'blode-icons-react/icons/truck-filled';
import type { IconKey } from '@/lib/process/system-links';

// A disc passes nothing but the hidden flag, so the shared vocabulary asks each
// shipped icon for no broader interface than that.
type SystemIconComponent = ComponentType<Pick<AriaAttributes, 'aria-hidden'>>;

type IconSet = Record<IconKey, SystemIconComponent>;

const ICONS: IconSet = {
  brief: MegaphoneFilled,
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

export function SystemIcon({ icon }: { icon: IconKey }) {
  const Component = ICONS[icon] ?? ICONS.note;
  // No stroke prop: these are solid paths, so weight comes from the glyph.
  return <Component aria-hidden="true" />;
}
