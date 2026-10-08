'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import type { Rulebook } from '@/lib/rulebook/schema';
import type { BoundTab } from '@/lib/rulebook/sheet-binding';
import type { SheetRead } from '@/lib/sheets/composio';

import { cx } from '@/lib/cx';

import { useEvaluation } from './evaluation-context';
import {
  Code,
  DataTable,
  Disclosure,
  JsonBlock,
  Lede,
  Mark,
  Outcome,
  StatusChip,
  TechnicalDetails,
  TrialControl,
  TrialSection,
  clock,
  dateTime,
  td,
  th,
  useTrial,
} from './trial-parts';

type Bound = {
  name: string;
  tab: string;
  shape: string;
  role: string | null;
  columns: Rulebook['tables'][number]['columns'];
  headers: BoundTab['headers'];
  issues: string[];
  rows: BoundTab['rows'];
};

type Response =
  | {
      kind: 'result';
      readId: string;
      source: string;
      read: SheetRead;
      rulebook: { version: number; sources: Rulebook['sources'] } | null;
      bound: Bound[] | null;
      checksTab: string | null;
    }
  | { kind: 'not_configured'; missing: string[] }
  | { kind: 'error'; message: string };

// What each role means to a reader of the tabs table.
const ROLE: Record<string, string> = {
  data: 'Data the rules read',
  policy: 'Policy: where the rules come from',
  context: 'Background, never policy',
  untrusted: 'Untrusted notes, never followed',
  ignored: 'Ignored',
};

type Capture =
  | { kind: 'result'; file: string; readAt: string; tabs: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'not_configured'; missing: string[] };

export function SheetReadStep({ toolkitVersion }: { toolkitVersion: string }) {
  const { state, run } = useTrial<Response>('/api/dev/brunch/sheet');
  const { setRead } = useEvaluation();
  const [source, setSource] = useState<'captured' | 'live'>('captured');
  const name = useId();
  const body = state.kind === 'done' ? state.body : null;
  const result = body?.kind === 'result' ? body : null;

  return (
    <div className="grid gap-4">
      <Lede>
        Reads every tab of the sheet once; every later step of this run uses
        this read. The sheet is asked which tabs it has, so none is assumed, and
        nothing is written to it.
      </Lede>
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <legend className="text-meta text-muted mb-1">Read from</legend>
        <label className="text-dense flex items-center gap-1.5">
          <input
            type="radio"
            name={`${name}-source`}
            checked={source === 'captured'}
            onChange={() => setSource('captured')}
          />
          The captured read (no network)
        </label>
        <label className="text-dense flex items-center gap-1.5">
          <input
            type="radio"
            name={`${name}-source`}
            checked={source === 'live'}
            onChange={() => setSource('live')}
          />
          The live sheet, through Composio
        </label>
      </fieldset>

      <TrialControl
        label="Read the sheet"
        runningLabel="Reading…"
        state={state}
        onRun={() => {
          setRead(null);
          void run({ source }).then((response) => {
            if (response?.kind === 'result')
              setRead({
                id: response.readId,
                label: response.source,
                readAt: response.read.readAt,
              });
          });
        }}
        summary={
          result
            ? `${result.read.tabs.length} tabs`
            : body?.kind === 'not_configured'
              ? 'Not configured'
              : body
                ? 'Failed'
                : null
        }
      />
      {body?.kind === 'not_configured' ? (
        <p className="text-dense">
          Missing in <Code>.env.local</Code>: {body.missing.join(', ')}.
        </p>
      ) : null}
      {body?.kind === 'error' ? (
        <p className="text-dense">{body.message}</p>
      ) : null}

      {result ? (
        <SheetResult result={result} toolkitVersion={toolkitVersion} />
      ) : null}
    </div>
  );
}

