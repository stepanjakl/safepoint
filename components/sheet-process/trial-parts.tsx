'use client';

import { useCallback, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cx } from '@/lib/cx';

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
    async (body?: unknown) => {
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
      } catch (error) {
        setState({
          kind: 'failed',
          message:
            error instanceof Error ? error.message : 'The request failed.',
          status: null,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
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
}: {
  label: string;
  runningLabel: string;
  state: TrialState<unknown>;
  onRun: () => void;
  summary: string | null;
}) {
  const running = state.kind === 'running';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" onPress={onRun} isDisabled={running}>
        {running
          ? runningLabel
          : state.kind === 'idle'
            ? label
            : `${label} again`}
      </Button>
      <p role="status" className="text-meta text-muted min-w-0">
        {running
          ? 'Running…'
          : state.kind === 'failed'
            ? `Failed after ${state.elapsedMs} ms: ${state.message}`
            : state.kind === 'done'
              ? `${summary ?? 'Finished'} · ${state.elapsedMs} ms round trip · ${clock(state.finishedAt)}`
              : 'Not run yet.'}
      </p>
    </div>
  );
}

export function TrialSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-dense font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function Disclosure({
  summary,
  children,
  open = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="border-rule-faint min-w-0 border-t pt-2" open={open}>
      <summary className="text-dense cursor-pointer">{summary}</summary>
      <div className="mt-2 grid min-w-0 gap-2">{children}</div>
    </details>
  );
}

export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className="bg-surface-inset rounded-control readout max-h-96 max-w-full overflow-auto p-3"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="value bg-surface-inset rounded-control px-1">
      {children}
    </code>
  );
}

// Pass and fail in the review's own tones: rank 3 is ready, rank 0 blocked.
export function Mark({
  passed,
  children,
}: {
  passed: boolean | null;
  children?: ReactNode;
}) {
  return (
    <span
      data-severity={passed === null ? undefined : passed ? 3 : 0}
      className={cx(
        'text-meta font-semibold',
        passed === null ? 'text-muted' : 'text-severity-ink',
      )}
    >
      {children ?? (passed === null ? 'n/a' : passed ? 'Pass' : 'Fail')}
    </span>
  );
}

// A table that scrolls sideways on its own rather than widening the thread.
export function DataTable({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <div
      className="max-w-full overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="text-meta w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const th =
  'border-rule-default text-muted border-b px-2 py-1.5 align-bottom font-medium';
export const td = 'border-rule-faint border-b px-2 py-1.5 align-top';

export function clock(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(iso));
}
