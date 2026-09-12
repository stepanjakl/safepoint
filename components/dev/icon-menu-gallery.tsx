'use client';

// A sidebar's worth of menu items drawn by every candidate family, outlined at
// rest and filled under the pointer or keyboard focus. The discs only ever show
// the filled half of a family; this is where the two halves are seen together,
// and where a family whose outline and fill disagree in weight gives itself away.
import type { AriaAttributes, ComponentType } from 'react';
import {
  Bell,
  Book,
  ChartLine,
  Gear,
  House,
  MagnifyingGlass,
  TreeStructure,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import {
  RiBookFill,
  RiBookLine,
  RiHomeFill,
  RiHomeLine,
  RiLineChartFill,
  RiLineChartLine,
  RiNotification3Fill,
  RiNotification3Line,
  RiRouteFill,
  RiRouteLine,
  RiSearchFill,
  RiSearchLine,
  RiSettings3Fill,
  RiSettings3Line,
} from '@remixicon/react';
import {
  IconBell,
  IconBellFilled,
  IconBook,
  IconBookFilled,
  IconChartArea,
  IconChartAreaFilled,
  IconHome,
  IconHomeFilled,
  IconSearch,
  IconSearchFilled,
  IconSettings,
  IconSettingsFilled,
  IconSitemap,
  IconSitemapFilled,
} from '@tabler/icons-react';
// Deep imports, as in icon-sets.tsx: neither barrel is on the optimised list.
import BlodeBell from 'blode-icons-react/icons/bell';
import BlodeBellFilled from 'blode-icons-react/icons/bell-filled';
import BlodeBook from 'blode-icons-react/icons/book';
import BlodeBookFilled from 'blode-icons-react/icons/book-filled';
import BlodeChart from 'blode-icons-react/icons/chart-2';
import BlodeChartFilled from 'blode-icons-react/icons/chart-2-filled';
import BlodeHome from 'blode-icons-react/icons/home';
import BlodeHomeFilled from 'blode-icons-react/icons/home-filled';
import BlodeProcesses from 'blode-icons-react/icons/code-tree';
import BlodeProcessesFilled from 'blode-icons-react/icons/code-tree-filled';
import BlodeSearch from 'blode-icons-react/icons/magnifying-glass';
import BlodeSearchFilled from 'blode-icons-react/icons/magnifying-glass-filled';
import BlodeSettings from 'blode-icons-react/icons/settings-gear-1';
import BlodeSettingsFilled from 'blode-icons-react/icons/settings-gear-1-filled';
import MingcuteBookFilled from '@mingcute/react/core-filled/book';
import MingcuteChartFilled from '@mingcute/react/core-filled/chart-line';
import MingcuteHomeFilled from '@mingcute/react/core-filled/home-1';
import MingcuteBellFilled from '@mingcute/react/core-filled/notification';
import MingcuteSearchFilled from '@mingcute/react/core-filled/search';
import MingcuteSettingsFilled from '@mingcute/react/core-filled/settings-1';
import MingcuteSitemapFilled from '@mingcute/react/core-filled/sitemap';
import MingcuteBook from '@mingcute/react/core-regular/book';
import MingcuteChart from '@mingcute/react/core-regular/chart-line';
import MingcuteHome from '@mingcute/react/core-regular/home-1';
import MingcuteBell from '@mingcute/react/core-regular/notification';
import MingcuteSearch from '@mingcute/react/core-regular/search';
import MingcuteSettings from '@mingcute/react/core-regular/settings-1';
import MingcuteSitemap from '@mingcute/react/core-regular/sitemap';
import {
  IconBell as ArcadeBell,
  IconBook as ArcadeBook,
  IconBulletList as ArcadeBulletList,
  IconChart as ArcadeChart,
  IconHouse as ArcadeHouse,
  IconMagnifier as ArcadeMagnifier,
  IconSlider as ArcadeSlider,
} from 'nucleo-arcade';
import { cx } from '@/lib/cx';

// Narrow for the same reason SystemIconComponent is: every family types its
// props differently, and asking only for what is passed lets all six satisfy it.
type MenuGlyph = ComponentType<
  { className?: string } & Pick<AriaAttributes, 'aria-hidden'>
>;

// `filled` is optional because the free Nucleo families ship one style each.
// A family without a pair says so by leaving it out, rather than by borrowing
// a fill from a different family.
type GlyphPair = { outline: MenuGlyph; filled?: MenuGlyph };

const MENU_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'processes', label: 'Processes' },
  { key: 'search', label: 'Search' },
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'settings', label: 'Settings' },
] as const;

