'use client';

import type { ItemResult } from '@/lib/rulebook/engine';
import type { Condition, Term } from '@/lib/rulebook/working';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';

import { Code, DataTable, Disclosure, StatusChip, td, th } from './trial-parts';

type RuleResult = ItemResult['rules'][number];

const GLYPH: Record<Condition['result'], string> = {
  true: '✓',
  false: '✗',
  error: '!',
  not_reached: '–',
};
const SAID: Record<Condition['result'], string> = {
  true: 'holds',
  false: 'does not hold',
  error: 'cannot be evaluated',
  not_reached: 'not reached',
};
// Nesting inside groups of "and" and "or", as indentation.
const DEPTH = ['', 'ps-4', 'ps-8', 'ps-12'];

// The review's tone for the rule's result: blocked, needs a decision, ready.
function severityOf(rule: RuleResult): 0 | 1 | 3 | undefined {
  if (rule.status === 'error') return 0;
  if (rule.status === 'fail') return rule.outcome === 'block' ? 0 : 1;
  if (rule.status === 'pass') return 3;
  return undefined;
}

const sidesText = (c: Condition) =>
  c.sides ? `${c.sides.left} ${c.sides.op} ${c.sides.right}` : null;

// The relation that actually holds: "157 > 24" where the formula asked for
// at most 24, rather than "157 ≤ 24" beside a cross.
const OPPOSITE: Record<string, string> = {
  '=': '≠',
  '≠': '=',
  '<': '≥',
  '≥': '<',
  '>': '≤',
  '≤': '>',
};
const relation = (c: Condition) =>
  c.sides
    ? `${c.sides.left} ${c.result === 'false' ? (OPPOSITE[c.sides.op] ?? c.sides.op) : c.sides.op} ${c.sides.right}`
    : null;

// The computed sides, unless the condition with its values written in
// already reads the same.
const SYMBOL: Record<string, string> = {
  '<=': '≤',
  '>=': '≥',
  '!=': '≠',
  '==': '=',
};
function newSides(c: Condition) {
  const sides = sidesText(c);
  const filled = c.filled?.replace(/<=|>=|!=|==/g, (op) => SYMBOL[op]!);
  return sides && sides !== filled ? relation(c) : null;
}

const termValue = (t: Term) =>
  t.display ? `${t.display} (${t.value})` : t.value;

// What a condition read, for its tooltip.
function TermList({ terms }: { terms: Term[] }) {
  return terms.length ? (
    <ul className="text-meta grid gap-0.5">
      {terms.map((t) => (
        <li key={t.expression}>
          {t.label ?? t.expression}:{' '}
          <span className="value">{t.display ?? t.value}</span>
          {t.source ? <span className="text-muted"> · {t.source}</span> : null}
        </li>
      ))}
    </ul>
  ) : null;
}

function ConditionRow({
  condition: c,
  heading,
  severity,
}: {
  condition: Condition;
  heading: string;
  severity: 0 | 1 | 3 | undefined;
}) {
  const reached = c.result !== 'not_reached';
  const tone = c.settled ? severity : undefined;
  return (
    <li
      className={cx(
        'flex flex-wrap items-baseline gap-x-2 gap-y-0.5',
        !reached && 'text-muted',
      )}
    >
      <span className="text-meta text-muted w-20 shrink-0">{heading}</span>
      <span
        className={cx('min-w-0 flex-1', DEPTH[Math.min(c.depth, 3)])}
        data-severity={tone}
      >
        <span
          aria-hidden="true"
          className={cx(
            'me-1.5 font-semibold',
            tone === undefined ? 'text-muted' : 'text-severity-ink',
          )}
        >
          {GLYPH[c.result]}
        </span>
        <span className="sr-only">{SAID[c.result]}: </span>
        <Tooltip
          label={
            reached
              ? `${c.settled ? 'Settled the result: ' : ''}${SAID[c.result]}`
              : 'Not reached: the result was known before this condition'
          }
          description={
            reached
              ? (c.error ??
                [c.filled, newSides(c)].filter(Boolean).join('  →  '))
              : undefined
          }
          content={reached ? <TermList terms={c.terms} /> : undefined}
        >
          <span
            tabIndex={0}
            className={cx(
              'value text-meta rounded-control px-1 wrap-anywhere',
              tone === undefined
                ? 'bg-surface-inset'
                : 'bg-severity-fill text-severity-strong',
            )}
          >
            {c.text}
          </span>
        </Tooltip>
      </span>
      {reached && c.sides ? (
        <span className="value text-meta text-muted tabular-nums">
          {relation(c)}
        </span>
      ) : null}
    </li>
  );
}

