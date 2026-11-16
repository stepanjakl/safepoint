'use client';

import { useSyncExternalStore } from 'react';
import { z } from 'zod';

import { createStoredRecord, parseStored } from '../stored-record';

/*
  Runs this browser kept before the server did, by process id. They are not
  shown and not brought over (they were never a record anyone could trust), so
  all that is read of them is that a process has some, to say so once. The key
  is never written again except to take a process's entry away when the person
  has been told.
*/
const schema = z.record(z.string(), z.array(z.unknown()));
const store = createStoredRecord<z.infer<typeof schema>>(
  'safepoint.live-runs.v1',
  'safepoint:live-runs',
);
const parse = (value: string | null) => parseStored(schema, value, {});

export function useEarlierRuns(processId: string) {
  const raw = useSyncExternalStore(store.subscribe, store.read, store.server);
  const count = parse(raw)[processId]?.length ?? 0;
  return {
    count,
    // Read fresh, so another process's entry is left as it is.
    dismiss: () => {
      store.save(
        Object.fromEntries(
          Object.entries(parse(store.read())).filter(
            ([id]) => id !== processId,
          ),
        ),
      );
    },
  };
}
