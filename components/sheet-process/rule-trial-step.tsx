'use client';

import { Ledger, LedgerRow } from '@/components/ui/ledger';
import type { RuleTrialReport } from '@/lib/processes/avocado-toast/rule-trial';

import {
  Code,
  DataTable,
  Disclosure,
  Mark,
  TrialControl,
  TrialSection,
  td,
  th,
  useTrial,
} from './trial-parts';

type Response =
  | { kind: 'result'; report: RuleTrialReport }
  | { kind: 'error'; message: string };
type Outcome =
  RuleTrialReport['rules'][number]['examples'][number]['outcomes'][string];

export function RuleTrialStep({
  ruleCount,
  sections,
}: {
  ruleCount: number;
  sections: readonly string[];
}) {
  const { state, run } = useTrial<Response>('/api/dev/brunch/rules');
  const report =
    state.kind === 'done' && state.body.kind === 'result'
      ? state.body.report
      : null;

  return (
    <div className="grid gap-4">
      <p className="text-dense">
        Your rules will become formulas in CEL, a small expression language that
        can only read the values it is given and always finishes. Two JavaScript
        libraries could run them. This trial asks both the same questions and
        shows every answer.
      </p>
      <Ledger className="enclosure">
        <LedgerRow label="Your rules">
          {ruleCount} rules from the Rules tab, written by hand as formulas,
          each with examples just inside and just outside its limit
        </LedgerRow>
        <LedgerRow label="Traps">
          Mixed number types, a misspelt field, a type error, an oversized
          formula, whole-number division
        </LedgerRow>
        <LedgerRow label="Official tests">
          CEL conformance suite, sections: {sections.join(', ')}
        </LedgerRow>
        <LedgerRow label="Units">
          Money in whole pence, times in minutes since Monday 00:00, so no
          fractions creep in
        </LedgerRow>
        <LedgerRow label="Runs on">The server, with no network calls</LedgerRow>
      </Ledger>

      <TrialControl
        label="Test formula engines"
        runningLabel="Testing…"
        state={state}
        onRun={() => void run()}
        summary={
          report
            ? `${report.engines.length} libraries tested in ${report.durationMs} ms`
            : null
        }
      />

      {state.kind === 'done' && state.body.kind === 'error' ? (
        <p className="text-dense">{state.body.message}</p>
      ) : null}
      {report ? <TrialReport report={report} /> : null}
    </div>
  );
}

function OutcomeCell({ outcome }: { outcome: Outcome | undefined }) {
  if (!outcome) return <td className={td}>—</td>;
  const { result, check } = outcome;
  return (
    <td className={td}>
      <span className="grid gap-0.5">
        <Mark passed={outcome.passed} />
        <span className="readout text-muted">
          {result.ok
            ? result.display
            : `error at ${result.stage}: ${result.error}`}
        </span>
        {check.status === 'invalid' ? (
          <span className="readout text-muted">check: {check.error}</span>
        ) : null}
      </span>
    </td>
  );
}

