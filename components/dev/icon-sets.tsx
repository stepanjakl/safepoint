'use client';

// Candidate icon families for the system discs, held here rather than beside
// the shipped Tabler set so that only the workbench pulls them in. The app
// imports `TABLER_ICONS` and never reaches this module.
//
// Every set spells the same fifteen nouns. Where a family has no word for one,
// the substitute is named in a comment: that gap is the thing being compared,
// and it is the reason a set is a complete record rather than a partial one.
import {
  Barcode,
  Book,
  ChartLine,
  ChatCircleText,
  ClipboardText,
  CreditCard,
  Envelope,
  IdentificationCard,
  Invoice,
  Package,
  Scales,
  ShoppingCart,
  Storefront,
  Tag,
  Truck,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import {
  RiBarcodeFill,
  RiBankCardFill,
  RiBillFill,
  RiBookFill,
  RiChat3Fill,
  RiFileListFill,
  RiIdCardFill,
  RiLineChartFill,
  RiMailFill,
  RiPriceTag3Fill,
  RiScales3Fill,
  RiShoppingCartFill,
  RiStackFill,
  RiStore2Fill,
  RiTruckFill,
} from '@remixicon/react';
// Deep imports: Blode's barrel is the whole ~4000-icon library and is not on
// Next's `optimizePackageImports` list, so the subpath export is what keeps a
// workbench page from compiling the entire set.
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
import {
  TABLER_ICONS,
  type IconSet,
  type SystemIconComponent,
} from '@/components/app-shell/system-icon';

// Phosphor draws one glyph at five weights rather than shipping a separate
// filled set, so the family is only comparable to the others once `fill` is
// bound. Doing it here keeps the disc ignorant of which family it is rendering.
const filled = (Component: PhosphorIcon): SystemIconComponent =>
  function FilledPhosphorIcon(props) {
    return <Component weight="fill" {...props} />;
  };

const PHOSPHOR_ICONS: IconSet = {
  catalogue: filled(Book),
  shortlist: filled(ClipboardText),
  forecast: filled(ChartLine),
  supply: filled(Package),
  supplier: filled(Invoice),
  channel: filled(ShoppingCart),
  note: filled(ChatCircleText),
  policy: filled(Scales),
  storefront: filled(Storefront),
  pricebook: filled(Tag),
  labels: filled(Barcode),
  portal: filled(Truck),
  queue: filled(Envelope),
  identity: filled(IdentificationCard),
  billing: filled(CreditCard),
};

const REMIX_ICONS: IconSet = {
  catalogue: RiBookFill,
  shortlist: RiFileListFill,
  forecast: RiLineChartFill,
  supply: RiStackFill,
  supplier: RiBillFill,
  channel: RiShoppingCartFill,
  note: RiChat3Fill,
  policy: RiScales3Fill,
  storefront: RiStore2Fill,
  pricebook: RiPriceTag3Fill,
  labels: RiBarcodeFill,
  portal: RiTruckFill,
  queue: RiMailFill,
  identity: RiIdCardFill,
  billing: RiBankCardFill,
};

const BLODE_ICONS: IconSet = {
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

export const ICON_LIBRARIES = ['tabler', 'phosphor', 'remix', 'blode'] as const;

export type IconLibrary = (typeof ICON_LIBRARIES)[number];

export const ICON_LIBRARY_SETS: Record<IconLibrary, IconSet> = {
  tabler: TABLER_ICONS,
  phosphor: PHOSPHOR_ICONS,
  remix: REMIX_ICONS,
  blode: BLODE_ICONS,
};

// The note says what each family costs and where it gives way, because that is
// the part of the comparison the rendered discs cannot show.
export const ICON_LIBRARY_NOTES: Record<
  IconLibrary,
  { label: string; note: string }
> = {
  tabler: {
    label: 'Tabler — current',
    note: 'Filled set is ~1000 of ~6000. No storefront and no barcode, so the channel cart is reused for the storefront and a label tag stands in for the print queue.',
  },
  phosphor: {
    label: 'Phosphor',
    note: 'One glyph at five weights rather than a separate filled set; `fill` is bound per set. Spells every noun, including invoice and storefront.',
  },
  remix: {
    label: 'Remix',
    note: 'Paired Fill/Line naming across the whole set. Heavier, more uniformly geometric, and the only family here with a purpose-built price tag.',
  },
  blode: {
    label: 'Blode',
    note: 'Lucide-compatible props, filled variants throughout. Newest and smallest of the four: no invoice and no ID card, so two nouns are substitutes.',
  },
};
