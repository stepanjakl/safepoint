'use client';

// Candidate icon families for the system discs, held here rather than beside
// the shipped Blode set so that only the workbench pulls them in. The app
// imports `BLODE_ICONS` and never reaches this module.
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
// Barrel import on purpose: Tabler ships no per-icon type declarations, and
// `@tabler/icons-react` is in Next's default `optimizePackageImports` list, so
// this is rewritten to per-icon imports at build time.
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
// Deep imports: MingCute's barrel re-exports both styles, several thousand
// modules, and is not on Next's `optimizePackageImports` list.
import MingcuteBankCard from '@mingcute/react/core-filled/bank-card';
import MingcuteBarcode from '@mingcute/react/core-filled/barcode';
import MingcuteBill from '@mingcute/react/core-filled/bill';
import MingcuteBook from '@mingcute/react/core-filled/book';
import MingcuteBox from '@mingcute/react/core-filled/box';
import MingcuteChartLine from '@mingcute/react/core-filled/chart-line';
import MingcuteChat from '@mingcute/react/core-filled/chat-1';
import MingcuteClipboard from '@mingcute/react/core-filled/clipboard';
import MingcuteIdcard from '@mingcute/react/core-filled/idcard';
import MingcuteMail from '@mingcute/react/core-filled/mail';
import MingcuteScale from '@mingcute/react/core-filled/scale';
import MingcuteShoppingCart from '@mingcute/react/core-filled/shopping-cart-1';
import MingcuteStore from '@mingcute/react/core-filled/store';
import MingcuteTag from '@mingcute/react/core-filled/tag';
import MingcuteTruck from '@mingcute/react/core-filled/truck';
import {
  BLODE_ICONS,
  type IconSet,
  type SystemIconComponent,
} from '@/components/app-shell/system-icon';

// Tabler's filled set is ~1000 of its ~6000 icons and skews to UI primitives,
// so a few of these are the nearest filled noun rather than the exact one the
// stroke set offered: boxes for a stock position, a cart for a storefront, a
// message for an operational note.
const TABLER_ICONS: IconSet = {
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

const MINGCUTE_ICONS: IconSet = {
  catalogue: MingcuteBook,
  shortlist: MingcuteClipboard,
  forecast: MingcuteChartLine,
  supply: MingcuteBox,
  supplier: MingcuteBill,
  channel: MingcuteShoppingCart,
  note: MingcuteChat,
  policy: MingcuteScale,
  storefront: MingcuteStore,
  pricebook: MingcuteTag,
  labels: MingcuteBarcode,
  portal: MingcuteTruck,
  queue: MingcuteMail,
  identity: MingcuteIdcard,
  billing: MingcuteBankCard,
};

export const ICON_LIBRARIES = [
  'blode',
  'tabler',
  'phosphor',
  'remix',
  'mingcute',
] as const;

export type IconLibrary = (typeof ICON_LIBRARIES)[number];

export const ICON_LIBRARY_SETS: Record<IconLibrary, IconSet> = {
  blode: BLODE_ICONS,
  tabler: TABLER_ICONS,
  phosphor: PHOSPHOR_ICONS,
  remix: REMIX_ICONS,
  mingcute: MINGCUTE_ICONS,
};

// The note says what each family costs and where it gives way, because that is
// the part of the comparison the rendered discs cannot show.
export const ICON_LIBRARY_NOTES: Record<
  IconLibrary,
  { label: string; note: string }
> = {
  blode: {
    label: 'Blode — current',
    note: 'Lucide-compatible props, filled variants throughout. No invoice and no ID card, so two nouns are substitutes.',
  },
  tabler: {
    label: 'Tabler',
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
  mingcute: {
    label: 'MingCute',
    note: 'Paired Regular/Filled styles on a 24px grid with softly rounded corners. Spells every noun directly — bill, scale, store, barcode and ID card included.',
  },
};
