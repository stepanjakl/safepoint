'use client';

import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { createStoredRecord, parseStored } from '../stored-record';

/*
  Which view of a process was last open, keyed by process id. A tab is not a
  place -- it has no address, and a link to a process means the process, not
  the corner of it someone was last reading -- but coming back to a page and
  finding it as you left it is worth the one line of storage.

  Kept per process: what you were reading about one says nothing about another.
*/
// In the order the header draws them, which the swap between them follows.
export const PROCESS_TABS = [
  'runs',
  'instructions',
  'inputs',
  'outputs',
  'settings',
] as const;

export type ProcessTab = (typeof PROCESS_TABS)[number];

const schema = z.record(z.string(), z.enum(PROCESS_TABS));
const store = createStoredRecord<z.infer<typeof schema>>(
  'safepoint.process-tab.v1',
  'safepoint:process-tab',
);
const parse = (value: string | null) => parseStored(schema, value, {});

export function useProcessTab(processId: string) {
  // The raw string is the snapshot, so an unchanged value is the same value
  // and nothing re-renders. The server has no preference, so every page is
  // built on the run and settles onto the stored tab once it hydrates.
  const raw = useSyncExternalStore(store.subscribe, store.read, store.server);
  const tab = parse(raw)[processId] ?? 'runs';
  const setTab = (next: ProcessTab) => {
    store.save({ ...parse(store.read()), [processId]: next });
  };
  return [tab, setTab] as const;
}
