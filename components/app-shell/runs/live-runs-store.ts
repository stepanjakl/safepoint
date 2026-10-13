'use client';

import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { ProcessRun } from '@/lib/process/model';
import { createStoredRecord, parseStored } from '../stored-record';

/*
  Runs started by hand for a process whose run moves only when a person acts
  on the page, keyed by process id, newest first. Kept in this browser so a
  reload finds a run where it was. Each run carries the process's own record
  of how far it got (`data`), which only the process's thread reads.

  Not where a run's evidence lives: a read of the sheet is kept on the server
  and a run holds only its id.
*/
const liveRunSchema = z.object({
  run: z.object({
    id: z.string(),
    startedAt: z.string(),
    status: z.string(),
    trigger: z.string(),
    counts: z.object({ items: z.number() }).passthrough(),
    instructionsVersion: z.string(),
  }),
  data: z.record(z.string(), z.unknown()),
});
const schema = z.record(z.string(), z.array(liveRunSchema));

export type LiveRun = { run: ProcessRun; data: Record<string, unknown> };

const store = createStoredRecord<z.infer<typeof schema>>(
  'safepoint.live-runs.v1',
  'safepoint:live-runs',
);
const parse = (value: string | null) => parseStored(schema, value, {});

export function useLiveRuns(processId: string) {
  const raw = useSyncExternalStore(store.subscribe, store.read, store.server);
  const runs = (parse(raw)[processId] ?? []) as LiveRun[];
  const save = (next: LiveRun[]) =>
    store.save({ ...parse(store.read()), [processId]: next });
  const current = () => (parse(store.read())[processId] ?? []) as LiveRun[];
  return {
    runs,
    add: (run: ProcessRun, data: Record<string, unknown> = {}) =>
      save([{ run, data }, ...current()]),
    // Merges into the run's record, read fresh so two updates never race.
    update: (id: string, data: Record<string, unknown>) =>
      save(
        current().map((entry) =>
          entry.run.id === id
            ? { ...entry, data: { ...entry.data, ...data } }
            : entry,
        ),
      ),
    remove: (id: string) =>
      save(current().filter((entry) => entry.run.id !== id)),
  };
}
