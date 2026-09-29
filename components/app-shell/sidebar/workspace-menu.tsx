import type { Ref } from 'react';

import { cx } from '@/lib/cx';
import { styleDebug } from '@/lib/style-debug';
import {
  MENU_CHEVRON,
  MENU_CHEVRON_BOX,
  MENU_RAIL,
  MENU_TITLE,
  MenuIcon,
  type MenuIconName,
} from './menu-parts';

/*
  The tile behind a workspace menu item's icon, and the two glyphs it
  cross-fades between. At rest the tile is a raised face around the outline;
  while the item is hovered or focused the face fades to bare and the filled
  glyph fades in over the outline.

  Each timing belongs to the element it moves. control-face transitions the
  tile's stops, so the tile carries no transition utility of its own -- one
  here would replace control-face's property list and leave the face to snap.
  The glyphs are plain elements and take control-wash, the same step and curve.

  Both glyphs share one grid cell, so the swap moves nothing. An even box, so
  it centres on the rail's integer axis.

  The hairline sheen, like every face this small, and the icon squares' corner
  rather than a control's, so it matches the buttons beside the brand. The glyph
  takes its colour from the tile, which is where the hue is named, and steps on
  the tile's hover with it.
*/
const MENU_TILE =
  'control-face control-hairline surface-menu-tile group-hover/enter:surface-menu-tile-hover group-focus-visible/enter:surface-menu-tile-hover rounded-icon grid size-6.5 flex-none place-items-center';
const MENU_TILE_GLYPH = 'control-wash col-start-1 row-start-1 size-4 flex-none';
const MENU_TILE_GLYPH_AT_REST =
  'group-hover/enter:opacity-0 group-focus-visible/enter:opacity-0';
const MENU_TILE_GLYPH_ENGAGED =
  'opacity-0 group-hover/enter:opacity-100 group-focus-visible/enter:opacity-100';

/*
  An item in the workspace menu. No transparent edge here, unlike a process
  row: the rail has to start at the band's own left edge for its midpoint to be
  the same axis every other band centres on.

  The wash and the group that engages the tile are on every item, the disabled
  ones included. :hover still matches a disabled button, so a placeholder
  answers the pointer exactly as the live item does; only the label's colour
  and the cursor say it leads nowhere yet.
*/
const MENU_ITEM = cx(
  MENU_TITLE,
  'group/enter rounded-control control-wash hover:bg-menu-wash focus-visible:bg-menu-wash flex h-10 w-full items-center gap-1.5 pr-1.75 text-left',
);

/*
  The count on the Processes item. It gives its chip up under the pointer, on
  the item's own step, so the item's wash shows through rather than a darker
  box sitting on it.
*/
const MENU_COUNT =
  'bg-menu-chip text-muted-strong text-micro rounded-control control-wash group-hover/enter:bg-transparent group-focus-visible/enter:bg-transparent ml-auto inline-grid h-5.5 min-w-5.5 place-items-center px-1.25 tabular-nums';

/*
  Placeholders for what the workspace menu will hold, so its shape can be judged
  with more than one entry. Disabled: none of them leads anywhere yet. Each
  names its tile's hue as a whole class, so the scanner sees it.
*/
const WORKSPACE_PLACEHOLDERS: {
  label: string;
  icon: MenuIconName;
  iconFilled: MenuIconName;
  hue: string;
}[] = [
  {
    label: 'Runs',
    icon: 'runs',
    iconFilled: 'runsFilled',
    hue: 'menu-tile-green',
  },
  {
    label: 'Systems',
    icon: 'systems',
    iconFilled: 'systemsFilled',
    hue: 'menu-tile-sky',
  },
  {
    label: 'Approvals',
    icon: 'approvals',
    iconFilled: 'approvalsFilled',
    hue: 'menu-tile-violet',
  },
  {
    label: 'Audit log',
    icon: 'audit',
    iconFilled: 'auditFilled',
    hue: 'menu-tile-pink',
  },
];

// A workspace item's leading cell: its tile, and the outline and filled glyphs
// the tile cross-fades between when the item engages.
function MenuTile({
  hue,
  icon,
  iconFilled,
}: {
  hue: string;
  icon: MenuIconName;
  iconFilled: MenuIconName;
}) {
  return (
    <span className={MENU_RAIL}>
      <span
        {...styleDebug({
          component: 'WorkspaceMenu',
          part: 'tile',
          appearance: 'surface-menu-tile',
          variant: hue,
        })}
        className={cx(MENU_TILE, hue)}
      >
        <MenuIcon
          name={icon}
          className={cx(MENU_TILE_GLYPH, MENU_TILE_GLYPH_AT_REST)}
        />
        <MenuIcon
          name={iconFilled}
          className={cx(MENU_TILE_GLYPH, MENU_TILE_GLYPH_ENGAGED)}
        />
      </span>
    </span>
  );
}

/** The workspace level: the way into the processes, and what will join it. */
export function WorkspaceMenu({
  count,
  enterRef,
  onEnter,
  shine,
}: {
  count: number;
  enterRef: Ref<HTMLButtonElement>;
  onEnter: () => void;
  shine: boolean;
}) {
  return (
    <ul className="mt-2 grid gap-0.5">
      <li>
        <button
          {...styleDebug({
            component: 'WorkspaceMenu',
            part: 'entry',
            appearance: 'text-menu-link control-wash',
          })}
          ref={enterRef}
          className={cx(
            MENU_ITEM,
            'workspace-menu-entry',
            'hover:text-primary focus-visible:text-primary',
          )}
          type="button"
          onClick={onEnter}
        >
          <MenuTile
            hue="menu-tile-yellow"
            icon="processes"
            iconFilled="processesFilled"
          />
          <span
            className="workspace-menu-shine"
            data-shine={shine || undefined}
          >
            Processes
          </span>
          <span
            {...styleDebug({
              component: 'WorkspaceMenu',
              part: 'count',
              appearance: 'bg-menu-chip',
            })}
            className={MENU_COUNT}
          >
            {count}
          </span>
          <span className={MENU_CHEVRON_BOX}>
            <MenuIcon name="right" className={MENU_CHEVRON} strokeWidth={2} />
          </span>
        </button>
      </li>
      {WORKSPACE_PLACEHOLDERS.map((placeholder) => (
        <li key={placeholder.label}>
          <button
            type="button"
            {...styleDebug({
              component: 'WorkspaceMenu',
              part: 'placeholder',
              appearance: 'text-menu-link control-wash',
            })}
            className={cx(
              MENU_ITEM,
              'disabled:text-muted disabled:hover:text-muted-strong',
            )}
            disabled
          >
            <MenuTile
              hue={placeholder.hue}
              icon={placeholder.icon}
              iconFilled={placeholder.iconFilled}
            />
            <span>{placeholder.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
