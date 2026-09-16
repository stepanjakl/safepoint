'use client';

import { useSyncExternalStore } from 'react';
import { z } from 'zod';

/*
  Which view of a process was last open, keyed by process id. A tab is not a
  place -- it has no address, and a link to a process means the process, not
  the corner of it someone was last reading -- but coming back to a page and
  finding it as you left it is worth the one line of storage.

  Kept per process: what you were reading about one says nothing about another.
*/
export const PROCESS_TABS = [
  'runs',
  'instructions',
  'inputs',
  'outputs',
  'settings',
] as const;

export type ProcessTab = (typeof PROCESS_TABS)[number];

const KEY = 'safepoint.process-tab.v1';
const CHANGE = 'safepoint:process-tab';
const schema = z.record(z.string(), z.enum(PROCESS_TABS));
type Tabs = z.infer<typeof schema>;
let temporary: string | null = null;

function parse(value: string | null): Tabs {
  try {
    const parsed = schema.safeParse(JSON.parse(value ?? 'null'));
    if (parsed.success) return parsed.data;
  } catch {
    // An old or edited preference must never leave the page with no view.
  }
  return {};
}

function read() {
  if (temporary !== null) return temporary;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(notify: () => void) {
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

function save(tabs: Tabs) {
  const value = JSON.stringify(tabs);
  try {
    localStorage.setItem(KEY, value);
    temporary = null;
  } catch {
    temporary = value;
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function useProcessTab(processId: string) {
  // The raw string is the snapshot, so an unchanged value is the same value
  // and nothing re-renders. The server has no preference, so every page is
  // built on the run and settles onto the stored tab once it hydrates.
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const tab = parse(raw)[processId] ?? 'runs';
  const setTab = (next: ProcessTab) => {
    save({ ...parse(read()), [processId]: next });
  };
  return [tab, setTab] as const;
}
