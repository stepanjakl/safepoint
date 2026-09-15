'use client';

import { z } from 'zod';

const KEY = 'safepoint.sidebar.v1';
const CHANGE = 'safepoint:sidebar';
const schema = z.object({
  width: z.number().positive().finite().nullable(), // rem; null follows the design default
  collapsed: z.boolean(),
});
export type SidebarPreferences = z.infer<typeof schema>;
let temporary: string | null = null;

export function parseSidebarPreferences(
  value: string | null,
): SidebarPreferences {
  try {
    const parsed = schema.safeParse(JSON.parse(value ?? 'null'));
    if (parsed.success) return parsed.data;
  } catch {
    // An old or edited preference must never make navigation unavailable.
  }
  return { width: null, collapsed: false };
}

export function readSidebarPreferences() {
  if (temporary !== null) return temporary;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function serverSidebarPreferences() {
  return null;
}

export function subscribeSidebarPreferences(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE, notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE, notify);
  };
}

export function saveSidebarPreferences(preferences: SidebarPreferences) {
  const value = JSON.stringify(preferences);
  try {
    localStorage.setItem(KEY, value);
    temporary = null;
  } catch {
    temporary = value;
  }
  window.dispatchEvent(new Event(CHANGE));
}
