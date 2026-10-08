'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ItemResult } from '@/lib/rulebook/engine';

import { useEvaluation, type WhatIf } from './evaluation-context';

/*
  What if a proposal set these values? Before any proposal, each editable
  value is at its starting value (an order of 0), and a rule guarded by it
  never tests anything. Typing a value reruns this evaluation with it, so the
  rules can be seen at work. Nothing is written to the sheet.
*/
export function WhatIfForm({
  item,
  issues,
}: {
  item: ItemResult;
  issues: { key: string; name: string; issue: string }[];
}) {
  const { whatIf, runWhatIf, state } = useEvaluation();
  // Values are kept per key, and two kinds can share a key: this form shows
  // and changes only its own.
  const names = new Set(item.change.map((c) => c.name));
  const set = Object.fromEntries(
    Object.entries(whatIf[item.key] ?? {}).filter(([n]) => names.has(n)),
  );
  const [typed, setTyped] = useState<Record<string, string>>(set);
  // Cleared or changed elsewhere (Clear all, Calculate): show what applies.
  const applied = JSON.stringify(set);
  const [seen, setSeen] = useState(applied);
  if (applied !== seen) {
    setSeen(applied);
    setTyped(set);
  }
  if (!item.change.length) return null;
  const running = state.kind === 'running';
  const apply = (values: Record<string, string>) => {
    const next: WhatIf = { ...whatIf };
    const kept = {
      ...Object.fromEntries(
        Object.entries(whatIf[item.key] ?? {}).filter(([n]) => !names.has(n)),
      ),
      ...Object.fromEntries(
        Object.entries(values).filter(
          ([n, v]) => names.has(n) && v.trim() !== '',
        ),
      ),
    };
    if (Object.keys(kept).length) next[item.key] = kept;
    else delete next[item.key];
    void runWhatIf(next);
  };
  return (
    <form
      className="grid gap-2"
      aria-label={`What if, for ${item.key} (${item.kind})`}
      onSubmit={(event) => {
        event.preventDefault();
        apply(typed);
      }}
    >
      <p className="text-meta text-muted">
        What if a proposal set these? Nothing is written to the sheet.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {item.change.map((c) => {
          const id = `what-if-${item.kind}-${item.key}-${c.name}`;
          const issue = issues.find(
            (i) => i.key === item.key && i.name === c.name,
          )?.issue;
          return (
            <span key={c.name} className="grid gap-1">
              <label htmlFor={id} className="text-meta">
                {c.label}
              </label>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                value={typed[c.name] ?? ''}
                onChange={(e) =>
                  setTyped({ ...typed, [c.name]: e.target.value })
                }
                placeholder={
                  c.from === 'not_applicable'
                    ? 'not used here'
                    : `${c.from === 'set' ? 'now' : 'starts at'} ${c.display ?? c.value ?? '—'}`
                }
                aria-describedby={issue ? `${id}-issue` : undefined}
                aria-invalid={issue ? true : undefined}
                className="field text-dense text-primary min-h-9 w-40 px-3"
              />
              {issue ? (
                <span id={`${id}-issue`} className="text-meta text-muted">
                  {issue}
                </span>
              ) : null}
            </span>
          );
        })}
        <Button type="submit" isDisabled={running}>
          Try
        </Button>
        {Object.keys(set).length ? (
          <Button
            isDisabled={running}
            onPress={() => {
              setTyped({});
              apply({});
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}

// Which what-ifs this evaluation ran with, and the way back to none.
export function WhatIfBanner({ items }: { items: ItemResult[] }) {
  const { whatIf, runWhatIf, state } = useEvaluation();
  const label = (name: string) =>
    items.flatMap((i) => i.change).find((c) => c.name === name)?.label ?? name;
  const entries = Object.entries(whatIf).flatMap(([key, values]) =>
    Object.entries(values).map(
      ([name, value]) => `${key}, ${label(name).toLowerCase()}: ${value}`,
    ),
  );
  return (
    <div role="status" className="text-dense">
      {entries.length ? (
        <p className="flex flex-wrap items-center gap-2">
          <span>
            <strong>What-if:</strong> {entries.join('; ')}. Rules below use
            these; the sheet is unchanged.
          </span>
          <Button
            isDisabled={state.kind === 'running'}
            onPress={() => void runWhatIf({})}
          >
            Clear all
          </Button>
        </p>
      ) : null}
    </div>
  );
}
