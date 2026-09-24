import { GradientAvatar } from '@outpacelabs/avatars';

import { cx } from '@/lib/cx';
import { styleDebug } from '@/lib/style-debug';
import { Tooltip } from '@/components/ui/tooltip';
import { ICON_BUTTON, MENU_RAIL, MenuIcon, RAIL_CELL } from './menu-parts';

const AVATAR_COLORS = ['#0d9488', '#22d3ee', '#0284c7', '#3f3f46', '#5eead4'];

/*
  Both ends are rail cells, so the row states no offsets of its own: the avatar
  fills the leading cell and the settings button centres in the trailing one.
  The 2px that used to sit in `pr-0.5` was (rail - button) / 2 worked out by
  hand; the cell does that arithmetic itself.
*/
export function SidebarAccount() {
  return (
    <div className="shell-profile-row group/account shell:h-shell-header flex cursor-pointer items-center justify-between gap-2.5">
      <span
        role="img"
        aria-label="Maya’s demo avatar"
        className={cx(MENU_RAIL, 'relative rounded-full')}
      >
        <GradientAvatar
          seed="safepoint-maya"
          size={RAIL_CELL}
          colors={AVATAR_COLORS}
        />
      </span>
      <p
        {...styleDebug({
          component: 'SidebarAccount',
          part: 'name',
          appearance: 'text-primary',
        })}
        className="text-primary text-dense mr-auto font-semibold"
      >
        Maya
      </p>
      <span className={MENU_RAIL}>
        <Tooltip label="Settings">
          <button
            type="button"
            className={cx(
              ICON_BUTTON,
              // The whole account row lights the button as its own hover does.
              // The tooltip stays on the button, which is the only part of the
              // row a pointer can actually press.
              'group-hover/account:bg-surface-selected group-hover/account:text-primary',
            )}
            {...styleDebug({
              component: 'SidebarAccount',
              part: 'settings',
              appearance: 'control-wash text-header-ink',
            })}
            aria-label="Settings"
            aria-disabled="true"
          >
            <MenuIcon name="more" />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}
