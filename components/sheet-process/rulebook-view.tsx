'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
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
type Answer = (
  statement: { id: string; quote: string },
  question: string,
  answer: string,
) => Promise<void>;

// An assumption: the owner confirms it, picks one of the other readings the
// model offered, or says none of them fits, optionally writing the right one.
// Each answer is kept as a decision on the statement the rule implements.
function Assumption({
  statement,
  assumption,
  alternatives,
  technical,
  answered,
  onAnswer,
}: {
  statement: { id: string; quote: string };
  assumption: string;
  alternatives: string[];
  technical?: string;
  answered?: string;
  onAnswer: Answer;
}) {
  const [correction, setCorrection] = useState('');
  const [saving, setSaving] = useState(false);
  const id = useId();
  const question = `Is it right that: ${assumption}`;
  const save = (answer: string) => {
    setSaving(true);
    void onAnswer(statement, question, answer).finally(() => setSaving(false));
  };
  return (
    <span className="grid gap-1">
      <span>
        <strong>Assumes:</strong> {assumption}
      </span>
      <Technical technical={technical} />
      {answered !== undefined ? (
        <span className="text-muted">Answered: {answered}</span>
      ) : (
        <span className="grid gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <Button
              isDisabled={saving}
              onPress={() => save(`Yes. ${assumption}`)}
            >
              Confirm
            </Button>
            {alternatives.map((alternative) => (
              <Button
                key={alternative}
                isDisabled={saving}
                onPress={() => save(`No. Instead: ${alternative}`)}
              >
                Use instead: {alternative}
              </Button>
            ))}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <label htmlFor={id} className="sr-only">
              The right reading, if none of these fits: {assumption}
            </label>
            <input
              id={id}
              type="text"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="The right reading, if none fits (optional)"
              className="field text-dense text-primary min-h-9 min-w-64 flex-1 px-3"
            />
            <Button
              isDisabled={saving}
              onPress={() =>
                save(
                  correction.trim()
                    ? `No. Instead: ${correction.trim()}`
                    : `No. None of these: ${[assumption, ...alternatives].join(' / ')}`,
                )
              }
            >
              None of these
            </Button>
          </span>
        </span>
      )}
    </span>
  );
}

// Where in the formula an assumption sits, for whoever wants to check it; the
// owner answers the plain sentence above it.
const Technical = ({ technical }: { technical?: string }) =>
  technical ? (
    <span className="text-meta text-muted">In the formula: {technical}</span>
  ) : null;

// What a rule or fact assumed. Drafts saved before alternatives existed hold
// plain sentences, and before the technical note existed lack it; they are
// shown the same, with nothing to pick from or no note.
type Assumed =
  string | { assumption: string; alternatives: string[]; technical?: string };

const Assumes = ({
  assumes,
  statement,
  answers,
  onAnswer,
}: {
  assumes?: Assumed[];
  statement?: { id: string; quote: string };
  answers?: Map<string, string>;
  onAnswer?: Answer;
}) =>
  assumes?.length ? (
    <span className="grid gap-1">
      {assumes.map((item) => {
        const { assumption, alternatives, technical } =
          typeof item === 'string'
            ? { assumption: item, alternatives: [], technical: undefined }
            : item;
        return statement && onAnswer ? (
          <Assumption
            key={assumption}
            statement={statement}
            assumption={assumption}
            alternatives={alternatives}
            technical={technical}
            answered={answers?.get(`Is it right that: ${assumption}`)}
            onAnswer={onAnswer}
          />
        ) : (
          <span key={assumption} className="grid gap-1">
            <span>
              <strong>Assumes:</strong> {assumption}
            </span>
            <Technical technical={technical} />
          </span>
        );
      })}
    </span>
  ) : null;

