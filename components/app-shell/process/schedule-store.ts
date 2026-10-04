'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { createStoredRecord, parseStored } from '../stored-record';
import { WEEKDAYS, type ProcessSchedule } from '@/lib/process/schedule';

// A person's changes to a schedule, keyed by process id. Only what they
// changed is stored: the process supplies the rest, so a schedule nobody has
// touched follows the process if the process changes.
const override = z
  .object({
    enabled: z.boolean(),
    cadence: z.enum(['daily', 'weekly']),
    day: z.enum(WEEKDAYS),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .partial();
const schema = z.record(z.string(), override);
const store = createStoredRecord<z.infer<typeof schema>>(
  'safepoint.schedules.v1',
  'safepoint:schedules',
);
const parse = (value: string | null) => parseStored(schema, value, {});

export function useProcessSchedule(id: string, fallback: ProcessSchedule) {
  // The snapshot is the raw string, so an unchanged value is the same value
  // and nothing re-renders; parsing happens once per change.
  const raw = useSyncExternalStore(store.subscribe, store.read, store.server);
  const schedule = useMemo(
    () => ({ ...fallback, ...parse(raw)[id] }),
    [raw, id, fallback],
  );
  const update = (change: Partial<Omit<ProcessSchedule, 'timezone'>>) => {
    const all = parse(store.read());
    store.save({ ...all, [id]: { ...all[id], ...change } });
  };
  return [schedule, update] as const;
}
