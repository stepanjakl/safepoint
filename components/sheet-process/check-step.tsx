'use client';

import type { ChecksReport } from '@/lib/rulebook/checks';

import { useEvaluation } from './evaluation-context';
import {
  Code,
  DataTable,
  Disclosure,
  Mark,
  TrialSection,
  td,
  th,
} from './trial-parts';

const DISPOSITION = {
  blocked: 'Blocked',
  needs_decision: 'Needs a decision',
  ready: 'Ready',
} as const;

// Shows the evaluation Calculate started: each item's rules, then the owner's checks.
export function CheckStep() {
  const { state } = useEvaluation();
  const result =
    state.kind === 'done' && state.body.kind === 'result' ? state.body : null;
  if (!result)
    return (
      <p className="text-dense text-muted">
        Press Calculate above. The rules and the sheet owner&rsquo;s checks for
        that run appear here.
      </p>
    );
  const { items } = result.evaluation;
  const { checks } = result;
  return (
    <div className="grid gap-5">
      <TrialSection title="1. Rules per item, before any proposal">
        <DataTable caption="Outcome per item">
          <thead>
            <tr>
              <th className={th}>Item</th>
              <th className={th}>Outcome</th>
              <th className={th}>Rules not met</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.kind}.${item.key}`}>
                <td className={td}>
                  {item.key} <span className="text-muted">{item.kind}</span>
                </td>
                <td className={td}>
                  <Mark passed={item.disposition === 'ready'}>
                    {DISPOSITION[item.disposition]}
                  </Mark>
                </td>
                <td className={td}>
                  {item.rules
                    .filter((r) => r.status === 'fail' || r.status === 'error')
                    .map((r) => (
                      <span key={r.id} className="block">
                        {r.sheet_rule ?? r.id} {r.title}
                        {r.status === 'error'
                          ? ` (could not run: ${r.detail})`
                          : ''}
                      </span>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {items.map((item) => (
          <Disclosure
            key={`${item.kind}.${item.key}-rules`}
            summary={`Every rule for ${item.key}`}
          >
            <ul className="text-meta grid gap-1">
              {item.rules.map((r) => (
                <li key={r.id}>
                  <Mark
                    passed={
                      r.status === 'pass' || r.status === 'not_applicable'
                    }
                  >
                    {r.status.replace('_', ' ')}
                  </Mark>{' '}
                  {r.sheet_rule ?? r.id} {r.title}
                  {r.detail ? ` · ${r.detail}` : ''}
                </li>
              ))}
            </ul>
          </Disclosure>
        ))}
      </TrialSection>

      <OwnerChecks checks={checks} title="2. The owner's checks" />
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
  return (
    <TrialSection title={title}>
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
            every rule it names is not met. {passed} of {checks.results.length}{' '}
            pass.
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
