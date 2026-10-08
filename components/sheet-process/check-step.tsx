'use client';

import { useState } from 'react';

import type { ChecksReport } from '@/lib/rulebook/checks';

import {
  rulebookName,
  useEvaluation,
  type EvaluateResponse,
} from './evaluation-context';
import { RuleWorking } from './rule-working';
import { RulebookDrift, UnderTest } from './rulebook-drift';
import { WhatIfBanner, WhatIfForm } from './what-if';
import {
  Code,
  DataTable,
  Disclosure,
  Lede,
  Mark,
  Outcome,
  StatusChip,
  TrialSection,
  td,
  th,
} from './trial-parts';

type Result = Extract<EvaluateResponse, { kind: 'result' }>;

const DISPOSITION = {
  blocked: { label: 'Blocked', tone: 'blocked' },
  needs_decision: { label: 'Needs a decision', tone: 'decision' },
  ready: { label: 'Ready', tone: 'ready' },
} as const;

// Shows the evaluation Calculate started: each item's rules, then the owner's checks.
export function CheckStep() {
  const { state } = useEvaluation();
  // While a what-if reruns, the last result stays, so open sections and
  // focus are kept.
  const [last, setLast] = useState<Result | null>(null);
  const current =
    state.kind === 'done' && state.body.kind === 'result' ? state.body : null;
  if (current && current !== last) setLast(current);
  const result = current ?? (state.kind === 'running' ? last : null);
  if (!result)
    return (
      <Lede>
        Checks every rule on every item. It runs with Calculate, on the same
        read and rulebook, so press Calculate first.
      </Lede>
    );
  return <CheckResults result={result} />;
}

/*
  One evaluation's rules and the owner's checks: the counts first, then one
  row per item that opens to its rules and their working, then whether the
  rulebook agrees with what the owner expects. The run's Check step and the
  Rulebook tab's test of a draft both show it.
*/
export function CheckResults({
  result,
  inContext = false,
}: {
  result: Result;
  // Where the rulebook under test and its health are already shown above.
  inContext?: boolean;
}) {
  const { items } = result.evaluation;
  const count = (d: keyof typeof DISPOSITION) =>
    items.filter((i) => i.disposition === d).length;
  return (
    <div className="grid gap-6">
      {inContext ? null : <UnderTest rulebook={result.rulebook} />}
      {inContext ? null : (
        <RulebookDrift
          name={rulebookName(result.rulebook)}
          consequence="Its results below may be wrong until a new version is drafted and approved."
          issues={result.drift}
          compact
        />
      )}
      <TrialSection title="Rules per item, before any proposal">
        <Outcome>
          {(Object.keys(DISPOSITION) as (keyof typeof DISPOSITION)[]).map(
            (d) =>
              count(d) ? (
                <StatusChip key={d} tone={DISPOSITION[d].tone}>
                  {count(d)} {DISPOSITION[d].label.toLowerCase()}
                </StatusChip>
              ) : null,
          )}
          <span className="text-dense text-muted">of {items.length} items</span>
        </Outcome>
        <WhatIfBanner items={items} />
        <ul className="grid" aria-label="Items and their rules">
          {items.map((item) => {
            const unmet = item.rules.filter(
              (r) => r.status === 'fail' || r.status === 'error',
            );
            return (
              <li key={`${item.kind}.${item.key}`}>
                <Disclosure
                  summary={
                    <>
                      <span className="font-medium">{item.key}</span>
                      <span className="text-meta text-muted">{item.kind}</span>
                      <StatusChip tone={DISPOSITION[item.disposition].tone}>
                        {DISPOSITION[item.disposition].label}
                      </StatusChip>
                      {unmet.length ? (
                        <span className="text-meta text-muted">
                          {unmet
                            .map(
                              (r) =>
                                `${r.sheet_rule ?? r.id}${r.status === 'error' ? ' (could not run)' : ''}`,
                            )
                            .join(', ')}
                        </span>
                      ) : null}
                    </>
                  }
                >
                  <WhatIfForm item={item} issues={result.whatIfIssues} />
                  <ul className="grid" aria-label={`Rules for ${item.key}`}>
                    {item.rules.map((r) => (
                      <RuleWorking key={r.id} rule={r} />
                    ))}
                  </ul>
                </Disclosure>
              </li>
            );
          })}
        </ul>
      </TrialSection>

      <OwnerChecks checks={result.checks} title="The owner's checks" />
    </div>
  );
}

// The owner's checks for one rulebook, expected against actual. Shared with
// the Rules step, which scores each draft before anyone approves it.
export function OwnerChecks({
  checks,
  title,
}: {
  checks: ChecksReport;
  title: string;
}) {
  const passed = checks.results.filter((c) => c.passed).length;
  const total = checks.results.length;
  return (
    <TrialSection title={title}>
      {checks.found ? (
        <Outcome>
          <StatusChip
            tone={passed === total ? 'ready' : passed ? 'decision' : 'blocked'}
          >
            {passed} of {total} agree
          </StatusChip>
          <span className="text-dense text-muted">
            with what the sheet&rsquo;s owner expects
          </span>
        </Outcome>
      ) : null}
      {!checks.found ? (
        <p className="text-dense text-muted">
          The sheet has no tab of checks: one whose header row has check_id,
          item and expect.
        </p>
      ) : (
        <>
          <p className="text-dense">
            From the {checks.tab} tab, written by the sheet&rsquo;s owner and
            never shown to the model. Each one sets values on an item at a run
            time: an exact run_at, or a weekday and time in the week of{' '}
            {checks.reference.day}/{checks.reference.month}/
            {checks.reference.year}. A check passes when the outcome matches and
            every rule it names is not met.
          </p>
          {checks.missingHeaders.length ? (
            <p className="text-dense">
              <Mark passed={false}>Missing headers</Mark>{' '}
              {checks.missingHeaders.join(', ')}
            </p>
          ) : null}
          <DataTable caption="The owner's checks, expected against actual">
            <thead>
              <tr>
                <th className={th}>Check</th>
                <th className={th}>Run and values</th>
                <th className={th}>Expected</th>
                <th className={th}>Actual</th>
              </tr>
            </thead>
            <tbody>
              {checks.results.map((c) => (
                <tr key={c.id}>
                  <td className={td}>
                    <Mark passed={c.passed}>{c.id}</Mark>{' '}
                    <span className="readout text-muted">{c.ref}</span>
                    {c.note ? (
                      <span className="text-muted block">{c.note}</span>
                    ) : null}
                  </td>
                  <td className={td}>
                    {c.item} · {c.runAt || '—'}
                    {c.set ? (
                      <span className="block">
                        <Code>{c.set}</Code>
                      </span>
                    ) : null}
                  </td>
                  <td className={td}>
                    {c.expect}{' '}
                    {c.because.length ? `by ${c.because.join(', ')}` : ''}
                  </td>
                  <td className={td}>
                    {c.problem ? (
                      <Mark passed={false}>{c.problem}</Mark>
                    ) : (
                      <>
                        {c.actual}{' '}
                        {c.decidedBy.length
                          ? `by ${c.decidedBy.join(', ')}`
                          : ''}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </TrialSection>
  );
}
