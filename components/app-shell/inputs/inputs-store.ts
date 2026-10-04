'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { createStoredRecord, parseStored } from '../stored-record';

/*
  Which inputs a person has removed from a process, keyed by process id. A
  preview of managing inputs: what is stored is only the removals, so a process
  shows every evidence file its scenario holds until someone removes one, and a
  file added to the scenario later appears without a migration.

  Nothing reads this but the interface. The recorded run and its review are
  fixtures, and removing an input here does not change what they cite.
*/
const schema = z.record(z.string(), z.array(z.string()));
const store = createStoredRecord<z.infer<typeof schema>>(
  'safepoint.inputs.v1',
  'safepoint:inputs',
);
const parse = (value: string | null) => parseStored(schema, value, {});

export function useRemovedInputs(processId: string) {
  // The raw string is the snapshot, so an unchanged value is the same value
  // and nothing re-renders; the server has no removals.
  const raw = useSyncExternalStore(store.subscribe, store.read, store.server);
  const removed = useMemo(
    () => new Set(parse(raw)[processId] ?? []),
    [raw, processId],
  );
  // Each write starts from storage rather than from this render's set, so two
  // changes in one tick cannot overwrite each other.
  const change = (apply: (ids: Set<string>) => void) => {
    const all = parse(store.read());
    const ids = new Set(all[processId] ?? []);
    apply(ids);
    store.save({ ...all, [processId]: [...ids] });
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
