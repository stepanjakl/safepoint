'use client';

import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { PROCESS_TAB_KEY as STORAGE_KEY } from '@/lib/process/navigation';
import {
  createStoredRecord,
  parseStored,
  writePreferenceCookie,
} from '../stored-record';

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
  // Development only: the proposed Instructions tab, beside the current one
  // for comparison (instructions-b.tsx). Delete with that file.
  'instructions-b',
  'rules',
  // Development only: the proposed Rules tab, beside the current one for
  // comparison (rulebook-panel-b.tsx). Delete with that file.
  'rules-b',
  'inputs',
  'outputs',
  'settings',
] as const;

export type ProcessTab = (typeof PROCESS_TABS)[number];

const schema = z.record(z.string(), z.enum(PROCESS_TABS));
const store = createStoredRecord<z.infer<typeof schema>>(
  STORAGE_KEY,
  'safepoint:process-tab',
);
const parse = (value: string | null) => parseStored(schema, value, {});

function subscribe(notify: () => void) {
  // A tab saved before the cookie mirror existed has no cookie yet, so its next
  // load would still render Runs first. Carry it across once.
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

/*
  `saved` is the cookie's copy of the record, read by the server
  (process-view.tsx), so the server render and hydration open on the tab the
  reader left rather than settling onto it a moment later. localStorage stays
  the client's source.
*/
export function useProcessTab(processId: string, saved: string | null) {
  // The raw string is the snapshot, so an unchanged value is the same value
  // and nothing re-renders.
  const raw = useSyncExternalStore(subscribe, store.read, () => saved);
  const tab = parse(raw)[processId] ?? 'runs';
  const setTab = (next: ProcessTab) => {
    const record = { ...parse(store.read()), [processId]: next };
    store.save(record);
    writePreferenceCookie(STORAGE_KEY, JSON.stringify(record));
  };
  return [tab, setTab] as const;
}
