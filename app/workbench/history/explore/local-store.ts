'use client';

import type { z } from 'zod';

export function createLocalStore<T>({
  key,
  schema,
  initialValue,
  invalidMessage,
  unavailableMessage,
}: {
  key: string;
  schema: z.ZodType<T>;
  initialValue: T;
  invalidMessage: string;
  unavailableMessage: string;
}) {
  const initial = { data: initialValue, error: '' };
  const listeners = new Set<() => void>();
  let snapshot = initial;
  let raw: string | null | undefined;
  let memoryOnly = false;

  function getSnapshot() {
    if (memoryOnly) return snapshot;
    try {
      const stored = localStorage.getItem(key);
      if (raw === stored) return snapshot;
      raw = stored;
      if (!stored) snapshot = initial;
      else {
        let decoded: unknown;
        try {
          decoded = JSON.parse(stored);
        } catch {
          snapshot = { ...initial, error: invalidMessage };
          return snapshot;
        }
        const parsed = schema.safeParse(decoded);
        snapshot = parsed.success
          ? { data: parsed.data, error: '' }
          : {
              ...initial,
              error: invalidMessage,
            };
      }
    } catch {
      memoryOnly = true;
      snapshot = {
        ...snapshot,
        error: unavailableMessage,
      };
    }
    return snapshot;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    window.addEventListener('storage', listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', listener);
    };
  }

  function update(value: T) {
    const data = schema.parse(value);
    snapshot = { data, error: snapshot.error };
    try {
      raw = JSON.stringify(data);
      localStorage.setItem(key, raw);
      memoryOnly = false;
      snapshot = { data, error: '' };
    } catch {
      memoryOnly = true;
      snapshot = {
        data,
        error: unavailableMessage,
      };
    }
    listeners.forEach((listener) => listener());
  }

  return { getSnapshot, getServerSnapshot: () => initial, subscribe, update };
}