export function RulebookView({
  rulebook,
  onAnswer,
  answers,
}: {
  rulebook: Rulebook;
  // Given where the owner may answer assumptions.
  onAnswer?: Answer;
  // The owner's current answers, by question, shown instead of the buttons.
  answers?: Map<string, string>;
}) {
  const { timing } = rulebook;
  const statementOf = (id: string | null | undefined) => {
    const st = id ? rulebook.statements.find((s) => s.id === id) : undefined;
    return st ? { id: st.id, quote: st.source.quote } : undefined;
  };
  const covered = {
    ruled: rulebook.statements.filter((st) =>
      rulebook.rules.some((r) => r.statement === st.id),
    ).length,
    notRuled: rulebook.not_ruled.length,
    requested: rulebook.data_model_requests.length,
  };
  return (
    <div className="grid gap-3">
      <Ledger className="enclosure">
        <LedgerRow label="Process">{rulebook.process.name}</LedgerRow>
        <LedgerRow label="One item is">
          a {rulebook.process.item_noun}
        </LedgerRow>
        <LedgerRow label="Size">
          {rulebook.statements.length} policy statements,{' '}
          {rulebook.tables.length} tables, {rulebook.items.length} kinds of
          item, {rulebook.editable.length} editable values,{' '}
          {rulebook.facts.length} facts, {rulebook.rules.length} rules
        </LedgerRow>
        <LedgerRow label="Statements">
          {covered.ruled} made into rules, {covered.notRuled} not, and why
          {covered.requested ? `, ${covered.requested} still requested` : ''}
        </LedgerRow>
      </Ledger>

      <Disclosure
        summary={`Policy statements and what became of each (${rulebook.statements.length})`}
        open
      >
        <DataTable caption="Policy statements">
          <thead>
            <tr>
              <th className={th}>Statement</th>
              <th className={th}>Source</th>
              <th className={th}>Needs</th>
              <th className={th}>Became</th>
            </tr>
          </thead>
          <tbody>
            {rulebook.statements.map((st) => {
              const rules = rulebook.rules.filter((r) => r.statement === st.id);
              const defined = rulebook.facts.filter(
                (f) => f.statement === st.id,
              );
              const notRuled = rulebook.not_ruled.find(
                (n) => n.statement === st.id,
              );
              const requested = rulebook.data_model_requests.find(
                (r) => r.statement === st.id,
              );
              return (
                <tr key={st.id}>
                  <td className={td}>
                    {st.id}{' '}
                    <span className="text-muted">
                      {st.kind ?? 'no single kind'}
                      {st.checkable ? '' : ', not checkable'}
                    </span>
                  </td>
                  <td className={td}>
                    <Source source={st.source} />
                  </td>
                  <td className={td}>
                    {[
                      ...st.needs.map((n) => `${n.tab}: ${n.header}`),
                      ...st.changes.map((c) => `changes ${c}`),
                    ].join('; ') || '—'}
                  </td>
                  <td className={td}>
                    {rules.length || defined.length ? (
                      <Code>
                        {[
                          ...rules.map((r) => r.id),
                          ...defined.map((f) => `fact ${f.name}`),
                        ].join(', ')}
                      </Code>
                    ) : notRuled ? (
                      `Not a rule: ${notRuled.reason}`
                    ) : requested ? (
                      `Requested: ${requested.request}`
                    ) : (
                      '—'
                    )}
                    {!st.checkable && st.why_not ? (
                      <span className="text-muted block">{st.why_not}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <DataTable caption="Kinds of item the policy covers">
          <thead>
            <tr>
              <th className={th}>Kind</th>
              <th className={th}>From</th>
              <th className={th}>Why</th>
            </tr>
          </thead>
          <tbody>
            {rulebook.kinds.map((k) => (
              <tr key={k.kind}>
                <td className={td}>
                  {k.label} <Code>{k.kind}</Code>
                </td>
                <td className={td}>
                  {k.tab}, by {k.key_header}
                </td>
                <td className={td}>{k.why}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <DataTable caption="Values a proposal may change">
          <thead>
            <tr>
              <th className={th}>Value</th>
              <th className={th}>Meaning</th>
              <th className={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {rulebook.changeable.map((c) => (
              <tr key={`${c.kind}.${c.name}`}>
                <td className={td}>
                  <Code>{`${c.kind}.${c.name}`}</Code>
                </td>
                <td className={td}>{c.meaning}</td>
                <td className={td}>
                  {c.source ? (
                    <Source source={c.source} />
                  ) : (
                    <span className="text-muted">Set by the process</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Disclosure>

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
                <td className={td}>
                  {f.explain}
                  <Assumes
                    assumes={f.assumes}
                    statement={statementOf(f.statement)}
                    answers={answers}
                    onAnswer={onAnswer}
                  />
                </td>
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
                    <Assumes
                      assumes={r.assumes}
                      statement={statementOf(r.statement)}
                      answers={answers}
                      onAnswer={onAnswer}
                    />
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

      {rulebook.notes.length ? (
        <Disclosure summary={`The model's notes (${rulebook.notes.length})`}>
          <ul className="text-meta grid gap-1">
            {rulebook.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
