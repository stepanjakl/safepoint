'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';

/*
  Which read sources a person has removed from a process, keyed by process id.
  A mock of connection management: what is stored is only the removals, so a
  process shows every source its scenario files hold until someone removes one,
  and a source added to the files later appears without a migration.

  Nothing reads this but the interface. The recorded run and its review are
  fixtures, and removing a source here does not change what they cite.
*/
const KEY = 'safepoint.connections.v1';
const CHANGE = 'safepoint:connections';
const schema = z.record(z.string(), z.array(z.string()));
type Removals = z.infer<typeof schema>;
let temporary: string | null = null;

function parse(value: string | null): Removals {
  try {
    const parsed = schema.safeParse(JSON.parse(value ?? 'null'));
    if (parsed.success) return parsed.data;
  } catch {
    // An old or edited preference must never hide the process's sources.
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

function save(removals: Removals) {
  const value = JSON.stringify(removals);
  try {
    localStorage.setItem(KEY, value);
    temporary = null;
  } catch {
    temporary = value;
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function useRemovedSources(processId: string) {
  // The raw string is the snapshot, so an unchanged value is the same value
  // and nothing re-renders; the server has no removals.
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const removed = useMemo(
    () => new Set(parse(raw)[processId] ?? []),
    [raw, processId],
  );
  // Each write starts from storage rather than from this render's set, so two
  // changes in one tick cannot overwrite each other.
  const change = (apply: (ids: Set<string>) => void) => {
    const all = parse(read());
    const ids = new Set(all[processId] ?? []);
    apply(ids);
    save({ ...all, [processId]: [...ids] });
  };
  return {
    removed,
    remove: (id: string) => change((ids) => ids.add(id)),
    restore: (id: string) =>
      change((ids) => {
        ids.delete(id);
      }),
  };
}