type MenuItemKey = (typeof MENU_ITEMS)[number]['key'];

type MenuFamily = {
  id: string;
  label: string;
  note: string;
  icons: Record<MenuItemKey, GlyphPair>;
};

// Phosphor is one glyph at several weights, so the pair is the same component
// bound twice.
const weighted = (
  Component: PhosphorIcon,
  weight: 'regular' | 'fill',
): MenuGlyph =>
  function WeightedPhosphorIcon(props) {
    return <Component weight={weight} {...props} />;
  };

const MENU_FAMILIES: MenuFamily[] = [
  {
    id: 'tabler',
    label: 'Tabler',
    note: 'Stroked outline at 2px against a separate filled set.',
    icons: {
      overview: { outline: IconHome, filled: IconHomeFilled },
      processes: { outline: IconSitemap, filled: IconSitemapFilled },
      search: { outline: IconSearch, filled: IconSearchFilled },
      catalogue: { outline: IconBook, filled: IconBookFilled },
      forecast: { outline: IconChartArea, filled: IconChartAreaFilled },
      alerts: { outline: IconBell, filled: IconBellFilled },
      settings: { outline: IconSettings, filled: IconSettingsFilled },
    },
  },
  {
    id: 'phosphor',
    label: 'Phosphor',
    note: 'Regular weight to fill weight of the same glyph.',
    icons: {
      overview: {
        outline: weighted(House, 'regular'),
        filled: weighted(House, 'fill'),
      },
      processes: {
        outline: weighted(TreeStructure, 'regular'),
        filled: weighted(TreeStructure, 'fill'),
      },
      search: {
        outline: weighted(MagnifyingGlass, 'regular'),
        filled: weighted(MagnifyingGlass, 'fill'),
      },
      catalogue: {
        outline: weighted(Book, 'regular'),
        filled: weighted(Book, 'fill'),
      },
      forecast: {
        outline: weighted(ChartLine, 'regular'),
        filled: weighted(ChartLine, 'fill'),
      },
      alerts: {
        outline: weighted(Bell, 'regular'),
        filled: weighted(Bell, 'fill'),
      },
      settings: {
        outline: weighted(Gear, 'regular'),
        filled: weighted(Gear, 'fill'),
      },
    },
  },
  {
    id: 'remix',
    label: 'Remix',
    note: 'Line and Fill drawn as a pair, so the silhouettes match exactly.',
    icons: {
      overview: { outline: RiHomeLine, filled: RiHomeFill },
      // RiFlowChart is a single-style editor glyph with no Line/Fill pair; a
      // route through nodes is the nearest paired flow.
      processes: { outline: RiRouteLine, filled: RiRouteFill },
      search: { outline: RiSearchLine, filled: RiSearchFill },
      catalogue: { outline: RiBookLine, filled: RiBookFill },
      forecast: { outline: RiLineChartLine, filled: RiLineChartFill },
      alerts: { outline: RiNotification3Line, filled: RiNotification3Fill },
      settings: { outline: RiSettings3Line, filled: RiSettings3Fill },
    },
  },
  {
    id: 'blode',
    label: 'Blode',
    note: 'Lucide-style strokes with a filled twin for each.',
    icons: {
      overview: { outline: BlodeHome, filled: BlodeHomeFilled },
      processes: { outline: BlodeProcesses, filled: BlodeProcessesFilled },
      search: { outline: BlodeSearch, filled: BlodeSearchFilled },
      catalogue: { outline: BlodeBook, filled: BlodeBookFilled },
      forecast: { outline: BlodeChart, filled: BlodeChartFilled },
      alerts: { outline: BlodeBell, filled: BlodeBellFilled },
      settings: { outline: BlodeSettings, filled: BlodeSettingsFilled },
    },
  },
  {
    id: 'mingcute',
    label: 'MingCute',
    note: 'Regular and Filled styles with rounded joins.',
    icons: {
      overview: { outline: MingcuteHome, filled: MingcuteHomeFilled },
      processes: { outline: MingcuteSitemap, filled: MingcuteSitemapFilled },
      search: { outline: MingcuteSearch, filled: MingcuteSearchFilled },
      catalogue: { outline: MingcuteBook, filled: MingcuteBookFilled },
      forecast: { outline: MingcuteChart, filled: MingcuteChartFilled },
      alerts: { outline: MingcuteBell, filled: MingcuteBellFilled },
      settings: { outline: MingcuteSettings, filled: MingcuteSettingsFilled },
    },
  },
  {
    id: 'nucleo-arcade',
    label: 'Nucleo Arcade',
    note: 'The free families ship one style each, so this row stays as drawn. The swap needs Nucleo UI or Core, whose outline and fill are separate paid packages.',
    icons: {
      overview: { outline: ArcadeHouse },
      // No flow or hierarchy glyph; a bullet list stands for the list of processes.
      processes: { outline: ArcadeBulletList },
      search: { outline: ArcadeMagnifier },
      catalogue: { outline: ArcadeBook },
      forecast: { outline: ArcadeChart },
      alerts: { outline: ArcadeBell },
      // No gear; a slider is the nearest settings glyph in the set.
      settings: { outline: ArcadeSlider },
    },
  },
];

