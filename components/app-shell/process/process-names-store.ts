'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { createStoredRecord, parseStored } from '../stored-record';

/*
  The names people have given processes, keyed by process id. Only renames are
  stored: a process keeps its scenario's name until someone changes it, and a
  rename back to that name clears the entry rather than pinning a copy of it.

  Every place a process is named reads through here -- the header, the setup
  drawer, the sidebar -- so a rename lands everywhere at once, and in other
  tabs through the storage event.
*/
const schema = z.record(z.string(), z.string().min(1));
type Names = z.infer<typeof schema>;
const store = createStoredRecord<Names>(
  'safepoint.process-names.v1',
  'safepoint:process-names',
);
const parse = (value: string | null) => parseStored(schema, value, {});

// Long enough for any real process name; short enough to stay one line.
export const PROCESS_NAME_MAX = 80;

// Every rename, for a list naming several processes. The server has none.
export function useProcessNames(): Names {
  const raw = useSyncExternalStore(store.subscribe, store.read, store.server);
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
      const names = parse(store.read());
      delete names[processId];
      store.save(name === fallback ? names : { ...names, [processId]: name });
    },
  };
}