function TrialReport({ report }: { report: RuleTrialReport }) {
  const engines = report.engines;
  const name = (id: string) => engines.find((e) => e.id === id)?.name ?? id;
  return (
    <div className="grid gap-5">
      <TrialSection title="Result">
        <DataTable caption="Summary per library">
          <thead>
            <tr>
              <th className={th}>Library</th>
              <th className={th}>Checks formulas before running</th>
              <th className={th}>Official tests</th>
              <th className={th}>Your rule examples and facts</th>
              <th className={th}>Traps</th>
            </tr>
          </thead>
          <tbody>
            {report.summary.map((row) => {
              const engine = engines.find((e) => e.id === row.engine)!;
              return (
                <tr key={row.engine}>
                  <td className={td}>
                    {engine.name}{' '}
                    <span className="text-muted">
                      {engine.packageName}@{engine.version} · {engine.license}
                    </span>
                  </td>
                  <td className={td}>
                    <Mark passed={row.staticCheck}>
                      {row.staticCheck ? 'Yes' : 'No'}
                    </Mark>
                  </td>
                  <td className={td}>
                    <Mark
                      passed={row.conformancePassed === row.conformanceTotal}
                    >
                      {row.conformancePassed} / {row.conformanceTotal}
                    </Mark>
                  </td>
                  <td className={td}>
                    <Mark passed={row.examplesPassed === row.examplesTotal}>
                      {row.examplesPassed} / {row.examplesTotal}
                    </Mark>
                  </td>
                  <td className={td}>
                    <Mark passed={row.trapsPassed === row.trapsTotal}>
                      {row.trapsPassed} / {row.trapsTotal}
                    </Mark>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <p className="text-dense">{report.suggestion}</p>
        <Ledger className="enclosure">
          {engines.map((engine) => (
            <LedgerRow key={engine.id} label={`${engine.name} limits`}>
              {engine.limits}
            </LedgerRow>
          ))}
        </Ledger>
      </TrialSection>

      <TrialSection title="Your rules as formulas">
        {report.rules.map((rule) => (
          <Disclosure
            key={rule.id}
            summary={
              <>
                {rule.id} · {rule.wording}{' '}
                <Mark
                  passed={rule.examples.every((e) =>
                    Object.values(e.outcomes).every((o) => o.passed),
                  )}
                />
              </>
            }
          >
            <Ledger className="enclosure">
              <LedgerRow label="Sheet wording">{rule.wording}</LedgerRow>
              <LedgerRow label="If broken">
                {rule.outcome === 'block'
                  ? 'Blocks the item'
                  : 'Needs a decision'}
              </LedgerRow>
              <LedgerRow label="Formula">
                <Code>{rule.formula}</Code>
              </LedgerRow>
              <LedgerRow label="Fields">
                {Object.entries(rule.variables)
                  .map(([field, type]) => `${field}: ${type}`)
                  .join(' · ')}
              </LedgerRow>
              {engines.map((engine) => {
                const check = rule.examples[0]?.outcomes[engine.id]?.check;
                return (
                  <LedgerRow key={engine.id} label={`${engine.name} check`}>
                    {check?.status === 'valid'
                      ? `Valid, returns ${check.type}`
                      : check?.status === 'invalid'
                        ? `Invalid: ${check.error}`
                        : (check?.note ?? '—')}
                  </LedgerRow>
                );
              })}
            </Ledger>
            <DataTable caption={`Examples for ${rule.id}`}>
              <thead>
                <tr>
                  <th className={th}>Example</th>
                  <th className={th}>Values given</th>
                  <th className={th}>Expected</th>
                  {engines.map((e) => (
                    <th key={e.id} className={th}>
                      {e.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rule.examples.map((example) => (
                  <tr key={example.label}>
                    <td className={td}>{example.label}</td>
                    <td className={td}>
                      <span className="readout">
                        {Object.entries(example.given)
                          .map(([k, v]) => `${k} = ${v}`)
                          .join(', ')}
                      </span>
                    </td>
                    <td className={td}>
                      {example.expect ? 'holds' : 'broken'}
                    </td>
                    {engines.map((e) => (
                      <OutcomeCell
                        key={e.id}
                        outcome={example.outcomes[e.id]}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Disclosure>
        ))}
      </TrialSection>

      <TrialSection title="Calculated facts">
        <DataTable caption="Calculated facts">
          <thead>
            <tr>
              <th className={th}>Fact</th>
              <th className={th}>Formula and values</th>
              <th className={th}>Expected</th>
              {engines.map((e) => (
                <th key={e.id} className={th}>
                  {e.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.facts.map((fact) => (
              <tr key={fact.id}>
                <td className={td}>{fact.label}</td>
                <td className={td}>
                  <span className="grid gap-0.5">
                    <Code>{fact.formula}</Code>
                    <span className="readout text-muted">
                      {Object.entries(fact.given)
                        .map(([k, v]) => `${k} = ${v}`)
                        .join(', ')}
                    </span>
                    <span className="text-muted">{fact.arithmetic}</span>
                  </span>
                </td>
                <td className={td}>{fact.expect}</td>
                {engines.map((e) => (
                  <OutcomeCell key={e.id} outcome={fact.outcomes[e.id]} />
                ))}
              </tr>
            ))}
          </tbody>
        </DataTable>
        <Ledger className="enclosure">
          <LedgerRow label="Floating point">
            <Code>{report.floatingPoint.naive}</Code> ={' '}
            {report.floatingPoint.naiveResult}
          </LedgerRow>
          <LedgerRow label="Whole numbers">
            <Code>{report.floatingPoint.integer}</Code> ={' '}
            {report.floatingPoint.integerResult}
          </LedgerRow>
          <LedgerRow label="Why it matters">
            In floating point, 50 × 1.1 is 55.00000000000001, so rounding up
            orders one unit too many. Counts and money stay whole numbers
            throughout.
          </LedgerRow>
        </Ledger>
      </TrialSection>

      <TrialSection title="Traps">
        <DataTable caption="Traps">
          <thead>
            <tr>
              <th className={th}>Trap</th>
              <th className={th}>Formula</th>
              <th className={th}>Safe behaviour</th>
              {engines.map((e) => (
                <th key={e.id} className={th}>
                  {e.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.traps.map((trap) => (
              <tr key={trap.id}>
                <td className={td}>
                  <span className="grid gap-0.5">
                    {trap.label}
                    <span className="text-muted">{trap.why}</span>
                  </span>
                </td>
                <td className={td}>
                  <Code>
                    {trap.formula.length > 60
                      ? `${trap.formula.slice(0, 57)}…`
                      : trap.formula}
                  </Code>
                </td>
                <td className={td}>
                  {trap.expect === 'refused'
                    ? 'Refused'
                    : `Returns ${trap.expect}`}
                </td>
                {engines.map((e) => {
                  const outcome = trap.outcomes[e.id];
                  return (
                    <td key={e.id} className={td}>
                      <span className="grid gap-0.5">
                        <Mark passed={outcome?.passed ?? null} />
                        <span className="readout text-muted">
                          {outcome?.caught === 'check'
                            ? 'Refused when checked'
                            : outcome?.caught === 'run'
                              ? 'Refused only when run'
                              : !outcome
                                ? '—'
                                : outcome.result.ok
                                  ? outcome.result.display
                                  : outcome.result.error}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TrialSection>

      <TrialSection title="The toolbox">
        <p className="text-meta text-muted">
          The only functions a formula can call besides CEL&rsquo;s own. The
          source shown is the code that ran.
        </p>
        {report.toolbox.map((fn) => (
          <Disclosure key={fn.signature} summary={<Code>{fn.signature}</Code>}>
            <p className="text-meta">{fn.summary}</p>
            <pre className="bg-surface-inset rounded-control readout max-w-full overflow-auto p-3">
              {fn.source}
            </pre>
          </Disclosure>
        ))}
      </TrialSection>

      <TrialSection title="Official conformance tests">
        {report.conformance.map((c) => (
          <Disclosure
            key={c.engine}
            summary={
              <>
                {name(c.engine)} · {c.passed} passed, {c.failed} failed{' '}
                <Mark passed={c.failed === 0} />
              </>
            }
          >
            <p className="text-meta text-muted">{c.source}</p>
            <DataTable caption={`Conformance by section for ${name(c.engine)}`}>
              <thead>
                <tr>
                  <th className={th}>Section</th>
                  <th className={th}>Passed</th>
                  <th className={th}>Failed</th>
                </tr>
              </thead>
              <tbody>
                {c.sections.map((s) => (
                  <tr key={s.name}>
                    <td className={td}>{s.name}</td>
                    <td className={td}>{s.passed}</td>
                    <td className={td}>{s.failed}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <p className="text-meta">
              Not compared:{' '}
              {c.skipped
                .map(
                  (s) =>
                    `${s.count} (${s.reason.toLowerCase().replace(/\.$/, '')})`,
                )
                .join('; ')}
              .
            </p>
            {c.failures.length ? (
              <DataTable caption={`First failures for ${name(c.engine)}`}>
                <thead>
                  <tr>
                    <th className={th}>Test</th>
                    <th className={th}>Expression</th>
                    <th className={th}>Expected</th>
                    <th className={th}>Got</th>
                  </tr>
                </thead>
                <tbody>
                  {c.failures.map((f) => (
                    <tr key={`${f.section}/${f.name}/${f.expression}`}>
                      <td className={td}>
                        {f.section} · {f.name}
                      </td>
                      <td className={td}>
                        <Code>{f.expression}</Code>
                      </td>
                      <td className={td}>{f.expected}</td>
                      <td className={td}>{f.actual}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : null}
          </Disclosure>
        ))}
      </TrialSection>
    </div>
  );
}
