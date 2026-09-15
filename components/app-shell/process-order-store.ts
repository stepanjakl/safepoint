'use client';

import { PROCESS_ORDER_KEY as STORAGE_KEY } from '@/lib/process/navigation';

const CHANGE_EVENT = 'safepoint:process-order';
let temporaryOrder: string | null = null;

// A year, and the whole site: the order belongs to the menu, not to a route.
function writeOrderCookie(value: string) {
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

export function subscribeProcessOrder(notify: () => void) {
  // An order saved before the cookie mirror existed has no cookie yet, so its
  // next load would still render the default order first. Carry it across once.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null && !document.cookie.includes(`${STORAGE_KEY}=`)) {
      writeOrderCookie(stored);
    }
  } catch {
    // Storage unavailable: nothing to carry across.
  }
  const storage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export function readProcessOrder() {
  if (temporaryOrder !== null) return temporaryOrder;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveProcessOrder(order: string[]) {
  const value = JSON.stringify(order);
  let persisted = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    temporaryOrder = null;
  } catch {
    temporaryOrder = value;
    persisted = false;
  }
  writeOrderCookie(value);
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return persisted;
}
