'use client';

import { useEffect, useSyncExternalStore } from 'react';

import type { SourceSummary, SourceValues } from '@/lib/sources/model';

/*
  A source's latest read, shared by every panel that shows it, so reading it
  from Inputs is what Outputs shows too. Fetched once per page; reading again
  replaces it for every reader.
*/

export type SourceState = {
  summary:
    | { kind: 'loading' }
    | { kind: 'ready'; value: SourceSummary | null }
    | { kind: 'failed'; message: string };
  reading: boolean;
  // Why the last "Read now" did not land; the previous read stays shown.
  readError: string | null;
};

const ENDPOINT = '/api/dev/sources';
const INITIAL: SourceState = {
  summary: { kind: 'loading' },
  reading: false,
  readError: null,
};

const states = new Map<string, SourceState>();
const listeners = new Set<() => void>();
// Moves on every change, so a reader of several sources has one snapshot.
let version = 0;

function set(id: string, next: Partial<SourceState>) {
  states.set(id, { ...(states.get(id) ?? INITIAL), ...next });
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

async function post<T>(body: unknown): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    (T & { kind: string }) | { kind: 'error'; message: string } | null;
  if (!payload) throw new Error(`The server answered ${response.status}.`);
  if (payload.kind === 'error')
    throw new Error((payload as { message: string }).message);
  return payload as T;
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

function load(id: string) {
  post<{ summary: SourceSummary | null }>({ action: 'summary', source: id })
    .then(({ summary }) =>
      set(id, { summary: { kind: 'ready', value: summary } }),
    )
    .catch((error: unknown) =>
      set(id, { summary: { kind: 'failed', message: errorText(error) } }),
    );
}

async function readNow(id: string) {
  set(id, { reading: true, readError: null });
  try {
    const { summary } = await post<{ summary: SourceSummary }>({
      action: 'read',
      source: id,
    });
    set(id, { reading: false, summary: { kind: 'ready', value: summary } });
  } catch (error) {
    set(id, { reading: false, readError: errorText(error) });
  }
}

export type SourceEntry = SourceState & { id: string };

/*
  Several sources at once, each starting from the read the server gave the
  page (`initial[id]`), or fetched here when it gave none. `read` reads one
  of them again.
*/
export function useSources(
  ids: readonly string[],
  initial: Readonly<Record<string, SourceSummary | null>> = {},
) {
  const first = (id: string): SourceState =>
    id in initial
      ? { ...INITIAL, summary: { kind: 'ready', value: initial[id] ?? null } }
      : INITIAL;
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  const key = ids.join('\n');

  useEffect(() => {
    for (const id of key.split('\n')) {
      if (!id || states.has(id)) continue;
      const start = first(id);
      states.set(id, start);
      if (start.summary.kind === 'loading') load(id);
    }
    // `initial` is only for the first render; a later one changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const entries: SourceEntry[] = ids.map((id) => ({
    id,
    ...(states.get(id) ?? first(id)),
  }));
  return { entries, read: readNow };
}

// One read's values, for the drawer; a read never changes, so each is kept.
const values = new Map<string, Promise<SourceValues>>();

export function sourceValues(
  source: string,
  read: string,
): Promise<SourceValues> {
  const key = `${source}/${read}`;
  let pending = values.get(key);
  if (!pending) {
    pending = post<{ values: SourceValues }>({
      action: 'values',
      source,
      read,
    }).then((answer) => answer.values);
    // A failure is not kept: opening the drawer again tries again.
    pending.catch(() => values.delete(key));
    values.set(key, pending);
  }
  return pending;
}
