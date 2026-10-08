'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { cx } from '@/lib/cx';
import { WEEKDAYS, type Weekday } from '@/lib/rulebook/field-types';

import {
  useEvaluation,
  type EvaluateResponse,
  type RunRead,
} from './evaluation-context';
import { UnderTest } from './rulebook-drift';
import {
  Code,
  DataTable,
  Disclosure,
  Lede,
  Mark,
  Outcome,
  StatusChip,
  TrialControl,
  TrialSection,
  dateTime,
  td,
  th,
} from './trial-parts';

type Mode = 'now' | 'weekday' | 'exact';

// How a step names the run's read: which one, and when it was made.
const readName = (read: RunRead) =>
  `${read.id === 'captured' ? 'the captured read' : 'the live read'} of ${dateTime(read.readAt)}`;

export function CalculateStep() {
  const { state, run, read } = useEvaluation();
  const [mode, setMode] = useState<Mode>('now');
  const [day, setDay] = useState<Weekday>('Thu');
  const [time, setTime] = useState('08:45');
  const [local, setLocal] = useState('');
  const [period, setPeriod] = useState(0);
  const [changing, setChanging] = useState(false);
  const name = useId();
  const optionsId = useId();
  const body = state.kind === 'done' ? state.body : null;
  const result = body?.kind === 'result' ? body : null;
  const runRequest =
    mode === 'now'
      ? { mode }
      : mode === 'weekday'
        ? { mode, day, time }
        : { mode, local };
  const when =
    mode === 'now'
      ? 'now'
      : mode === 'weekday'
        ? `${day} ${time} this week`
        : local
          ? local.replace('T', ' ')
          : 'an exact time (not set)';
  const failedFacts = result
    ? result.evaluation.items.reduce(
        (sum, item) => sum + item.facts.filter((f) => f.error).length,
        0,
      )
    : 0;

  return (
    <div className="grid gap-4">
      <Lede>
        Calculates every fact for every item, with the rulebook in force, on
        this run&rsquo;s read of the sheet, at a time you choose. The rulebook
        says how the week is timed; the app only follows it. Nothing is proposed
        yet.
      </Lede>
      <div className="text-dense flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          Runs {when}, planning for{' '}
          {period === 0 ? 'the current period' : 'the period after'}
          {read ? `, on ${readName(read)}` : ''}.
        </span>
        <Button
          aria-expanded={changing}
          aria-controls={optionsId}
          onPress={() => setChanging(!changing)}
        >
          {changing ? 'Done' : 'Change'}
        </Button>
      </div>
      {changing ? (
        <div
          id={optionsId}
          className="enclosure flex flex-wrap gap-x-8 gap-y-4 p-4"
        >
          <fieldset className="grid gap-1">
            <legend className="text-meta text-muted mb-1">Run at</legend>
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
                className="field text-dense min-h-8 px-2"
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
                className="field text-dense min-h-8 px-2"
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
                className="field text-dense min-h-8 px-2"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
              />
            </label>
          </fieldset>
          <fieldset className="grid content-start gap-1">
            <legend className="text-meta text-muted mb-1">Plan for</legend>
            {['The current period', 'The one after'].map((label, i) => (
              <label
                key={label}
                className="text-dense flex items-center gap-1.5"
              >
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
        </div>
      ) : null}
      <TrialControl
        label="Calculate"
        runningLabel="Calculating…"
        state={state}
        blocked={
          read
            ? null
            : 'Read the sheet first: a run calculates on its own read.'
        }
        onRun={() =>
          read && void run({ read: read.id, run: runRequest, period })
        }
        summary={
          result
            ? `${result.evaluation.items.length} items`
            : body?.kind === 'no_rulebook'
              ? 'No rulebook is approved yet: approve one in the Rulebook tab'
              : body?.kind === 'error'
                ? body.message
                : null
        }
      />

      {result ? <Facts result={result} failedFacts={failedFacts} /> : null}
    </div>
  );
}

function Facts({
  result,
  failedFacts,
}: {
  result: Extract<EvaluateResponse, { kind: 'result' }>;
  failedFacts: number;
}) {
  const { evaluation } = result;
  const facts = evaluation.items[0]?.facts.length ?? 0;
  return (
    <div className="grid gap-4">
      <UnderTest rulebook={result.rulebook} />
      <Outcome>
        <StatusChip tone={failedFacts ? 'blocked' : 'ready'}>
          {failedFacts
            ? `${failedFacts} facts could not be calculated`
            : 'Every fact calculated'}
        </StatusChip>
        <span>
          {evaluation.items.length} items, {evaluation.period.label}, run at{' '}
          {evaluation.runAt.label.split(' (')[0]}
        </span>
      </Outcome>

      <TrialSection title={`Facts per item${facts ? `, ${facts} each` : ''}`}>
        <div className="grid">
          {evaluation.items.map((item) => {
            const errors = item.facts.filter((f) => f.error).length;
            return (
              <Disclosure
                key={`${item.kind}.${item.key}`}
                summary={
                  <>
                    <span className="font-medium">{item.key}</span>
                    <span className="text-meta text-muted">{item.kind}</span>
                    {errors ? (
                      <StatusChip tone="blocked">
                        {errors} could not be calculated
                      </StatusChip>
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
                    {item.facts.map((f) => (
                      <tr key={f.name}>
                        <td className={td}>
                          {f.label}{' '}
                          <span className="text-meta text-muted">
                            <Code>{f.name}</Code>
                          </span>
                        </td>
                        <td className={cx(td, 'tabular-nums')}>
                          {f.error ? (
                            <Mark passed={false}>{f.error}</Mark>
                          ) : (
                            <Code>{f.value ?? '—'}</Code>
                          )}
                        </td>
                      </tr>
                    ))}
                    {item.change.map((c) => (
                      <tr key={c.name}>
                        <td className={td}>
                          {c.label}{' '}
                          <span className="text-meta text-muted">
                            may change ·{' '}
                            {c.from === 'not_applicable'
                              ? 'not used for this item'
                              : 'starting value'}
                          </span>
                        </td>
                        <td className={cx(td, 'tabular-nums')}>
                          {c.error ? (
                            <Mark passed={false}>{c.error}</Mark>
                          ) : (
                            <Code>{c.display ?? c.value ?? '—'}</Code>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Disclosure>
            );
          })}
        </div>
      </TrialSection>

      <TrialSection title="When this run is">
        <Ledger className="enclosure">
          <LedgerRow label="Run at">
            {evaluation.runAt.label} ({result.chosen})
          </LedgerRow>
          <LedgerRow label="Planning">{evaluation.period.label}</LedgerRow>
          <LedgerRow label="Other periods">
            {evaluation.periods
              .filter((p) => p.index !== evaluation.period.index)
              .map((p) => p.label)
              .join('; ') || '—'}
          </LedgerRow>
          <LedgerRow label="Data">{result.source}</LedgerRow>
        </Ledger>
        <Disclosure
          summary={`Every time the sheet states, resolved (${evaluation.times.length})`}
        >
          <DataTable caption="Times resolved for this run">
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>In the sheet</th>
                <th className={th}>Resolved to</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.times.map((t) => (
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
        </Disclosure>
      </TrialSection>
    </div>
  );
}
