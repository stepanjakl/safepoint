import { cx } from '@/lib/cx';
import { styleDebug } from '@/lib/style-debug';
import { MenuIcon } from './menu-parts';

/*
  The sidebar's standing advisory, and the block whose whole definition is
  worth reading at once. Its classes are grouped by what each group decides --
  the face it borrows, the box it draws, the type it sets -- rather than left
  in the order a sorter happened to leave them. Each group is a complete string
  literal, so Tailwind's plain-text scanner still reads every class in it, and
  the name is a definition the editor can jump to from the call site.

  Two properties that used to be stated here are gone, because in both cases
  something else already owned them and won.

  `border` was never doing anything: `control-face` declares the whole
  shorthand, and Tailwind emits it after the plain `border` utility, so the
  width, style and colour were always control-face's.

  Neither is there a forced-colors border. The fallback at the foot of
  app/styles/controls.css sits outside every cascade layer, and unlayered normal
  declarations outrank layered ones whatever their specificity, so
  `.control-face { border-color: currentColor }` beat the variant utility that
  was written here. The edge is controls.css's to set.
*/
const NOTICE_BOX = cx(
  // The face: control-face's geometry, the notice's own stops, its sheen.
  'control-face surface-notice rounded-shell grid grid-cols-[min-content_auto] items-center gap-x-3 p-3 max-shell:py-sidebar-grip-offset',
  // The type. `leading-normal` is the box's own; both text children re-assert
  // `text-micro` and so carry micro's tighter 14px line instead.
  'text-state-advisory text-micro leading-normal',
);

// Icon shares row one with the title; the caption sits under it.
export function SidebarNotice() {
  return (
    <div
      {...styleDebug({
        component: 'SidebarNotice',
        appearance: 'surface-notice',
      })}
      className={NOTICE_BOX}
    >
      <span className="process-menu-notice-rail grid flex-none place-items-center">
        <MenuIcon name="info" />
      </span>
      <p className="text-notice-title text-micro font-semibold">
        Demo application
      </p>
      <span
        {...styleDebug({
          component: 'SidebarNotice',
          part: 'caption',
          appearance: 'text-notice-caption',
        })}
        className="text-notice-caption text-micro col-start-2 mt-0.75 font-medium"
      >
        Fictional data. No live changes.
      </span>
    </div>
  );
}
