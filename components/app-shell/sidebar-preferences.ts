'use client';

import { z } from 'zod';
import { createStoredRecord, parseStored } from './stored-record';

const schema = z.object({
  width: z.number().positive().finite().nullable(), // rem; null follows the design default
  collapsed: z.boolean(),
});
export type SidebarPreferences = z.infer<typeof schema>;
const store = createStoredRecord<SidebarPreferences>(
  'safepoint.sidebar.v1',
  'safepoint:sidebar',
);

export function parseSidebarPreferences(
  value: string | null,
  fallback: SidebarPreferences = { width: null, collapsed: false },
): SidebarPreferences {
  return parseStored(schema, value, fallback);
}

export const readSidebarPreferences = store.read;
export const serverSidebarPreferences = store.server;
export const subscribeSidebarPreferences = store.subscribe;
export const saveSidebarPreferences = (preferences: SidebarPreferences) => {
  store.save(preferences);
};