function SheetResult({
  result,
  toolkitVersion,
}: {
  result: Extract<Response, { kind: 'result' }>;
  toolkitVersion: string;
}) {
  const { read } = result;
  const capture = useTrial<Capture>('/api/dev/brunch/capture');
  const roleOf = (tab: string) =>
    result.rulebook?.sources.find((s) => s.tab === tab)?.role ?? null;
  const cellLink = (ref: string, tab: string) => {
    const id = read.spreadsheet.tabIds[tab];
    const cell = ref.split('!')[1];
    return id === undefined || !cell
      ? null
      : `${read.spreadsheet.url}#gid=${id}&range=${cell}`;
  };
  const rowsOf = (tab: string) =>
    read.valueRanges.find(
      (vr) =>
        vr.range
          .slice(0, vr.range.lastIndexOf('!'))
          .replace(/^'(.*)'$/, '$1') === tab,
    )?.values;
  const failed = read.requests.filter((r) => !r.successful).length;
  const issues = (result.bound ?? []).reduce(
    (sum, t) =>
      sum +
      t.issues.length +
      t.rows.flatMap((r) => r.cells).filter((c) => c.issue).length,
    0,
  );
  return (
    <div className="grid gap-4">
      <Outcome>
        <StatusChip tone={failed ? 'blocked' : issues ? 'decision' : 'ready'}>
          {failed
            ? `${failed} requests failed`
            : issues
              ? `${issues} cells to look at`
              : 'Read cleanly'}
        </StatusChip>
        <span>
          {read.tabs.length} tabs, read {dateTime(read.readAt)}
        </span>
      </Outcome>

      <DataTable caption="Tabs found">
        <thead>
          <tr>
            <th className={th}>Tab</th>
            <th className={th}>Rows</th>
            <th className={th}>What it is to the rulebook</th>
          </tr>
        </thead>
        <tbody>
          {read.tabs.map((tab) => (
            <tr key={tab}>
              <td className={td}>{tab}</td>
              <td className={cx(td, 'tabular-nums')}>
                {rowsOf(tab)?.length ?? 0}
              </td>
              <td className={td}>
                {tab === result.checksTab ? (
                  'The owner’s checks, never sent to the model'
                ) : (
                  <span className={roleOf(tab) ? undefined : 'text-muted'}>
                    {ROLE[roleOf(tab) ?? ''] ?? roleOf(tab) ?? 'Not used'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <TrialSection
        title={
          result.rulebook
            ? `How rulebook v${result.rulebook.version} reads each tab`
            : 'How the rulebook reads each tab'
        }
      >
        <div className="grid">
          {!result.bound ? (
            <p className="text-dense text-muted">
              No rulebook is approved yet, so nothing says how to read the tabs.
            </p>
          ) : (
            result.bound.map((table) => {
              const bad =
                table.rows.flatMap((r) => r.cells).filter((c) => c.issue)
                  .length + table.issues.length;
              return (
                <Disclosure
                  key={table.name}
                  summary={
                    <>
                      <span>
                        {table.tab} as <Code>{table.name}</Code>
                      </span>
                      <span className="text-meta text-muted">
                        {table.rows.length} rows
                      </span>
                      {bad ? (
                        <StatusChip tone="decision">
                          {bad} to look at
                        </StatusChip>
                      ) : null}
                    </>
                  }
                >
                  {table.issues.length ? (
                    <ul className="text-meta grid gap-1">
                      {table.issues.map((issue) => (
                        <li key={issue}>
                          <Mark passed={false}>Issue</Mark> {issue}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <DataTable caption={`Interpreted values for ${table.name}`}>
                    <thead>
                      <tr>
                        <th className={th}>Key</th>
                        {(table.rows[0]?.cells ?? []).map((cell) => (
                          <th key={cell.header} className={th}>
                            {cell.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row) => (
                        <tr key={`${row.key}-${row.cells[0]?.ref}`}>
                          <td className={td}>{row.key}</td>
                          {row.cells.map((cell) => {
                            const href = cellLink(cell.ref, table.tab);
                            return (
                              <td key={cell.header} className={td}>
                                <span className="grid gap-0.5">
                                  {cell.issue ? (
                                    <Mark passed={false}>{cell.display}</Mark>
                                  ) : (
                                    <span>{cell.display}</span>
                                  )}
                                  <span className="readout text-muted">
                                    {href ? (
                                      <a
                                        className="underline"
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {cell.ref.split('!')[1]}
                                      </a>
                                    ) : (
                                      cell.ref
                                    )}
                                  </span>
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                  <Ledger className="enclosure">
                    <LedgerRow label="Headers expected">
                      {table.headers.expected.join(', ')}
                    </LedgerRow>
                    <LedgerRow label="Headers found">
                      {table.headers.found.join(', ') || 'None'}
                    </LedgerRow>
                  </Ledger>
                  <Disclosure
                    summary={`Every conversion in ${table.tab}, in words`}
                  >
                    <ul className="text-meta grid gap-1">
                      {table.rows.flatMap((row) =>
                        row.cells.map((cell) => (
                          <li key={`${row.key}/${cell.ref}/${cell.header}`}>
                            <span className="readout">{cell.ref}</span> ·{' '}
                            {cell.header}: raw{' '}
                            {JSON.stringify(cell.raw) ?? 'blank'}. {cell.how}
                            {cell.issue ? ` ${cell.issue}` : ''}
                          </li>
                        )),
                      )}
                    </ul>
                  </Disclosure>
                </Disclosure>
              );
            })
          )}

          <TechnicalDetails>
            <Ledger className="enclosure">
              <LedgerRow label="Read">{result.source}</LedgerRow>
              <LedgerRow label="Connector">
                Composio: <Code>GOOGLESHEETS_GET_SPREADSHEET_INFO</Code> to list
                the tabs, then <Code>GOOGLESHEETS_BATCH_GET</Code> for all of
                them, toolkit version <Code>{toolkitVersion}</Code>
              </LedgerRow>
              <LedgerRow label="Options">
                <Code>UNFORMATTED_VALUE</Code> and <Code>SERIAL_NUMBER</Code>:
                numbers as numbers, times as a fraction of a day
              </LedgerRow>
              <LedgerRow label="Spreadsheet">
                {read.spreadsheet.title ?? '—'} ·{' '}
                {read.spreadsheet.timeZone ?? '?'} ·{' '}
                {read.spreadsheet.locale ?? '?'}
              </LedgerRow>
              <LedgerRow label="As">
                Composio user <Code>{read.connection.userId}</Code>, account{' '}
                <Code>{read.connection.connectedAccountId}</Code>
              </LedgerRow>
            </Ledger>
            <DataTable caption="Requests sent to Composio">
              <thead>
                <tr>
                  <th className={th}>Tool</th>
                  <th className={th}>Took</th>
                  <th className={th}>Result</th>
                </tr>
              </thead>
              <tbody>
                {read.requests.map((r) => (
                  <tr key={r.tool}>
                    <td className={td}>
                      <Code>{r.tool}</Code>
                    </td>
                    <td className={cx(td, 'tabular-nums')}>
                      {r.durationMs} ms
                    </td>
                    <td className={td}>
                      <Mark passed={r.successful}>
                        {r.successful ? 'OK' : `Failed: ${r.error}`}
                      </Mark>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Disclosure summary="Exact request arguments">
              <JsonBlock
                label="Request arguments"
                value={read.requests.map(
                  ({ tool, toolkitVersion: version, arguments: a }) => ({
                    tool,
                    toolkitVersion: version,
                    arguments: a,
                  }),
                )}
              />
            </Disclosure>
            {read.valueRanges.map((range) => (
              <Disclosure
                key={range.range}
                summary={`${range.range}, raw values`}
              >
                <JsonBlock
                  label={`Raw values for ${range.range}`}
                  value={range.values ?? []}
                />
              </Disclosure>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onPress={() => void capture.run()}
                isDisabled={capture.state.kind === 'running'}
              >
                Save a live read as the captured read
              </Button>
              <p role="status" className="text-meta text-muted">
                {capture.state.kind === 'running'
                  ? 'Reading and saving…'
                  : capture.state.kind === 'done'
                    ? capture.state.body.kind === 'result'
                      ? `Saved ${capture.state.body.tabs.length} tabs to ${capture.state.body.file} at ${clock(capture.state.body.readAt)}. Commit it to keep it.`
                      : capture.state.body.kind === 'not_configured'
                        ? `Missing: ${capture.state.body.missing.join(', ')}`
                        : capture.state.body.message
                    : ''}
              </p>
            </div>
          </TechnicalDetails>
        </div>
      </TrialSection>
    </div>
  );
}
