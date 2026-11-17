'use client';

import { useContext, useMemo, type ReactNode } from 'react';

import { CardAnchor } from '@/components/engine/rules/card-anchor';
import { TRIED_VARIABLE, said } from '@/components/engine/rules-parts';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';
import type { DefinitionSubject } from '@/lib/engine/subject';
import type { Definition } from '@/lib/engine/types';

// Where a formula breaks: before each condition joined at its top level by
// || or &&, and, where a condition is a bracketed group of such conditions,
// inside the group one level deeper.
type FormulaLineText = { text: string; level: number };

function splitTop(formula: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < formula.length; i++) {
    const c = formula[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (
      depth === 0 &&
      i > start &&
      (formula.startsWith('||', i) || formula.startsWith('&&', i))
    ) {
      parts.push(formula.slice(start, i).trim());
      start = i;
      i++;
    }
  }
  parts.push(formula.slice(start).trim());
  return parts;
}

// The bracket that closes the one opening at `at`, or -1.
function closing(text: string, at: number): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function linesOf(formula: string, level = 0): FormulaLineText[] {
  return splitTop(formula).flatMap((part) => {
    const lead = /^(\|\||&&)\s*/.exec(part)?.[0] ?? '';
    const rest = part.slice(lead.length);
    const inner =
      rest.startsWith('(') && closing(rest, 0) === rest.length - 1
        ? rest.slice(1, -1)
        : null;
    const nested = inner === null ? [] : splitTop(inner);
    if (nested.length < 2) return [{ text: part, level }];
    const lines = linesOf(inner!, level + 1);
    lines[0] = { text: `${lead}(${lines[0]!.text}`, level };
    lines[lines.length - 1]!.text += ')';
    return lines;
  });
}

// What the definition brings to its formula: blue, dotted, with what it is on
// hover.
// Names in a read-only formula take their colour from their lit-name class
// (rules-step.css), so a lit place can deepen it.

/*
  What a read-only name is linked by, so hovering one lights every place it
  is shown: a calculation across the rulebook, a number or group within its
  own definition, which is the only one that holds it.
*/
export const linkKey = (item: Definition, root: string, field: string) =>
  root === 'values' ? `values.${field}` : `${item.id}:${root}.${field}`;
export const linked = (key: string, hot: string | null) => ({
  'data-link': key,
  'data-hot': hot === key ? '' : undefined,
});
const DOTTED =
  'text-state-advisory decoration-state-advisory underline decoration-dotted underline-offset-2';

const TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)|\b([A-Za-z_]\w*)\b/g;

// One line of a formula, each name drawn by what it reads.
// A line one level in sits under the condition it opens; a line too long
// for the box wraps under its own start, past its operator.
const LEVEL = ['', 'ml-6', 'ml-12', 'ml-18'];

