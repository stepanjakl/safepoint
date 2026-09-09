'use client';

const STORAGE_KEY = 'safepoint.process-order.v1';
const CHANGE_EVENT = 'safepoint:process-order';
let temporaryOrder: string | null = null;

export function subscribeProcessOrder(notify: () => void) {
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

export function serverProcessOrder() {
  return null;
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
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return persisted;
}
