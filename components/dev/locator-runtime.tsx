'use client';

import { useEffect } from 'react';

/**
 * Boots the LocatorJS overlay (option-click an element to open its JSX).
 *
 * The published browser extension (1.3.2, 2023) predates the path-based
 * `data-locatorjs` attributes that `@locator/webpack-loader` emits, so it
 * cannot read them. `@locator/runtime` is the same overlay at a current
 * version, loaded by the app itself instead of injected by the extension.
 *
 * Whichever runtime reaches `document` first wins — both bail out when
 * `#locatorjs-wrapper` already exists — so this mounts as early as the client
 * allows, and the extension should be disabled for localhost to avoid the race.
 */
export function LocatorRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    // Dynamic so the package never enters the server or production bundle.
    void import('@locator/runtime').then(({ default: setup }) => {
      setup({ adapter: 'jsx' });
    });
  }, []);

  return null;
}
