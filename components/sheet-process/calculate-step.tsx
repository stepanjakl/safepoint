'use client';

import { useId, useState } from 'react';

import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { WEEKDAYS, type Weekday } from '@/lib/rulebook/field-types';

import { useEvaluation } from './evaluation-context';
import {
  Code,
  DataTable,
  Disclosure,
  Mark,
  TrialControl,
  TrialSection,
  td,
  th,
} from './trial-parts';

type Mode = 'now' | 'weekday' | 'exact';

export function CalculateStep() {
  const { state, run } = useEvaluation();
  const [mode, setMode] = useState<Mode>('now');
  const [day, setDay] = useState<Weekday>('Thu');
  const [time, setTime] = useState('08:45');
  const [local, setLocal] = useState('');
  const [period, setPeriod] = useState(0);
  const [source, setSource] = useState<'captured' | 'live'>('captured');
  const name = useId();
  const body = state.kind === 'done' ? state.body : null;
  const result = body?.kind === 'result' ? body : null;
  const runRequest =
    mode === 'now'
      ? { mode }
      : mode === 'weekday'
        ? { mode, day, time }
        : { mode, local };

  return (
    <div className="grid gap-4">
      <p className="text-dense">
        Runs the approved rulebook at a time you choose. The rulebook says how
        the week is timed; the app only follows it. Every fact is calculated for
        every item, with nothing proposed yet.
      </p>
      <div className="flex flex-wrap gap-6">
        <fieldset className="grid gap-1">
          <legend className="text-dense font-semibold">Run at</legend>
          <label className="text-dense flex items-center gap-1.5">
            <input
              type="radio"
              name={`${name}-mode`}
              checked={mode === 'now'}
              onChange={() => setMode('now')}
            />
            Now
          </label>
          <label className="text-dense flex items-center gap-1.5">
            <input
              type="radio"
              name={`${name}-mode`}
              checked={mode === 'weekday'}
              onChange={() => setMode('weekday')}
            />
            This week on
            <select
              aria-label="Weekday"
              value={day}
              onChange={(e) => setDay(e.target.value as Weekday)}
            >
              {WEEKDAYS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <input
              aria-label="Time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label className="text-dense flex items-center gap-1.5">
            <input
              type="radio"
              name={`${name}-mode`}
              checked={mode === 'exact'}
              onChange={() => setMode('exact')}
            />
            Exactly
            <input
              aria-label="Exact local time"
              type="datetime-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
            />
          </label>
        </fieldset>
        <fieldset className="grid gap-1">
          <legend className="text-dense font-semibold">Plan for</legend>
          {['The current period', 'The one after'].map((label, i) => (
            <label key={label} className="text-dense flex items-center gap-1.5">
              <input
                type="radio"
                name={`${name}-period`}
                checked={period === i}
                onChange={() => setPeriod(i)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="grid gap-1">
          <legend className="text-dense font-semibold">Sheet data</legend>
          <label className="text-dense flex items-center gap-1.5">
            <input
              type="radio"
              name={`${name}-source`}
              checked={source === 'captured'}
              onChange={() => setSource('captured')}
            />
            The captured read
          </label>
          <label className="text-dense flex items-center gap-1.5">
            <input
              type="radio"
              name={`${name}-source`}
              checked={source === 'live'}
              onChange={() => setSource('live')}
            />
            A live read
          </label>
        </fieldset>
      </div>
      <TrialControl
        label="Calculate"
        runningLabel="Calculating…"
        state={state}
        onRun={() => void run({ source, run: runRequest, period })}
        summary={
          result
            ? `${result.evaluation.items.length} items with rulebook v${result.rulebook.version}`
            : body?.kind === 'no_rulebook'
              ? 'No rulebook is approved yet: draft and approve one in Rules'
              : body?.kind === 'not_configured'
                ? `Missing ${body.missing.join(', ')}`
                : body?.kind === 'error'
                  ? body.message
                  : null
        }
      />

      {result ? (
        <div className="grid gap-5">
          <TrialSection title="1. When">
            <Ledger className="enclosure">
              <LedgerRow label="Run at">
                {result.evaluation.runAt.label} ({result.chosen})
              </LedgerRow>
              <LedgerRow label="Planning">
                {result.evaluation.period.label}
              </LedgerRow>
              <LedgerRow label="Other periods">
                {result.evaluation.periods
                  .filter((p) => p.index !== result.evaluation.period.index)
                  .map((p) => p.label)
                  .join('; ') || '—'}
              </LedgerRow>
              <LedgerRow label="Data">{result.source}</LedgerRow>
            </Ledger>
            <DataTable caption="Times resolved for this run">
              <thead>
                <tr>
                  <th className={th}>Time</th>
                  <th className={th}>In the sheet</th>
                  <th className={th}>Resolved to</th>
                </tr>
              </thead>
              <tbody>
                {result.evaluation.times.map((t) => (
                  <tr key={`${t.table}.${t.row}.${t.name}`}>
                    <td className={td}>
                      <Code>{`${t.table}[${t.row}].${t.name}`}</Code>{' '}
                      <span className="text-muted">
                        {t.role === 'observation' ? 'happened' : 'planned'}
                      </span>
                    </td>
                    <td className={td}>
                      {t.sheet}{' '}
                      <span className="readout text-muted">
                        {t.refs.join(', ')}
                      </span>
                    </td>
                    <td className={td}>{t.resolved}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TrialSection>

          <TrialSection title="2. Facts per item">
            {result.evaluation.items.map((item) => (
              <Disclosure
                key={`${item.kind}.${item.key}`}
                summary={
                  <>
                    {item.key} <span className="text-muted">{item.kind}</span>
                    {item.facts.some((f) => f.error) ? (
                      <>
                        {' '}
                        <Mark passed={false}>has errors</Mark>
                      </>
                    ) : null}
                  </>
                }
              >
                <DataTable caption={`Facts for ${item.key}`}>
                  <thead>
                    <tr>
                      <th className={th}>Fact</th>
                      <th className={th}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...item.facts, ...item.change].map((f) => (
                      <tr key={f.name}>
                        <td className={td}>
                          {f.label} <Code>{f.name}</Code>
                        </td>
                        <td className={td}>
                          {f.error ? (
                            <Mark passed={false}>{f.error}</Mark>
                          ) : (
                            <Code>{f.value ?? '—'}</Code>
                          )}
                          {'from' in f && typeof f.from === 'string' ? (
                            <span className="text-muted">
                              {' '}
                              · editable, {f.from.replace('_', ' ')}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Disclosure>
            ))}
          </TrialSection>
        </div>
      ) : null}
    </div>
  );
}
