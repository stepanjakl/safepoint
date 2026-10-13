'use client';

import { useCallback, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Pill, type Tone } from '@/components/ui/pill';

/*
  The pieces every build-in-the-open step shares: a button the reader presses,
  a status line read aloud, and plain building blocks for showing where data
  came from and what was done to it. Nothing runs until the button is pressed.
*/

export type TrialState<T> =
  | { kind: 'idle' }
  | { kind: 'running'; startedAt: number }
  | {
      kind: 'done';
      body: T;
      elapsedMs: number;
      finishedAt: string;
      status: number;
    }
  | {
      kind: 'failed';
      message: string;
      elapsedMs: number;
      status: number | null;
    };

export function useTrial<T>(url: string) {
  const [state, setState] = useState<TrialState<T>>({ kind: 'idle' });
  const run = useCallback(
    async (body?: unknown): Promise<T | null> => {
      const startedAt = performance.now();
      setState({ kind: 'running', startedAt });
      try {
        const response = await fetch(
          url,
          body === undefined
            ? { method: 'POST' }
            : {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              },
        );
        const payload = (await response.json()) as T;
        setState({
          kind: 'done',
          body: payload,
          status: response.status,
          elapsedMs: Math.round(performance.now() - startedAt),
          finishedAt: new Date().toISOString(),
        });
        return payload;
      } catch (error) {
        setState({
          kind: 'failed',
          message:
            error instanceof Error ? error.message : 'The request failed.',
          status: null,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        return null;
      }
    },
    [url],
  );
  return { state, run };
}

export function TrialControl({
  label,
  runningLabel,
  state,
  onRun,
  summary,
  blocked = null,
  idle = 'Not run yet.',
  variant = 'primary',
}: {
  // What the status says before the first press.
  idle?: string;
  // Secondary where the step's main action is elsewhere.
  variant?: 'primary' | 'secondary';
  label: string;
  runningLabel: string;
  state: TrialState<unknown>;
  onRun: () => void;
  summary: string | null;
  // Why it cannot run yet, said where the button is.
  blocked?: string | null;
}) {
  const running = state.kind === 'running';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={variant}
        onPress={onRun}
        isDisabled={running || blocked !== null}
      >
        {running
          ? runningLabel
          : state.kind === 'idle'
            ? label
            : `${label} again`}
      </Button>
      <p role="status" className="text-meta text-muted min-w-0">
        {running
          ? 'Running…'
          : blocked !== null
            ? blocked
            : state.kind === 'failed'
              ? `Failed after ${state.elapsedMs} ms: ${state.message}`
              : state.kind === 'done'
                ? `${summary ?? 'Finished'} · ${state.elapsedMs} ms round trip · ${clock(state.finishedAt)}`
                : idle}
      </p>
    </div>
  );
}

export type { Tone } from '@/components/ui/pill';

// A status in the review's pill, in its bucket's tone.
export function StatusChip({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return <Pill tone={tone}>{children}</Pill>;
}

// What a step came to, first and in one line, before any of the why.
export function Outcome({ children }: { children: ReactNode }) {
  return (
    <div className="text-body flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {children}
    </div>
  );
}

// A step's one-paragraph introduction: what it does, not how.
export function Lede({ children }: { children: ReactNode }) {
  return <p className="text-dense text-muted max-w-prose">{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="value text-meta bg-surface-inset rounded-control px-1">
      {children}
    </code>
  );
}

function clock(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(iso));
}

// A moment as a person writes it: "7 Oct 2026, 13:51", in the sheet's zone.
export function dateTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(iso));
}

// "1 problem", "2 problems".
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;