// Every value the rule read, once, with its meaning and where it came from.
function TermsTable({ rule, terms }: { rule: string; terms: Term[] }) {
  return (
    <DataTable caption={`Values rule ${rule} read`}>
      <thead>
        <tr>
          <th className={th}>Meaning</th>
          <th className={th}>Value</th>
          <th className={th}>From</th>
          <th className={th}>In the formula</th>
        </tr>
      </thead>
      <tbody>
        {terms.map((t) => (
          <tr key={t.expression}>
            <td className={td}>{t.label ?? '—'}</td>
            <td className={cx(td, 'value tabular-nums')}>{termValue(t)}</td>
            <td className={td}>{t.source ?? '—'}</td>
            <td className={td}>
              <Code>{t.expression}</Code>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

// A rule's result in words and tone, rather than its status code.
const STATUS = {
  pass: { label: 'Passes', tone: 'ready' },
  block: { label: 'Blocks', tone: 'blocked' },
  attention: { label: 'Needs a decision', tone: 'decision' },
  not_applicable: { label: 'Not applicable', tone: 'neutral' },
  error: { label: 'Could not run', tone: 'blocked' },
} as const;
const status = (rule: RuleResult): keyof typeof STATUS =>
  rule.status === 'fail' ? rule.outcome : rule.status;

/*
  One rule for one item: its conditions, each marked whether it held, with
  the one that settled the result in the result's tone. Hovering or focusing
  a condition shows the values it read; the working below shows each
  condition with those values written in. It starts open where the rule did
  not pass.
*/
export function RuleWorking({ rule }: { rule: RuleResult }) {
  const name = rule.sheet_rule ?? rule.id;
  const conditions = rule.working?.conditions ?? [];
  const severity = severityOf(rule);
  const reached = conditions.filter((c) => c.result !== 'not_reached');
  const terms = [
    ...new Map(
      reached.flatMap((c) => c.terms).map((t) => [t.expression, t]),
    ).values(),
  ];
  return (
    <li className="border-rule-faint grid gap-2 border-t pt-3 pb-1 first:border-t-0 first:pt-0">
      <p className="text-dense flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip tone={STATUS[status(rule)].tone}>
          {STATUS[status(rule)].label}
        </StatusChip>
        <span>
          <strong className="font-semibold">{name}</strong> {rule.title}
        </span>
      </p>
      {rule.detail ? (
        <p className="text-meta text-muted">{rule.detail}</p>
      ) : null}
      {conditions.length ? (
        <ol className="grid gap-1" aria-label={`Conditions of rule ${name}`}>
          {conditions.map((c, i) => (
            <ConditionRow
              key={`${c.part}-${i}`}
              condition={c}
              heading={
                i === 0 || conditions[i - 1]!.part !== c.part
                  ? c.part === 'when'
                    ? 'applies if'
                    : 'requires'
                  : (c.join ?? '')
              }
              severity={severity}
            />
          ))}
        </ol>
      ) : null}
      {reached.length ? (
        <Disclosure
          bare
          summary={
            <span className="text-meta text-muted">
              Show working for {name}
            </span>
          }
          open={rule.status === 'fail' || rule.status === 'error'}
        >
          <ol className="grid gap-2">
            {reached.map((c, i) => (
              <li key={`${c.part}-${i}`} className="grid gap-0.5">
                <span>
                  <span aria-hidden="true">{GLYPH[c.result]} </span>
                  <span className="sr-only">{SAID[c.result]}: </span>
                  <Code>{c.text}</Code>
                </span>
                {c.filled ? (
                  <span className="value text-meta text-muted ps-4 wrap-anywhere">
                    = {c.filled}
                  </span>
                ) : null}
                {newSides(c) ? (
                  <span className="value text-meta text-muted ps-4 tabular-nums">
                    = {newSides(c)}
                  </span>
                ) : null}
                {c.error ? (
                  <span className="text-muted ps-4">{c.error}</span>
                ) : null}
              </li>
            ))}
          </ol>
          {terms.length ? <TermsTable rule={name} terms={terms} /> : null}
        </Disclosure>
      ) : null}
    </li>
  );
}
