'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import type { Rulebook } from '@/lib/rulebook/schema';
import type { BoundTab } from '@/lib/rulebook/sheet-binding';
import type { SheetRead } from '@/lib/sheets/composio';

import {
  Code,
  DataTable,
  Disclosure,
  JsonBlock,
  Mark,
  TrialControl,
  TrialSection,
  clock,
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
      source: string;
      read: SheetRead;
      rulebook: { version: number; sources: Rulebook['sources'] } | null;
      bound: Bound[] | null;
    }
  | { kind: 'not_configured'; missing: string[] }
  | { kind: 'error'; message: string };

type Capture =
  | { kind: 'result'; file: string; readAt: string; tabs: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'not_configured'; missing: string[] };

export function SheetReadStep({ toolkitVersion }: { toolkitVersion: string }) {
  const { state, run } = useTrial<Response>('/api/dev/brunch/sheet');
  const capture = useTrial<Capture>('/api/dev/brunch/capture');
  const [source, setSource] = useState<'captured' | 'live'>('captured');
  const name = useId();
  const body = state.kind === 'done' ? state.body : null;
  const result = body?.kind === 'result' ? body : null;

  return (
    <div className="grid gap-4">
      <p className="text-dense">
        Reads every tab of the sheet. Nothing about the tabs is assumed: the
        sheet is asked which tabs it has, then all of them are fetched. Nothing
        is written to it.
      </p>
      <Ledger className="enclosure">
        <LedgerRow label="Connector">
          Composio: <Code>GOOGLESHEETS_GET_SPREADSHEET_INFO</Code> to list the
          tabs, then <Code>GOOGLESHEETS_BATCH_GET</Code> for all of them,
          toolkit version <Code>{toolkitVersion}</Code>
        </LedgerRow>
        <LedgerRow label="Options">
          <Code>UNFORMATTED_VALUE</Code> and <Code>SERIAL_NUMBER</Code>: numbers
          as numbers, times as a fraction of a day
        </LedgerRow>
        <LedgerRow label="Captured read">
          The last live read saved in the repository, so tests and the default
          view need no network
        </LedgerRow>
      </Ledger>

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
          A live read through Composio
        </label>
      </fieldset>

      <TrialControl
        label="Read sheet"
        runningLabel="Reading…"
        state={state}
        onRun={() => void run({ source })}
        summary={
          result
            ? `${result.read.tabs.length} tabs${result.bound ? `, read by rulebook v${result.rulebook?.version}` : ', no rulebook approved yet'}`
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

      {result ? <SheetResult result={result} /> : null}
    </div>
  );
}

function SheetResult({
  result,
}: {
  result: Extract<Response, { kind: 'result' }>;
}) {
  const { read } = result;
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
  return (
    <div className="grid gap-5">
      <TrialSection title="1. Where it came from">
        <Ledger className="enclosure">
          <LedgerRow label="Read">{result.source}</LedgerRow>
          <LedgerRow label="Spreadsheet">
            {read.spreadsheet.title ?? '—'} · {read.spreadsheet.timeZone ?? '?'}{' '}
            · {read.spreadsheet.locale ?? '?'}
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
                <td className={td}>{r.durationMs} ms</td>
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
              ({ tool, toolkitVersion, arguments: a }) => ({
                tool,
                toolkitVersion,
                arguments: a,
              }),
            )}
          />
        </Disclosure>
      </TrialSection>

      <TrialSection title="2. What came back">
        <DataTable caption="Tabs found">
          <thead>
            <tr>
              <th className={th}>Tab</th>
              <th className={th}>Rows</th>
              <th className={th}>Role in the approved rulebook</th>
            </tr>
          </thead>
          <tbody>
            {read.tabs.map((tab) => (
              <tr key={tab}>
                <td className={td}>{tab}</td>
                <td className={td}>{rowsOf(tab)?.length ?? 0}</td>
                <td className={td}>
                  {tab === 'Checks'
                    ? 'The store’s checks: never sent to the model'
                    : (roleOf(tab) ?? '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {read.valueRanges.map((range) => (
          <Disclosure key={range.range} summary={`${range.range} · raw values`}>
            <JsonBlock
              label={`Raw values for ${range.range}`}
              value={range.values ?? []}
            />
          </Disclosure>
        ))}
      </TrialSection>

      <TrialSection title="3. How the approved rulebook reads it">
        {!result.bound ? (
          <p className="text-dense text-muted">
            No rulebook is approved yet. Draft and approve one in the Rules
            step; this section then shows every cell as the rulebook reads it.
          </p>
        ) : (
          result.bound.map((table) => (
            <Disclosure
              key={table.name}
              summary={
                <>
                  <Code>{table.name}</Code> from {table.tab} ·{' '}
                  {table.rows.length} rows ·{' '}
                  <Mark passed={table.issues.length === 0}>
                    {table.issues.length
                      ? `${table.issues.length} issues`
                      : 'No issues'}
                  </Mark>
                </>
              }
            >
              <Ledger className="enclosure">
                <LedgerRow label="Headers expected">
                  {table.headers.expected.join(', ')}
                </LedgerRow>
                <LedgerRow label="Headers found">
                  {table.headers.found.join(', ') || 'None'}
                </LedgerRow>
              </Ledger>
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
                                )}{' '}
                                · raw {JSON.stringify(cell.raw) ?? 'blank'}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <Disclosure
                summary={`Every conversion in ${table.tab}, in words`}
              >
                <ul className="text-meta grid gap-1">
                  {table.rows.flatMap((row) =>
                    row.cells.map((cell) => (
                      <li key={`${row.key}/${cell.ref}/${cell.header}`}>
                        <span className="readout">{cell.ref}</span> ·{' '}
                        {cell.header}: {cell.how}
                        {cell.issue ? ` ${cell.issue}` : ''}
                      </li>
                    )),
                  )}
                </ul>
              </Disclosure>
              {table.issues.length ? (
                <ul className="text-meta grid gap-1">
                  {table.issues.map((issue) => (
                    <li key={issue}>
                      <Mark passed={false}>Issue</Mark> {issue}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Disclosure>
          ))
        )}
      </TrialSection>
    </div>
  );
}
