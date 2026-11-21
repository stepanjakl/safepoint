'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Heading } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Notch } from '@/components/ui/notch';
import { PANEL } from '../drawer-aside';
import { DrawerOverlay } from '../drawer-overlay';

export const NavigationDrawerContext = createContext<{
  id: string;
  narrow: boolean;
  registerOpener: (button: HTMLButtonElement | null) => void;
  open: boolean;
  searchOnOpen: boolean;
  show: () => void;
  close: () => void;
} | null>(null);

export function NavigationMenuIcon({ closing = false }: { closing?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
      {closing && <path d="M11 6 9 8l2 2" />}
    </svg>
  );
}

export function NavigationNotch() {
  const drawer = useContext(NavigationDrawerContext);
  if (!drawer) return null;
  const { id, open, registerOpener, show } = drawer;

  return (
    <Notch side="left" className="shell-menu-notch shell:hidden">
      <Button
        slant="left"
        className="max-shell:ps-0 max-shell:pe-(--narrow-slant-padding)"
        ref={registerOpener}
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onPress={show}
      >
        <NavigationMenuIcon />
      </Button>
    </Notch>
  );
}

export function NavigationDrawer({ children }: { children: ReactNode }) {
  const drawer = useContext(NavigationDrawerContext);
  if (!drawer) return null;

  return (
    <DrawerOverlay
      side="left"
      id={drawer.id}
      isOpen={drawer.open}
      onOpenChange={(open) => {
        if (!open) drawer.close();
      }}
    >
      <div
        className={`${PANEL} ground-floating navigation-drawer-panel flex flex-col`}
      >
        <Heading slot="title" className="sr-only">
          Menu
        </Heading>
        <div className="min-h-0 flex-1 overflow-y-auto [&>aside]:min-h-full">
          {children}
        </div>
      </div>
    </DrawerOverlay>
  );
}
