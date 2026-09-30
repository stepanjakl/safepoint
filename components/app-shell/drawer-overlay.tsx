'use client';

import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import X from 'blode-icons-react/icons/x';
import { cx } from '@/lib/cx';
import { CLOSE_BUTTON, PANEL } from './drawer-aside';

/*
  A panel over the sheet, with a second that opens to its left. The first
  holds a list and stays put; the second is a `DrawerAside` holding whatever was
  chosen from it, so the list stays in view and choosing another item swaps the
  detail without a trip back.

  The scrim and the slide are `drawer-overlay` and `drawer-modal` in
  app/styles/drawer.css; the second panel's own motion is `drawer-aside` there.
  Escape closes the second panel before the first -- the caller's
  `onKeyDownCapture` answers it, since the caller knows what the second panel
  is showing -- and the scrim closes both.
*/

// Both panels are sized against the viewport rather than each other: the modal
// hugs them, so a click beside them lands on the scrim and dismisses. The
// first is as wide as what it says it needs, from a floor up to the viewport;
// content that should not widen it opts out with an inline-size containment.
const MAIN_WIDTH =
  'w-fit min-w-[min(420px,calc(100vw_-_2_*_var(--spacing-shell-inset)))] max-w-[calc(100vw_-_2_*_var(--spacing-shell-inset))]';
export const DRAWER_ASIDE_WIDTH =
  'w-[min(35rem,calc(100vw_-_2_*_var(--spacing-shell-inset)))]';

export function DrawerOverlay({
  isOpen,
  onOpenChange,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // `DrawerPanels`. Separate so what is in the panels can be keyed on each
  // opening while the overlay stays mounted to animate out.
  children: ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      // Inset by the shell's own padding so the panels line up with the panes.
      className="drawer-overlay p-shell-inset fixed inset-0 z-40 flex justify-end"
    >
      <Modal className="drawer-modal flex h-full max-w-full">
        <Dialog className="h-full outline-none">{children}</Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export function DrawerPanels({
  title,
  closeLabel,
  aside,
  onKeyDownCapture,
  className,
  children,
}: {
  // The first panel's title, which names the dialog.
  title: ReactNode;
  closeLabel: string;
  // The second panel, while it is showing or leaving. Given the aside width.
  aside: ReactElement | null;
  onKeyDownCapture?: (event: KeyboardEvent) => void;
  // A hook for the list inside the first panel.
  className?: string;
  // The first panel's body, under its header.
  children: ReactNode;
}) {
  return (
    <div
      className="gap-shell-inset flex h-full justify-end"
      onKeyDownCapture={onKeyDownCapture}
    >
      {aside}
      <div
        className={cx(
          PANEL,
          MAIN_WIDTH,
          'flex flex-col',
          // Where both do not fit, the second panel takes this one's place
          // rather than squeezing beside it.
          aside ? 'max-lg:hidden' : null,
          className,
        )}
      >
        <header className="border-rule-faint flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3">
          <Heading
            slot="title"
            className="text-title min-w-0 [font-weight:550]"
          >
            {title}
          </Heading>
          <AriaButton slot="close" className={CLOSE_BUTTON}>
            <X
              aria-hidden
              size={18}
              strokeWidth={2.2}
              className="size-3.5 flex-none"
            />
            <span className="sr-only">{closeLabel}</span>
          </AriaButton>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
