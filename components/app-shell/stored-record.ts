'use client';

import type { z } from 'zod';

/*
  One value kept in this browser under one key, for useSyncExternalStore. The
  snapshot is the raw string, so an unchanged value is the same value and
  nothing re-renders; each caller parses it once per change. Storage that
  refuses a write (private mode, quota) keeps the value in memory for this tab,
  and the change event tells every reader in this tab, the storage event every
  other tab.
*/
export function createStoredRecord<T>(key: string, event: string) {
  let temporary: string | null = null;
  return {
    read(): string | null {
      if (temporary !== null) return temporary;
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    // The server has no preference: every page is built on the default and
    // settles onto the stored value once it hydrates.
    server: (): string | null => null,
    subscribe(notify: () => void) {
      const onStorage = (change: StorageEvent) => {
        if (change.key === key || change.key === null) notify();
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(event, notify);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(event, notify);
      };
    },
    // Whether the value reached storage rather than only this tab's memory.
    save(value: T): boolean {
      const serialized = JSON.stringify(value);
      let persisted = true;
      try {
        localStorage.setItem(key, serialized);
        temporary = null;
      } catch {
        temporary = serialized;
        persisted = false;
      }
      window.dispatchEvent(new Event(event));
      return persisted;
    },
  };
}

// An old or edited value must never take away what it configures: anything
// that does not parse reads as the fallback.
export function parseStored<T>(
  schema: z.ZodType<T>,
  value: string | null,
  fallback: T,
): T {
  try {
    const parsed = schema.safeParse(JSON.parse(value ?? 'null'));
    if (parsed.success) return parsed.data;
  } catch {
    // Not JSON: the fallback below.
  }
  return fallback;
}

// A year, and the whole site: a preference the server reads to render the
// first paint the way it will settle.
export function writePreferenceCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}
