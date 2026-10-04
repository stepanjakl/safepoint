'use client';

import { Ledger, LedgerRow } from '@/components/ui/ledger';
import type { Rulebook } from '@/lib/rulebook/schema';

import { Code, DataTable, Disclosure, td, th } from './trial-parts';

const Source = ({
  source,
}: {
  source: { cells: string[]; quote: string } | null;
}) =>
  source ? (
    <span className="grid gap-0.5">
      <span className="readout text-muted">{source.cells.join(', ')}</span>
      <q>{source.quote}</q>
    </span>
  ) : (
    <span className="text-muted">—</span>
  );

// Every part of a rulebook, laid out to be read and approved.
export function RulebookView({ rulebook }: { rulebook: Rulebook }) {
  const { timing } = rulebook;
  return (
    <div className="grid gap-3">
      <Ledger className="enclosure">
        <LedgerRow label="Process">{rulebook.process.name}</LedgerRow>
        <LedgerRow label="One item is">
          a {rulebook.process.item_noun}
        </LedgerRow>
        <LedgerRow label="Size">
          {rulebook.tables.length} tables, {rulebook.items.length} kinds of
          item, {rulebook.editable.length} editable values,{' '}
          {rulebook.facts.length} facts, {rulebook.rules.length} rules
        </LedgerRow>
      </Ledger>

      <Disclosure
        summary={`Sources: how each tab is trusted (${rulebook.sources.length})`}
      >
        <DataTable caption="Sources">
          <thead>
            <tr>
              <th className={th}>Tab</th>
              <th className={th}>Role</th>
              <th className={th}>Why</th>
            </tr>
          </thead>
          <tbody>
            {rulebook.sources.map((s) => (
              <tr key={s.tab}>
                <td className={td}>{s.tab}</td>
                <td className={td}>{s.role}</td>
                <td className={td}>{s.reason}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Disclosure>

      <Disclosure
        summary={`Tables: how columns are read (${rulebook.tables.length})`}
      >
        {rulebook.tables.map((table) => (
          <div key={table.name} className="grid gap-1">
            <p className="text-meta">
              <Code>{table.name}</Code> from {table.tab} · {table.shape}
              {table.key_header ? ` · key ${table.key_header}` : ''}
            </p>
            <DataTable caption={`Columns of ${table.name}`}>
              <thead>
                <tr>
                  <th className={th}>Header</th>
                  <th className={th}>Name</th>
                  <th className={th}>Type</th>
                  <th className={th}>Required</th>
                  <th className={th}>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((c) => (
                  <tr key={c.name}>
                    <td className={td}>{c.header}</td>
                    <td className={td}>
                      <Code>{c.name}</Code>
                    </td>
                    <td className={td}>
                      {c.type}
                      {c.allowed ? `: ${c.allowed.join(', ')}` : ''}
                    </td>
                    <td className={td}>{c.required ? 'Yes' : 'No'}</td>
                    <td className={td}>{c.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        ))}
      </Disclosure>

      <Disclosure summary="Timing">
        <Ledger className="enclosure">
          <LedgerRow label="Time zone">{timing.time_zone}</LedgerRow>
          <LedgerRow label="Period">
            {timing.period === 'week'
              ? `A week starting ${timing.week_starts_on}, planning ${timing.plan_ahead} ahead`
              : 'None'}
          </LedgerRow>
          <LedgerRow label="Moves on after">
            {timing.current_until ? (
              <Code>{`${timing.current_until.table}.${timing.current_until.time}`}</Code>
            ) : (
              '—'
            )}
          </LedgerRow>
          <LedgerRow label="Source">
            <Source source={timing.source} />
          </LedgerRow>
        </Ledger>
        <DataTable caption="Times">
          <thead>
            <tr>
              <th className={th}>Becomes</th>
              <th className={th}>From</th>
              <th className={th}>Role</th>
              <th className={th}>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {timing.times.map((t) => (
              <tr key={`${t.table}.${t.name}`}>
                <td className={td}>
                  <Code>{`${t.table}.${t.name}`}</Code>
                </td>
                <td className={td}>
                  {t.day} + {t.time}
                </td>
                <td className={td}>
                  {t.role === 'observation'
                    ? 'Already happened: latest before the run'
                    : 'Planned: inside the period'}
                </td>
                <td className={td}>{t.meaning}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Disclosure>

      <Disclosure
        summary={`Items and editable values (${rulebook.items.length} kinds, ${rulebook.editable.length} values)`}
      >
        <DataTable caption="Kinds of item">
          <thead>
            <tr>
              <th className={th}>Kind</th>
              <th className={th}>From</th>
              <th className={th}>Key</th>
              <th className={th}>One item per</th>
            </tr>
          </thead>
          <tbody>
            {rulebook.items.map((k) => (
              <tr key={k.kind}>
                <td className={td}>
                  {k.label} <Code>{k.kind}</Code>
                </td>
                <td className={td}>{k.table}</td>
                <td className={td}>{k.key}</td>
                <td className={td}>{k.group ? 'group of rows' : 'row'}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <DataTable caption="Editable values">
          <thead>
            <tr>
              <th className={th}>Value</th>
              <th className={th}>Applies when</th>
              <th className={th}>Starts as</th>
              <th className={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {rulebook.editable.map((e) => (
              <tr key={`${e.kind}.${e.name}`}>
                <td className={td}>
                  {e.label} <Code>{`${e.kind}.${e.name}`}</Code>{' '}
                  <span className="text-muted">{e.type}</span>
                </td>
                <td className={td}>
                  {e.applies_when ? <Code>{e.applies_when}</Code> : 'Always'}
                </td>
                <td className={td}>
                  <Code>{e.default}</Code>
                </td>
                <td className={td}>
                  <Source source={e.source} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Disclosure>

      <Disclosure summary={`Facts (${rulebook.facts.length})`}>
        <DataTable caption="Facts">
          <thead>
            <tr>
              <th className={th}>Fact</th>
              <th className={th}>Formula</th>
              <th className={th}>In words</th>
            </tr>
          </thead>
          <tbody>
            {rulebook.facts.map((f) => (
              <tr key={`${f.kind}.${f.name}`}>
                <td className={td}>
                  {f.label} <Code>{`${f.kind}.${f.name}`}</Code>{' '}
                  <span className="text-muted">{f.type}</span>
                </td>
                <td className={td}>
                  <Code>{f.expr}</Code>
                </td>
                <td className={td}>{f.explain}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Disclosure>

      <Disclosure summary={`Rules (${rulebook.rules.length})`} open>
        <DataTable caption="Rules">
          <thead>
            <tr>
              <th className={th}>Rule</th>
              <th className={th}>Formula</th>
              <th className={th}>If broken</th>
              <th className={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {rulebook.rules.map((r) => (
              <tr key={`${r.kind}.${r.id}`}>
                <td className={td}>
                  <span className="grid gap-0.5">
                    <span>
                      {r.sheet_rule ? `${r.sheet_rule} · ` : ''}
                      {r.title}
                    </span>
                    <span className="text-muted">
                      {r.kind} ·{' '}
                      {r.origin === 'model'
                        ? "the model's own suggestion"
                        : 'from the sheet'}
                    </span>
                    <span className="text-muted">{r.explain}</span>
                  </span>
                </td>
                <td className={td}>
                  <span className="grid gap-0.5">
                    {r.when ? (
                      <span>
                        when <Code>{r.when}</Code>
                      </span>
                    ) : null}
                    <span>
                      require <Code>{r.assert}</Code>
                    </span>
                  </span>
                </td>
                <td className={td}>
                  {r.outcome === 'block' ? 'Blocks' : 'Needs a decision'}
                </td>
                <td className={td}>
                  <Source source={r.source} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Disclosure>

      {rulebook.not_ruled.length || rulebook.notes.length ? (
        <Disclosure
          summary={`Not made into rules, and notes (${rulebook.not_ruled.length + rulebook.notes.length})`}
        >
          <ul className="text-meta grid gap-1">
            {rulebook.not_ruled.map((n) => (
              <li key={n.cell}>
                <span className="readout">{n.cell}</span>: {n.reason}
              </li>
            ))}
            {rulebook.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
