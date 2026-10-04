'use client';

import {
  createStoredRecord,
  writePreferenceCookie,
} from '@/components/app-shell/stored-record';
import { PROCESS_ORDER_KEY as STORAGE_KEY } from '@/lib/process/navigation';

// Mirrored to a cookie: the order belongs to the menu, not to a route, and the
// server reads it to draw the first paint in the saved order.
const store = createStoredRecord<string[]>(
  STORAGE_KEY,
  'safepoint:process-order',
);

export function subscribeProcessOrder(notify: () => void) {
  // An order saved before the cookie mirror existed has no cookie yet, so its
  // next load would still render the default order first. Carry it across once.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null && !document.cookie.includes(`${STORAGE_KEY}=`)) {
      writePreferenceCookie(STORAGE_KEY, stored);
    }
  } catch {
    // Storage unavailable: nothing to carry across.
  }
  return store.subscribe(notify);
}

export const readProcessOrder = store.read;

export function saveProcessOrder(order: string[]) {
  const persisted = store.save(order);
  writePreferenceCookie(STORAGE_KEY, JSON.stringify(order));
  return persisted;
}