function FormulaLine({
  line,
  level,
  item,
  names,
  reads,
  still,
  hot,
  readRoots,
  proposal,
}: {
  line: string;
  level: number;
  item: Definition;
  names: Record<string, string>;
  reads: Definition[];
  still: boolean;
  hot: string | null;
  // The names a formula reads data by, and the proposal's fields.
  readRoots: string[];
  proposal: Set<string>;
}) {
  const anchor = useContext(CardAnchor);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of line.matchAll(TOKEN)) {
    const [whole, text, root, field, bare] = match;
    const index = match.index;
    if (index > at) parts.push(line.slice(at, index));
    at = index + whole.length;
    const key = `${index}`;
    if (text)
      parts.push(
        <span key={key} className="text-muted">
          {text}
        </span>,
      );
    else if (root === 'values') {
      const read = reads.find((d) => d.id === field);
      const about = read
        ? `A calculation this formula reads: ${read.name}. On its examples, ${read.examples
            .map((e) => `${e.key} gives ${said(read, e.expect)}`)
            .join(', ')}.`
        : null;
      const link = (
        <a key={key} href={`#${anchor(field!)}`} className={DOTTED}>
          {whole}
        </a>
      );
      parts.push(
        still ? (
          <span
            key={key}
            {...linked(linkKey(item, 'values', field!), hot)}
            className="rules-linked rules-linked-calculation"
          >
            {whole}
          </span>
        ) : about ? (
          <Tooltip key={key} label={whole} description={about}>
            {link}
          </Tooltip>
        ) : (
          link
        ),
      );
    } else if (root === 'constants' || root === 'groups') {
      const constant = item.constants.find((c) => c.id === field);
      const group = item.groups.find((g) => g.id === field);
      const about = constant
        ? `A number from the instructions: ${constant.value}, from “${constant.quote}”.`
        : group
          ? `Records the instructions name: ${group.keys.map((k) => (names[k] ? `${k} [${names[k]}]` : k)).join(', ')}, from “${group.quote}”.`
          : null;
      parts.push(
        about && still ? (
          <span
            key={key}
            {...linked(linkKey(item, root, field!), hot)}
            className="rules-linked rules-linked-name"
          >
            {whole}
          </span>
        ) : about ? (
          <Tooltip key={key} label={whole} description={about}>
            <span tabIndex={0} className={cx(DOTTED, 'cursor-help')}>
              {whole}
            </span>
          </Tooltip>
        ) : (
          whole
        ),
      );
    } else if (root && readRoots.includes(root))
      parts.push(
        <span key={key}>
          <span className="text-muted">{root}.</span>
          <span className="text-primary font-medium">{field}</span>
        </span>,
      );
    else if (bare && proposal.has(bare) && still)
      parts.push(
        <span key={key} className={TRIED_VARIABLE}>
          {bare}
        </span>,
      );
    else if (bare && proposal.has(bare)) {
      parts.push(
        <Tooltip
          key={key}
          label={bare}
          description="The value being proposed. Each example sets it, to show where the check holds and where it fails."
        >
          <span tabIndex={0} className={cx(TRIED_VARIABLE, 'cursor-help')}>
            {bare}
          </span>
        </Tooltip>,
      );
    } else if (bare === 'key')
      parts.push(
        <span key={key} className="text-primary font-medium">
          {bare}
        </span>,
      );
    else parts.push(whole);
  }
  if (at < line.length) parts.push(line.slice(at));
  return (
    <div className={cx('pl-6 -indent-6 break-words', LEVEL[level] ?? LEVEL[3])}>
      {parts}
    </div>
  );
}

/*
  The formula as the app runs it: one condition to a line, the data it reads
  in the primary ink, the proposal in its own tone, and what the definition
  brings to it -- the calculations it reads, its constants and groups -- with
  what each is on hover; a calculation also links to its card.
*/
export function Formula({
  subject,
  item,
  formula,
  names,
  reads,
  face = 'bg-surface-floating',
  still = false,
  hot = null,
}: {
  // What the process's formulas read and set.
  subject: DefinitionSubject;
  item: Definition;
  formula: string;
  names: Record<string, string>;
  reads: Definition[];
  // Its fill: floating on the primary box it sits in, or a recess where the
  // card around it is floating already.
  face?: 'bg-surface-floating' | 'bg-surface-inset';
  // Read only: names keep their colour but open nothing, and a calculation
  // it reads is named in its own colour, without a past run's examples.
  still?: boolean;
  // The linked name under the pointer, lit wherever it is shown.
  hot?: string | null;
}) {
  const readRoots = useMemo(
    () => ['record', ...subject.data.lookups.map((lookup) => lookup.as)],
    [subject],
  );
  // The proposal's fields: what each example sets, by the name a formula
  // reads. Drawn the same in the formula and in each example's heading.
  const proposal = useMemo(
    () => new Set(subject.proposal.map((field) => field.id)),
    [subject],
  );
  return (
    <div
      role="group"
      aria-label={`Formula of ${item.name}`}
      className={cx(
        // Isolated: a lit name's face sits under its text (rules-step.css).
        'rules-formula value text-meta rounded-control isolate grid gap-0.5 px-3 py-2',
        face,
      )}
    >
      {linesOf(formula).map((line, index) => (
        <FormulaLine
          key={index}
          line={line.text}
          level={line.level}
          item={item}
          names={names}
          reads={reads}
          still={still}
          hot={hot}
          readRoots={readRoots}
          proposal={proposal}
        />
      ))}
    </div>
  );
}
