'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Arrival,
  EmptyState,
  LOADER_DELAY_MS,
  LOADER_MIN_MS,
  LOADER_SLOW_MS,
  useLoader,
} from '@/components/ui/working-mark';

// Replies either side of each threshold, and one that never comes.
const REPLIES = [
  { label: 'Quick', ms: LOADER_DELAY_MS / 2 },
  { label: 'Just past the wait', ms: LOADER_DELAY_MS + 100 },
  { label: 'A second', ms: 1000 },
  { label: 'Never', ms: null },
] as const;

/* A load replayed on demand, through the loader's timing (useLoader). */
export function LoaderTiming() {
  const [load, setLoad] = useState<{ ms: number | null; at: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const { phase, fadeIn } = useLoader(loading);

  useEffect(() => {
    if (load?.ms == null) return;
    const reply = setTimeout(() => setLoading(false), load.ms);
    return () => clearTimeout(reply);
  }, [load]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {REPLIES.map(({ label, ms }) => (
          <Button
            key={label}
            onPress={() => {
              setLoading(true);
              setLoad({ ms, at: performance.now() });
            }}
          >
            {label}
            {ms === null ? '' : ` · ${ms}ms`}
          </Button>
        ))}
      </div>
      <p className="text-meta text-muted max-w-prose">
        Nothing for the first {LOADER_DELAY_MS}ms; once shown, at least{' '}
        {LOADER_MIN_MS}ms; after {LOADER_SLOW_MS / 1000}s it says it is taking
        long.
      </p>
      <div className="bg-surface-primary flex h-96 flex-col rounded-lg px-6">
        {phase === 'waiting' ? null : phase ? (
          <EmptyState
            role="status"
            loading
            title={
              phase === 'slow'
                ? 'Still loading the rulebook…'
                : 'Loading the rulebook…'
            }
          />
        ) : load ? (
          // Keyed by the load, so each replay arrives afresh.
          <Arrival key={load.at} fadeIn={fadeIn} className="m-auto">
            <p className="text-dense text-primary">Loaded.</p>
          </Arrival>
        ) : null}
      </div>
    </div>
  );
}
