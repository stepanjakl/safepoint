'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { WEEKDAYS, type ProcessSchedule } from '@/lib/process/schedule';

// A person's changes to a schedule, keyed by process id. Only what they
// changed is stored: the process supplies the rest, so a schedule nobody has
// touched follows the process if the process changes.
const KEY = 'safepoint.schedules.v1';
const CHANGE = 'safepoint:schedules';
const override = z
  .object({
    enabled: z.boolean(),
    cadence: z.enum(['daily', 'weekly']),
    day: z.enum(WEEKDAYS),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .partial();
const schema = z.record(z.string(), override);
type Overrides = z.infer<typeof schema>;
let temporary: string | null = null;

function parse(value: string | null): Overrides {
  try {
    const parsed = schema.safeParse(JSON.parse(value ?? 'null'));
    if (parsed.success) return parsed.data;
  } catch {
    // An old or edited preference must never make the runs unavailable.
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

function save(overrides: Overrides) {
  const value = JSON.stringify(overrides);
  try {
    localStorage.setItem(KEY, value);
    temporary = null;
  } catch {
    temporary = value;
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function useProcessSchedule(id: string, fallback: ProcessSchedule) {
  // The snapshot is the raw string, so an unchanged value is the same value
  // and nothing re-renders; parsing happens once per change.
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const schedule = useMemo(
    () => ({ ...fallback, ...parse(raw)[id] }),
    [raw, id, fallback],
  );
  const update = (change: Partial<Omit<ProcessSchedule, 'timezone'>>) => {
    const all = parse(read());
    save({ ...all, [id]: { ...all[id], ...change } });
  };
  return [schedule, update] as const;
}