const MENU_ITEM = cx(
  // The row: an icon cell and a label, in the sidebar's type and link colour.
  'group/item flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-dense font-semibold text-menu-link select-none',
  // The wash, answering the pointer and the keyboard alike.
  'control-wash hover:bg-menu-wash hover:text-primary focus-visible:bg-menu-wash focus-visible:text-primary',
  // The focus ring.
  'outline-none focus-visible:outline-focus focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid',
);

// Both halves are mounted and one is hidden, so the swap is a display change
// with nothing to load or lay out under the pointer.
const GLYPH = 'size-4.5';
const GLYPH_AT_REST =
  'size-4.5 group-hover/item:hidden group-focus-visible/item:hidden';
const GLYPH_ENGAGED =
  'hidden size-4.5 group-hover/item:block group-focus-visible/item:block';

export function IconMenuGallery() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {MENU_FAMILIES.map((family) => (
        <div
          key={family.id}
          className={cx(
            'border-rule-default bg-surface-primary space-y-3 border p-4',
            family.id === 'nucleo-arcade' && 'nucleo-arcade',
          )}
        >
          <div className="space-y-1">
            <p className="readout text-muted">{family.label}</p>
            <p className="text-meta text-muted">{family.note}</p>
          </div>
          <ul className="space-y-0.5">
            {MENU_ITEMS.map((item) => {
              const { outline: Outline, filled: Filled } =
                family.icons[item.key];
              return (
                <li key={item.key}>
                  <button type="button" className={MENU_ITEM}>
                    <span className="grid size-4.5 flex-none place-items-center">
                      <Outline
                        aria-hidden="true"
                        className={Filled ? GLYPH_AT_REST : GLYPH}
                      />
                      {Filled ? (
                        <Filled aria-hidden="true" className={GLYPH_ENGAGED} />
                      ) : null}
                    </span>
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
