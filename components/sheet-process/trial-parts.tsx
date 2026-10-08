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

// The review's disclosure: a +/− in the gutter (`.disclosure`), a summary
// that washes under the pointer and focus, and a body indented past the mark.
export function Disclosure({
  summary,
  children,
  open = false,
  bare = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
  // Without its rule, inside a block that draws its own.
  bare?: boolean;
}) {
  return (
    <details
      className={cx(
        'disclosure min-w-0',
        !bare && 'border-rule-faint border-b',
      )}
      open={open}
    >
      <summary className="control-wash rounded-control hover:bg-surface-hover focus-visible:bg-surface-hover text-dense -mx-2 flex min-h-10 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-2 py-2">
        {summary}
      </summary>
      <div className="grid min-w-0 gap-3 pb-4 pl-4.5">{children}</div>
    </details>
  );
}

// Evidence a reader rarely needs -- requests, raw values, transcripts -- kept
// one step further away than the reasons.
export function TechnicalDetails({
  children,
  label = 'Technical details',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <Disclosure summary={<span className="text-muted">{label}</span>}>
      {children}
    </Disclosure>
  );
}

export type Tone = 'blocked' | 'decision' | 'ready' | 'neutral';
const RANK: Record<Tone, number> = {
  blocked: 0,
  decision: 1,
  neutral: 2,
  ready: 3,
};

// A status in the review's pill, in its bucket's tone.
export function StatusChip({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span
      data-severity={RANK[tone]}
      className="bg-severity-pill text-severity-ink text-meta inline-flex items-center rounded-full px-2 py-0.5 font-medium whitespace-nowrap"
    >
      {children}
    </span>
  );
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
    <code className="value text-meta bg-surface-inset rounded-control px-1">
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
