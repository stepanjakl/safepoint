/*
  What every part of the sidebar shares: its icon set, the rail cell every icon
  centres in, and the shapes that repeat across the parts. Styles for these live
  in process-menu.css, beside the menu that owns them.
*/

// Deep imports: Blode's barrel is the whole ~4000-icon library and is not on
// Next's `optimizePackageImports` list, so the subpath export is what keeps the
// sidebar from compiling the entire set.
import ChevronLeft from 'blode-icons-react/icons/chevron-left';
import ChevronRight from 'blode-icons-react/icons/chevron-right';
import CircleInfo from 'blode-icons-react/icons/circle-info';
import CodeTree from 'blode-icons-react/icons/code-tree';
import CodeTreeFilled from 'blode-icons-react/icons/code-tree-filled';
import Connectors1 from 'blode-icons-react/icons/connectors-1';
import Connectors1Filled from 'blode-icons-react/icons/connectors-1-filled';
import DotGrid1x3HorizontalFilled from 'blode-icons-react/icons/dot-grid-1x3-horizontal-filled';
import FileText from 'blode-icons-react/icons/file-text';
import FileTextFilled from 'blode-icons-react/icons/file-text-filled';
import History from 'blode-icons-react/icons/history';
import HistoryFilled from 'blode-icons-react/icons/history-filled';
import MagnifyingGlass from 'blode-icons-react/icons/magnifying-glass';
import PlusMedium from 'blode-icons-react/icons/plus-medium';
import ShieldCheck from 'blode-icons-react/icons/shield-check';
import ShieldCheckFilled from 'blode-icons-react/icons/shield-check-filled';
import SortArrowUpDown from 'blode-icons-react/icons/sort-arrow-up-down';
import X from 'blode-icons-react/icons/x';
import { ICON_QUIET, ICON_SHAPE } from '@/components/ui/button';

export const MENU_TITLE = 'text-menu-link text-dense font-semibold';
export const MENU_CHEVRON = 'size-5 flex-none';
/*
  A chevron needs a wrapper of its own only so the alignment guide has something
  to draw on: an <svg> renders no pseudo-elements, so `rail-mark` on the glyph
  itself would show nothing. The box is the glyph's own size, so it changes no
  layout when the guides are off.
*/
export const MENU_CHEVRON_BOX =
  'rail-mark inline-grid flex-none place-items-center';

/*
  Shapes that repeat across the parts often enough to be named once. They are
  string constants rather than components because each is applied to a
  different element -- a button, a link, a span, an anchor from next/link --
  and wrapping those would cost more than it saves.
*/

// Quiet square icon button: the shared shape and face, at the sidebar's size.
// Inside a section heading it also answers to the heading's hover, which is
// why that tint is a named group variant -- an icon button elsewhere in the
// sidebar must not pick it up.
const ICON_BUTTON_SHAPE = `${ICON_SHAPE} rail-mark size-7.5`;
const ICON_BUTTON_QUIET = `${ICON_QUIET} group-hover/heading:bg-menu-wash-faint group-hover/heading:text-primary group-focus-within/heading:bg-menu-wash-faint group-focus-within/heading:text-primary`;
export const ICON_BUTTON = `${ICON_BUTTON_SHAPE} ${ICON_BUTTON_QUIET}`;

/*
  One rail cell, the leading column the brand mark, a row's icon, the notice
  and the avatar all sit in. Named here because motion animates the grip's
  width from JS and cannot read --spacing-menu-rail; this is the same
  JS-to-CSS duplication ROW_HEIGHT makes, in the same direction, and the
  checker is what keeps the two honest.
*/
export const RAIL_CELL = 34;

/*
  The leading cell of every band. Its icon centres inside it, so the brand mark,
  a menu item's icon, the notice icon and the avatar all land on the rail's
  midpoint no matter how wide each of them actually is -- centring is done by
  the box, not by arithmetic on each glyph.
*/
export const MENU_RAIL =
  'rail-mark w-menu-rail grid flex-none place-items-center';

/*
  A divider in the menu: the rule, with a hairline lit line under it, so it
  reads as a cut in the canvas rather than a line laid on top. Its own element
  rather than a border on a neighbour, because the lit line is a shadow the
  rule casts below itself -- see --shadow-rule-etch for why not a border.
*/
export const MENU_RULE = 'border-rule-faint border-t shadow-rule-etch';

/*
  Every glyph in the menu comes from Blode, the same library the system and
  destination icons already use. Nothing here is drawn by hand: a one-off path
  drifts from the set's optical weight the moment the set is updated, and the
  menu sits directly beside those system icons.
*/
const MENU_ICONS = {
  plus: PlusMedium,
  arrange: SortArrowUpDown,
  search: MagnifyingGlass,
  clear: X,
  processes: CodeTree,
  processesFilled: CodeTreeFilled,
  left: ChevronLeft,
  right: ChevronRight,
  more: DotGrid1x3HorizontalFilled,
  runs: History,
  runsFilled: HistoryFilled,
  systems: Connectors1,
  systemsFilled: Connectors1Filled,
  approvals: ShieldCheck,
  approvalsFilled: ShieldCheckFilled,
  audit: FileText,
  auditFilled: FileTextFilled,
  info: CircleInfo,
} as const;

export type MenuIconName = keyof typeof MENU_ICONS;

export function MenuIcon({
  name,
  className,
  strokeWidth = 1.8,
}: {
  className?: string;
  name: MenuIconName;
  strokeWidth?: number;
}) {
  const Icon = MENU_ICONS[name];
  return (
    <Icon
      aria-hidden
      className={className}
      size={18}
      strokeWidth={strokeWidth}
    />
  );
}
