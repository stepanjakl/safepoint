'use client';

import { useSyncExternalStore } from 'react';

/*
  The platform is fixed for the life of the document, so this store has nothing
  to publish and its subscribe is a no-op that never fires. It exists only to
  give useSyncExternalStore a server snapshot and a client one: the one shape
  that lets the server and the client render different values without either a
  hydration mismatch or a second render.
*/
const subscribeNothing = () => () => {};
type Modifier = '⌘' | 'Ctrl';
const serverModifierKey = (): Modifier => '⌘';
const readModifierKey = (): Modifier =>
  /mac|iphone|ipad|ipod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
      navigator.platform ??
      '',
  )
    ? '⌘'
    : 'Ctrl';

/** ⌘ on Apple platforms, Ctrl everywhere else. */
export function useModifierKey(): Modifier {
  return useSyncExternalStore(
    subscribeNothing,
    readModifierKey,
    serverModifierKey,
  );
}
