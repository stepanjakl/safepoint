'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';

/*
  The names people have given processes, keyed by process id. Only renames are
  stored: a process keeps its scenario's name until someone changes it, and a
  rename back to that name clears the entry rather than pinning a copy of it.

  Every place a process is named reads through here -- the header, the setup
  drawer, the sidebar -- so a rename lands everywhere at once, and in other
  tabs through the storage event.
*/
const KEY = 'safepoint.process-names.v1';
const CHANGE = 'safepoint:process-names';
const schema = z.record(z.string(), z.string().min(1));
type Names = z.infer<typeof schema>;
let temporary: string | null = null;

// Long enough for any real process name; short enough to stay one line.
export const PROCESS_NAME_MAX = 80;

function parse(value: string | null): Names {
  try {
    const parsed = schema.safeParse(JSON.parse(value ?? 'null'));
    if (parsed.success) return parsed.data;
  } catch {
    // An old or edited preference must never leave a process unnamed.
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

function save(names: Names) {
  const value = JSON.stringify(names);
  try {
    localStorage.setItem(KEY, value);
    temporary = null;
  } catch {
    temporary = value;
  }
  window.dispatchEvent(new Event(CHANGE));
}

// Every rename, for a list naming several processes. The server has none.
export function useProcessNames(): Names {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => parse(raw), [raw]);
}

export function useProcessName(processId: string, fallback: string) {
  const names = useProcessNames();
  return {
    name: names[processId] ?? fallback,
    // Trimmed and capped here, so no caller can store what the title field
    // would refuse. An empty name keeps the current one.
    rename: (next: string) => {
      const name = next.trim().slice(0, PROCESS_NAME_MAX);
      if (!name) return;
      // From storage rather than this render, so two renames in one tick
      // cannot overwrite each other.
      const names = parse(read());
      delete names[processId];
      save(name === fallback ? names : { ...names, [processId]: name });
    },
  };
}
