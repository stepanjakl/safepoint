import type { DefinitionSubject } from '@/lib/process/model';

import {
  MOMENT_PREFIX,
  momentColumn,
  READ,
  recordsOf,
  START,
  type KeptRead,
  type Records,
} from './records';
import { run, type Context } from './formulas';
import type { Shape, ShapeCondition } from './shape-schema';
import type { Definition, DefinitionSet } from './types';

/*
  A check as one of a few fixed shapes, with its blanks filled from what
  exists: columns, earlier values, constants with their words, groups and
  moments. Code writes its formula and its sentence, so the two say the same
  thing, and what every shape gets wrong when written by hand is settled here
  once: a stopping check lets a proposal of nothing through, a check reads
  what is proposed, and moments are compared, never their signed hours.

  Nothing here names a process. A shape speaks of a proposal field, a record
  and its columns; the words come from the process's declaration.
*/

export { shapeSchema, type Shape } from './shape-schema';

// A shape as code reads it, once its references are resolved.
export type Operand =
  | { kind: 'column'; column: string }
  | { kind: 'value'; id: string }
  | { kind: 'constant'; id: string }
  | { kind: 'proposed'; field: string }
  | { kind: 'hours_since'; moment: string };
export type Condition =
  | {
      test: 'compare';
      left: Operand;
      op: '<' | '<=' | '>' | '>=' | '==' | '!=';
      right: Operand;
    }
  | { test: 'yes_no'; column: string; is: boolean }
  | { test: 'moment'; moment: string; is: 'before' | 'after'; than: string };
type Body =
  | { shape: 'limit'; field: string; at: 'most' | 'least'; bound: Operand }
  | { shape: 'step'; field: string; of: Operand }
  | { shape: 'only_when'; field: string; when: Condition[] }
  | {
      shape: 'target';
      field: string;
      base: Operand;
      compare: 'reach' | 'not_exceed';
      target: Operand;
      margin_pct: Operand | null;
    }
  | { shape: 'flag'; flag_when: Condition[] };
export type Rule = {
  body: Body;
  scope:
    | { only: 'group'; group: string }
    | { only: 'when'; when: Condition[] }
    | null;
  if_blank: 'skip' | 'fail';
};

export type ShapeContext = {
  subject: DefinitionSubject;
  records: Records;
  read: KeptRead;
  consequence: Definition['consequence'];
  constants: Definition['constants'];
  groups: Definition['groups'];
  // The definitions that work before this one, which it may read.
  earlier: Definition[];
};

const fieldOf = (shape: Rule) =>
  shape.body.shape === 'flag' ? null : shape.body.field;

function conditionsOf(shape: Rule): Condition[] {
  const { body, scope } = shape;
  return [
    ...(scope?.only === 'when' ? scope.when : []),
    ...(body.shape === 'only_when' ? body.when : []),
    ...(body.shape === 'flag' ? body.flag_when : []),
  ];
}

function operandsOf(shape: Rule): Operand[] {
  const { body } = shape;
  const own =
    body.shape === 'limit'
      ? [body.bound]
      : body.shape === 'step'
        ? [body.of]
        : body.shape === 'target'
          ? [
              body.base,
              body.target,
              ...(body.margin_pct ? [body.margin_pct] : []),
            ]
          : [];
  return [
    ...own,
    ...conditionsOf(shape).flatMap((c) =>
      c.test === 'compare' ? [c.left, c.right] : [],
    ),
  ];
}

const momentsOf = (shape: Rule) => [
  ...conditionsOf(shape).flatMap((c) =>
    c.test === 'moment' ? [c.moment, c.than] : [],
  ),
  ...operandsOf(shape).flatMap((o) =>
    o.kind === 'hours_since' ? [o.moment] : [],
  ),
];

// The columns a shape reads, as written in it: <column> or <lookup>.<column>.
const columnsOf = (shape: Rule) => [
  ...new Set([
    ...operandsOf(shape).flatMap((o) =>
      o.kind === 'column' ? [o.column] : [],
    ),
    ...conditionsOf(shape).flatMap((c) =>
      c.test === 'yes_no' ? [c.column] : [],
    ),
  ]),
];

// The earlier definitions a shape reads.
const ruleUses = (shape: Rule) => [
  ...new Set(
    operandsOf(shape).flatMap((o) => (o.kind === 'value' ? [o.id] : [])),
  ),
];

// ---- What a shape may read --------------------------------------------------

// A column's CEL type on this read, and how a formula reaches it.
function columnAt(column: string, { subject, records }: ShapeContext) {
  const [first, second] = column.split('.');
  if (second !== undefined) {
    const lookup = subject.data.lookups.find((l) => l.as === first);
    const type = lookup
      ? records.types.lookups[lookup.as]?.[second]
      : undefined;
    return type ? { type, path: `${lookup!.as}.${second}` } : null;
  }
  const type = records.types.record[first!];
  return type && shapeColumn(first!, subject)
    ? { type, path: `record.${first}` }
    : null;
}

/*
  Whether a shape may read a column of the record. Not a moment's hidden
  hours, and not the signed hours the process works out for formulas: a
  shape says time with moments, so no sign can be turned the wrong way.
*/
export function shapeColumn(name: string, subject: DefinitionSubject) {
  const timing = subject.data.timing;
  return (
    !name.startsWith(MOMENT_PREFIX) &&
    !(timing && (name in timing.since || name in timing.until))
  );
}

const NUMBER = ['int', 'double'];
const declaredMoments = (subject: DefinitionSubject) =>
  subject.data.timing
    ? [START, READ, ...Object.keys(subject.data.timing.moments ?? {})]
    : [];

/*
  What is wrong with a shape on this read, in words the model can act on.
  Empty when everything it names exists and is of the kind its place needs.
*/
function ruleProblems(shape: Rule, context: ShapeContext): string[] {
  const { subject, consequence, constants, groups, earlier } = context;
  const problems: string[] = [];
  const fields = subject.proposal.map((f) => f.id);
  const moments = declaredMoments(subject);
  const field = fieldOf(shape);
  if (field !== null && !fields.includes(field))
    problems.push(
      `No proposal field ${field}; the fields are ${fields.join(', ')}.`,
    );
  if (shape.body.shape === 'flag' && consequence === 'block')
    problems.push(
      'flag is for a check a person decides, and failing this one stops the proposal: use limit, step, only_when or target.',
    );
  const operand = (o: Operand) => {
    if (o.kind === 'column') {
      const found = columnAt(o.column, context);
      if (!found) problems.push(`No column ${o.column}.`);
      else if (!NUMBER.includes(found.type))
        problems.push(`${o.column} is not a number.`);
    } else if (o.kind === 'value') {
      const d = earlier.find((one) => one.id === o.id);
      if (!d) problems.push(`No earlier definition ${o.id} to read.`);
      else if (d.result !== 'number')
        problems.push(`${o.id} is a check, not a number.`);
    } else if (o.kind === 'constant') {
      if (!constants.some((c) => c.id === o.id))
        problems.push(`No constant ${o.id}: declare it with its words.`);
    } else if (o.kind === 'proposed') {
      if (!fields.includes(o.field))
        problems.push(`No proposal field ${o.field}.`);
    } else if (!moments.includes(o.moment))
      problems.push(
        `No moment ${o.moment}; the moments are ${moments.join(', ') || 'none'}.`,
      );
    else if (subject.data.timing?.moments?.[o.moment]?.kind !== 'observed')
      // Hours since a moment still to come would be negative: a sign to get
      // wrong. Only what has happened by the read has hours since it.
      problems.push(
        `hours_since:${o.moment} is not a number of hours: ${o.moment} ${o.moment === READ ? 'is when the data was read' : 'may still be to come'}. Put it before or after another moment instead, as moment:${o.moment}.`,
      );
  };
  operandsOf(shape).forEach(operand);
  for (const c of conditionsOf(shape)) {
    if (c.test === 'yes_no') {
      const found = columnAt(c.column, context);
      if (!found) problems.push(`No column ${c.column}.`);
      else if (found.type !== 'bool')
        problems.push(`${c.column} is not a yes/no column.`);
    }
    if (c.test === 'moment')
      for (const m of [c.moment, c.than])
        if (!moments.includes(m))
          problems.push(
            `No moment ${m}; the moments are ${moments.join(', ') || 'none'}.`,
          );
  }
  const { scope } = shape;
  if (scope?.only === 'group' && !groups.some((g) => g.id === scope.group))
    problems.push(
      `No group ${scope.group}: declare it with the words that name its records.`,
    );
  return [...new Set(problems)];
}

// ---- Its formula ------------------------------------------------------------

const momentAt = (name: string) =>
  name === READ ? '0.0' : `record.${momentColumn(name)}`;

function operandFormula(o: Operand, context: ShapeContext): string {
  switch (o.kind) {
    case 'column':
      return `double(${columnAt(o.column, context)?.path ?? `record.${o.column}`})`;
    case 'value':
      return `double(values.${o.id})`;
    case 'constant':
      return `double(constants.${o.id})`;
    case 'proposed':
      return `double(${o.field})`;
    case 'hours_since':
      return `(0.0 - ${momentAt(o.moment)})`;
  }
}

const OPS: Record<string, string> = {
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
  '==': '==',
  '!=': '!=',
};

function conditionFormula(c: Condition, context: ShapeContext): string {
  if (c.test === 'compare')
    return `${operandFormula(c.left, context)} ${OPS[c.op]} ${operandFormula(c.right, context)}`;
  if (c.test === 'yes_no') {
    const path = columnAt(c.column, context)?.path ?? `record.${c.column}`;
    return c.is ? path : `!${path}`;
  }
  return `${momentAt(c.moment)} ${c.is === 'before' ? '<' : '>'} ${momentAt(c.than)}`;
}

const all = (parts: string[]) =>
  parts.length === 1 ? parts[0]! : parts.map((p) => `(${p})`).join(' && ');

// What must be present on a record for the rule to be worked out at all.
function presentFormula(shape: Rule, context: ShapeContext): string[] {
  return [
    ...columnsOf(shape).map(
      (column) =>
        `has(${columnAt(column, context)?.path ?? `record.${column}`})`,
    ),
    ...[...new Set(momentsOf(shape))]
      .filter((m) => m !== READ)
      .map((m) => `has(record.${momentColumn(m)})`),
  ];
}

// The value that proposes nothing, where the process declares one.
const noneOf = (shape: Rule, subject: DefinitionSubject) => {
  const field = fieldOf(shape);
  return subject.proposal.find((f) => f.id === field)?.none;
};

/*
  The formula, written by code. Its parts, joined by ||, lead with what
  settles the rule for a record whatever is proposed (out of scope, a blank
  cell skipped), the form the app's working recognises, then a proposal of
  nothing where the check stops proposals, then the rule.
*/
function ruleFormula(shape: Rule, context: ShapeContext): string {
  const { body, scope } = shape;
  const field = fieldOf(shape);
  const p = field ? `double(${field})` : '';
  const n = (o: Operand) => operandFormula(o, context);
  const rule =
    body.shape === 'limit'
      ? `${p} ${body.at === 'most' ? '<=' : '>='} ${n(body.bound)}`
      : body.shape === 'step'
        ? `${field} % int(${n(body.of)}) == 0`
        : body.shape === 'only_when'
          ? all(body.when.map((c) => conditionFormula(c, context)))
          : body.shape === 'target'
            ? `${n(body.base)} + ${p} ${body.compare === 'reach' ? '>=' : '<='} ${
                body.margin_pct
                  ? `${n(body.target)} * (1.0 + ${n(body.margin_pct)} / 100.0)`
                  : n(body.target)
              }`
            : `!(${all(body.flag_when.map((c) => conditionFormula(c, context)))})`;
  const present = presentFormula(shape, context);
  const guards = [
    ...(scope?.only === 'group' ? [`!(key in groups.${scope.group})`] : []),
    ...(scope?.only === 'when'
      ? [`!(${all(scope.when.map((c) => conditionFormula(c, context)))})`]
      : []),
    ...(present.length && shape.if_blank === 'skip'
      ? [`!(${all(present)})`]
      : []),
  ];
  const none = noneOf(shape, context.subject);
  const nothing =
    context.consequence === 'block' && field && none !== undefined
      ? [`${field} == ${none}`]
      : [];
  const checked =
    present.length && shape.if_blank === 'fail'
      ? `${all(present)} && (${rule})`
      : rule;
  return [...guards, ...nothing, `(${checked})`].join(' || ');
}

// ---- Its sentence -----------------------------------------------------------

const words = (name: string) => name.replaceAll('_', ' ');
const lowerFirst = (text: string) =>
  /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
const upperFirst = (text: string) => text[0]!.toUpperCase() + text.slice(1);

// An instant in the process's time zone, as a weekday and a time.
function when(instant: number, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}

function momentWords(name: string, context: ShapeContext) {
  const { subject, read, records } = context;
  const timing = subject.data.timing;
  const readAt = Date.parse(read.readAt);
  if (name === READ)
    return `when the data was read (${timing ? when(readAt, timing.timeZone) : read.readAt})`;
  if (name === START) {
    const hours = records.record(records.keys[0] ?? '')[momentColumn(START)];
    return typeof hours === 'number' && timing
      ? `the start (${when(readAt + hours * 3_600_000, timing.timeZone)})`
      : 'the start';
  }
  return `the ${words(name)}`;
}

function operandWords(o: Operand, context: ShapeContext): string {
  switch (o.kind) {
    case 'column': {
      const [first, second] = o.column.split('.');
      return `the ${second ? `${words(first!)} ${words(second)}` : words(first!)}`;
    }
    case 'value': {
      const d = context.earlier.find((one) => one.id === o.id);
      return `the ${d ? lowerFirst(d.name) : words(o.id)}`;
    }
    case 'constant': {
      const c = context.constants.find((one) => one.id === o.id);
      return c ? `${c.value} (“${c.quote}”)` : words(o.id);
    }
    case 'proposed': {
      const f = context.subject.proposal.find((one) => one.id === o.field);
      return `the proposed ${f?.label ?? words(o.field)}`;
    }
    case 'hours_since':
      // Counted up to the read, so the sentence says when that was.
      return `the hours since ${momentWords(o.moment, context)}, as of ${momentWords(READ, context)}`;
  }
}

const OP_WORDS: Record<string, string> = {
  '<': 'is less than',
  '<=': 'is at most',
  '>': 'is more than',
  '>=': 'is at least',
  '==': 'is',
  '!=': 'is not',
};

function conditionWords(c: Condition, context: ShapeContext): string {
  if (c.test === 'compare')
    return `${operandWords(c.left, context)} ${OP_WORDS[c.op]} ${operandWords(c.right, context)}`;
  if (c.test === 'yes_no')
    return `${operandWords({ kind: 'column', column: c.column }, context)} is ${c.is ? 'yes' : 'no'}`;
  return `${momentWords(c.moment, context)} is ${c.is} ${momentWords(c.than, context)}`;
}

const allWords = (conditions: Condition[], context: ShapeContext) =>
  conditions.map((c) => conditionWords(c, context)).join(' and ');

/*
  The sentence a person approves: what the formula does, in the process's
  words. Written from the same shape as the formula, so it cannot say less.
*/
function ruleSentence(shape: Rule, context: ShapeContext): string {
  const { body, scope } = shape;
  const { subject, consequence, groups, records } = context;
  const decides = consequence === 'decide';
  const must = decides ? 'should' : 'must';
  const field = subject.proposal.find((f) => f.id === fieldOf(shape));
  const proposed = `the proposed ${field?.label ?? ''}`.trim();
  const n = (o: Operand) => operandWords(o, context);
  const rule =
    body.shape === 'limit'
      ? `${proposed} ${must} be at ${body.at} ${n(body.bound)}.`
      : body.shape === 'step'
        ? `${proposed} ${must} be a whole multiple of ${n(body.of)}.`
        : body.shape === 'only_when'
          ? `${proposed} is ${decides ? 'fine' : 'allowed'} only when ${allWords(body.when, context)}.`
          : body.shape === 'target'
            ? `${n(body.base)} plus ${proposed} ${must} ${body.compare === 'reach' ? 'reach' : 'not exceed'} ${n(body.target)}${body.margin_pct ? ` plus ${n(body.margin_pct)} percent` : ''}.`
            : `flag it for a person when ${allWords(body.flag_when, context)}.`;
  const { plural } = subject.record;
  const prefix =
    scope?.only === 'group'
      ? `For ${plural} in “${groups.find((g) => g.id === scope.group)?.quote ?? words(scope.group)}” only: `
      : scope?.only === 'when'
        ? `For ${plural} where ${allWords(scope.when, context)} only: `
        : '';
  const tail: string[] = [];
  if (decides && body.shape !== 'flag')
    tail.push('Otherwise a person decides.');
  const none = noneOf(shape, subject);
  if (consequence === 'block' && field && none !== undefined)
    tail.push(`Proposing ${none} ${field.unit} is always allowed.`);
  // Said only where this read has such a record, so it is never noise.
  const blankable = [
    ...columnsOf(shape).filter((column) =>
      records.keys.some((key) => {
        const [first, second] = column.split('.');
        const row =
          second !== undefined
            ? records.lookups(key)[first!]
            : records.record(key);
        return row?.[second ?? first!] === undefined;
      }),
    ),
  ];
  if (blankable.length)
    tail.push(
      `Where ${blankable.map((c) => n({ kind: 'column', column: c })).join(' or ')} is blank, ${shape.if_blank === 'skip' ? 'it does not apply' : 'it fails'}.`,
    );
  const sentence = prefix ? `${prefix}${rule}` : upperFirst(rule);
  return [sentence, ...tail].join(' ');
}

// ---- Reading what a model wrote -------------------------------------------

const KINDS = [
  'column',
  'value',
  'constant',
  'proposed',
  'hours_since',
  'moment',
] as const;
type Kind = (typeof KINDS)[number];
type Wanted = 'number' | 'yes_no' | 'moment';

// Whether a name is something of this kind on this read.
function existsAs(kind: Kind, name: string, context: ShapeContext) {
  const { subject, earlier, constants } = context;
  return kind === 'column'
    ? Boolean(columnAt(name, context))
    : kind === 'proposed'
      ? subject.proposal.some((f) => f.id === name)
      : kind === 'value'
        ? earlier.some((d) => d.id === name)
        : kind === 'constant'
          ? constants.some((c) => c.id === name)
          : false;
}

// The kinds of number, as opposed to a moment.
const NUMBER_KINDS: Kind[] = ['column', 'proposed', 'value', 'constant'];

/*
  A prefix naming the wrong kind of number is read as the kind the name is,
  where the name is only that one: a model that writes column:<earlier value>
  means the value. Moments are never reread, and a name that is nothing, or
  could be two things, keeps the prefix it was given and its problem.
*/
function rereadKind(
  kind: Kind,
  name: string,
  wanted: Wanted,
  context: ShapeContext,
): Kind {
  if (wanted === 'moment' || !NUMBER_KINDS.includes(kind)) return kind;
  if (existsAs(kind, name, context)) return kind;
  const others = (wanted === 'number' ? NUMBER_KINDS : (['column'] as Kind[]))
    .filter((other) => other !== kind)
    .filter((other) => existsAs(other, name, context));
  return others.length === 1 ? others[0]! : kind;
}

/*
  A reference as written, `kind:name`, or a bare name where only one thing
  could be meant: a model that leaves the kind off is understood rather than
  refused, and one whose name could mean two things is told so.
*/
function referenceOf(
  text: string,
  wanted: Wanted,
  context: ShapeContext,
): { kind: Kind; name: string } | string {
  const at = text.indexOf(':');
  const prefix = at > 0 ? text.slice(0, at).trim() : '';
  if ((KINDS as readonly string[]).includes(prefix)) {
    const name = text.slice(at + 1).trim();
    return {
      kind: rereadKind(prefix as Kind, name, wanted, context),
      name,
    };
  }
  const name = text.trim();
  const { subject } = context;
  const found: Kind[] = [];
  if (wanted === 'moment') {
    if (declaredMoments(subject).includes(name)) found.push('moment');
  } else {
    if (existsAs('column', name, context)) found.push('column');
    if (wanted === 'number')
      for (const kind of NUMBER_KINDS.slice(1))
        if (existsAs(kind, name, context)) found.push(kind);
  }
  if (found.length === 1) return { kind: found[0]!, name };
  return found.length
    ? `"${text}" could be a ${found.join(' or a ')}: write it as kind:name.`
    : `"${text}" is not a reference: write it as ${wanted === 'moment' ? 'moment:<moment>' : wanted === 'yes_no' ? 'column:<column>' : 'kind:name'}.`;
}

function numberOf(
  text: string | null,
  context: ShapeContext,
  problems: string[],
): Operand | null {
  if (!text) return null;
  const ref = referenceOf(text, 'number', context);
  if (typeof ref === 'string') {
    problems.push(ref);
    return null;
  }
  switch (ref.kind) {
    case 'column':
      return { kind: 'column', column: ref.name };
    case 'value':
      return { kind: 'value', id: ref.name };
    case 'constant':
      return { kind: 'constant', id: ref.name };
    case 'proposed':
      return { kind: 'proposed', field: ref.name };
    case 'hours_since':
      return { kind: 'hours_since', moment: ref.name };
    case 'moment':
      problems.push(
        `"${text}" is a moment, not a number: compare it with before or after, or read hours_since:${ref.name}.`,
      );
      return null;
  }
}

type Compare = '<' | '<=' | '>' | '>=' | '==' | '!=';

function conditionOf(
  c: ShapeCondition,
  context: ShapeContext,
  problems: string[],
): Condition | null {
  if (c.op === 'is_yes' || c.op === 'is_no') {
    const ref = referenceOf(c.left, 'yes_no', context);
    if (typeof ref === 'string' || ref.kind !== 'column') {
      problems.push(
        typeof ref === 'string'
          ? ref
          : `${c.op} tests a yes/no column, not "${c.left}".`,
      );
      return null;
    }
    return { test: 'yes_no', column: ref.name, is: c.op === 'is_yes' };
  }
  if (c.op === 'before' || c.op === 'after') {
    const [left, right] = [c.left, c.right ?? ''].map((t) =>
      referenceOf(t, 'moment', context),
    );
    const bad = [left, right].filter(
      (r): r is string | { kind: Kind; name: string } =>
        typeof r === 'string' || r!.kind !== 'moment',
    );
    if (bad.length) {
      problems.push(
        `${c.op} puts one moment against another, written moment:<moment>; "${c.left}" and "${c.right}" are not both moments.`,
      );
      return null;
    }
    return {
      test: 'moment',
      moment: (left as { name: string }).name,
      is: c.op,
      than: (right as { name: string }).name,
    };
  }
  const left = numberOf(c.left, context, problems);
  const right = numberOf(c.right, context, problems);
  if (!c.right) problems.push(`${c.op} needs a right-hand number.`);
  return left && right
    ? { test: 'compare', left, op: c.op as Compare, right }
    : null;
}

/*
  The rule a shape says, or what stops it being read: each kind needs its own
  blanks filled, and what is filled for another kind is ignored.
*/
function ruleOf(
  shape: Shape,
  context: ShapeContext,
): { rule: Rule | null; problems: string[] } {
  const problems: string[] = [];
  const need = (value: unknown, what: string) => {
    if (value === null || value === undefined || value === '')
      problems.push(`${shape.kind} needs ${what}.`);
  };
  // The field as proposed:<id> or the bare id; left out, the only one there is.
  const fields = context.subject.proposal.map((f) => f.id);
  const written = (shape.field ?? '').trim().replace(/^proposed:\s*/, '');
  const field = written || (fields.length === 1 ? fields[0]! : '');
  if (shape.kind !== 'flag' && !field)
    problems.push(
      fields.length > 1
        ? `${shape.kind} needs field: the fields are ${fields.join(', ')}.`
        : `${shape.kind} needs field.`,
    );
  const conditions = (list: ShapeCondition[]) =>
    list.map((c) => conditionOf(c, context, problems));
  let body: Body | null = null;
  if (shape.kind === 'limit') {
    need(shape.at, 'at');
    need(shape.amount, 'amount');
    const bound = numberOf(shape.amount, context, problems);
    if (bound && shape.at)
      body = { shape: 'limit', field, at: shape.at, bound };
  } else if (shape.kind === 'step') {
    need(shape.amount, 'amount');
    const of = numberOf(shape.amount, context, problems);
    if (of) body = { shape: 'step', field, of };
  } else if (shape.kind === 'target') {
    need(shape.base, 'base');
    need(shape.compare, 'compare');
    need(shape.target, 'target');
    const base = numberOf(shape.base, context, problems);
    const target = numberOf(shape.target, context, problems);
    const margin = numberOf(shape.margin_pct, context, problems);
    if (base && target && shape.compare)
      body = {
        shape: 'target',
        field,
        base,
        compare: shape.compare,
        target,
        margin_pct: margin,
      };
  } else {
    if (!shape.when.length)
      problems.push(`${shape.kind} needs at least one condition in when.`);
    const when = conditions(shape.when);
    if (when.length && when.every(Boolean))
      body =
        shape.kind === 'flag'
          ? { shape: 'flag', flag_when: when as Condition[] }
          : { shape: 'only_when', field, when: when as Condition[] };
  }
  // An empty group, or the word null, is no group.
  const group = /^(null)?$/i.test((shape.only_for_group ?? '').trim())
    ? null
    : shape.only_for_group!.trim();
  if (group && shape.only_for_when.length)
    problems.push('Limit the rule to a group or to conditions, not both.');
  const scopeWhen = conditions(shape.only_for_when);
  const scope: Rule['scope'] = group
    ? { only: 'group', group }
    : scopeWhen.length && scopeWhen.every(Boolean)
      ? { only: 'when', when: scopeWhen as Condition[] }
      : null;
  return {
    rule:
      body && !problems.length
        ? { body, scope, if_blank: shape.if_blank }
        : null,
    problems: [...new Set(problems)],
  };
}

// ---- What the rest of the engine asks of a shape -----------------------------

// What is wrong with a shape, read and checked against this read.
export function shapeProblems(shape: Shape, context: ShapeContext): string[] {
  const { rule, problems } = ruleOf(shape, context);
  return rule ? ruleProblems(rule, context) : problems;
}

const readRule = (shape: Shape, context: ShapeContext) => {
  const { rule, problems } = ruleOf(shape, context);
  if (!rule) throw new Error(`The shape cannot be read: ${problems.join(' ')}`);
  return rule;
};

// Its formula and its sentence, for a shape with no problems.
export const formulaOf = (shape: Shape, context: ShapeContext) =>
  ruleFormula(readRule(shape, context), context);
export const sentenceOf = (shape: Shape, context: ShapeContext) =>
  ruleSentence(readRule(shape, context), context);
export const usesOf = (shape: Shape, context: ShapeContext) =>
  ruleUses(readRule(shape, context));

// Two shapes that say the same, whatever their constants and groups are
// called, each read with its own constants and groups.
// The fields each kind reads; the rest of the flat form is cleared.
const READS: Record<Shape['kind'], (keyof Shape)[]> = {
  limit: ['field', 'at', 'amount'],
  step: ['field', 'amount'],
  only_when: ['field', 'when'],
  target: ['field', 'base', 'compare', 'target', 'margin_pct'],
  flag: ['when'],
};

/*
  A shape with only what its kind reads: a model fills fields of the flat form
  its kind ignores, which change nothing it checks but would be stored.
*/
export function withoutUnused(shape: Shape): Shape {
  const reads = READS[shape.kind];
  const kept = (name: keyof Shape) => reads.includes(name);
  return {
    ...shape,
    field: kept('field') ? shape.field : null,
    at: kept('at') ? shape.at : null,
    amount: kept('amount') ? shape.amount : null,
    base: kept('base') ? shape.base : null,
    compare: kept('compare') ? shape.compare : null,
    target: kept('target') ? shape.target : null,
    margin_pct: kept('margin_pct') ? shape.margin_pct : null,
    when: kept('when') ? shape.when : [],
  };
}

/*
  What a shape reads that a write declares: the constants its operands name
  and the group its scope names. Null where the shape cannot be read.
*/
export function referencesOf(
  shape: Shape,
  context: ShapeContext,
): { constants: string[]; group: string | null } | null {
  const { rule } = ruleOf(shape, context);
  if (!rule) return null;
  return {
    constants: [
      ...new Set(
        operandsOf(rule).flatMap((o) => (o.kind === 'constant' ? [o.id] : [])),
      ),
    ],
    group: rule.scope?.only === 'group' ? rule.scope.group : null,
  };
}

/*
  A shape as it is kept: only what its kind reads, the bare field, no group
  where none was meant, and every reference written kind:name as it was read.
  A shape that cannot be read is left as it is.
*/
export function canonicalShape(shape: Shape, context: ShapeContext): Shape {
  const cleared = withoutUnused(shape);
  const { rule } = ruleOf(cleared, context);
  if (!rule) return cleared;
  const spelt = (text: string, wanted: Wanted) => {
    const ref = referenceOf(text, wanted, context);
    return typeof ref === 'string' ? text : `${ref.kind}:${ref.name}`;
  };
  const number = (text: string | null) => (text ? spelt(text, 'number') : text);
  const condition = (c: ShapeCondition): ShapeCondition =>
    c.op === 'is_yes' || c.op === 'is_no'
      ? { ...c, left: spelt(c.left, 'yes_no') }
      : c.op === 'before' || c.op === 'after'
        ? {
            ...c,
            left: spelt(c.left, 'moment'),
            right: c.right && spelt(c.right, 'moment'),
          }
        : { ...c, left: spelt(c.left, 'number'), right: number(c.right) };
  return {
    ...cleared,
    field: fieldOf(rule),
    amount: number(cleared.amount),
    base: number(cleared.base),
    target: number(cleared.target),
    margin_pct: number(cleared.margin_pct),
    when: cleared.when.map(condition),
    only_for_group: rule.scope?.only === 'group' ? rule.scope.group : null,
    only_for_when: cleared.only_for_when.map(condition),
  };
}

export function sameShape(
  a: ShapeContext & { shape: Shape },
  b: ShapeContext & { shape: Shape },
): boolean {
  const normal = (d: typeof a) => {
    const { rule } = ruleOf(d.shape, d);
    return JSON.stringify(rule, (name, value: unknown) => {
      if (
        value &&
        typeof value === 'object' &&
        (value as Operand).kind === 'constant'
      )
        return {
          kind: 'constant',
          value: d.constants.find((c) => c.id === (value as { id: string }).id)
            ?.value,
        };
      if (name === 'group' && typeof value === 'string')
        return [...(d.groups.find((g) => g.id === value)?.keys ?? [])].sort();
      return value;
    });
  };
  return normal(a) === normal(b);
}

/*
  The sentence of every check in a set written as a shape, and of each of its
  versions where writes disagreed: what a person approves, or chooses
  between. Null where there is no shape (a number, a refusal, a check written
  before shapes) or one that no longer reads on this data.
*/
export function sentencesOf(
  subject: DefinitionSubject,
  set: DefinitionSet,
  read: KeptRead,
): Record<string, { own: string | null; versions: (string | null)[] }> {
  const records = recordsOf(read, subject.data);
  const sentenceFor = (
    definition: Definition,
    written: Pick<Definition, 'constants' | 'groups'> & {
      shape?: Shape | null;
    },
  ) => {
    if (!written.shape) return null;
    const context: ShapeContext = {
      subject,
      records,
      read,
      consequence: definition.consequence,
      constants: written.constants,
      groups: written.groups,
      earlier: set.definitions.slice(0, set.definitions.indexOf(definition)),
    };
    try {
      return shapeProblems(written.shape, context).length
        ? null
        : sentenceOf(written.shape, context);
    } catch {
      return null;
    }
  };
  return Object.fromEntries(
    set.definitions.map((d) => [
      d.id,
      {
        own: sentenceFor(d, d),
        versions: (d.agreement?.versions ?? []).map((v) => sentenceFor(d, v)),
      },
    ]),
  );
}

// When a moment falls for one record, as a weekday and a time; null when its
// cells are blank or the process has no timing.
function momentWhen(
  name: string,
  record: Record<string, unknown>,
  context: ShapeContext,
): string | null {
  const timing = context.subject.data.timing;
  if (!timing) return null;
  const readAt = Date.parse(context.read.readAt);
  const hours = name === READ ? 0 : record[momentColumn(name)];
  return typeof hours === 'number'
    ? when(readAt + hours * 3_600_000, timing.timeZone)
    : null;
}

// When the planned period starts and when the data was read, for telling a
// model what start and read are.
export function momentTimes(context: ShapeContext) {
  const first = context.records.record(context.records.keys[0] ?? '');
  return {
    start: momentWhen(START, first, context),
    read: momentWhen(READ, first, context),
  };
}

const plainValue = (value: unknown) =>
  value === undefined || value === null
    ? 'blank'
    : typeof value === 'bigint'
      ? String(value)
      : typeof value === 'number'
        ? String(Math.round(value * 100) / 100)
        : typeof value === 'boolean'
          ? value
            ? 'yes'
            : 'no'
          : String(value);

/*
  What the rule reads for one record, in its own words, for showing an
  example's working without its formula: each number, yes/no and moment it
  names, with its value here, and whether the record is in its group.
*/
export function valuesInWords(
  shape: Shape,
  context: ShapeContext,
  key: string,
  formulas: Context,
): string {
  const { rule } = ruleOf(shape, context);
  if (!rule) return '';
  const record = formulas.record as Record<string, unknown>;
  const parts: string[] = [];
  const { scope } = rule;
  if (scope?.only === 'group') {
    const group = context.groups.find((g) => g.id === scope.group);
    parts.push(
      `${key} is ${group?.keys.includes(key) ? '' : 'not '}in “${group?.quote ?? words(scope.group)}”`,
    );
  }
  const seen = new Set<string>();
  const say = (label: string, value: string) => {
    if (seen.has(label)) return;
    seen.add(label);
    parts.push(`${label} is ${value}`);
  };
  const field = fieldOf(rule);
  if (field)
    say(
      operandWords({ kind: 'proposed', field }, context),
      plainValue(formulas[field]),
    );
  for (const o of operandsOf(rule)) {
    let value: unknown;
    try {
      value = run(operandFormula(o, context), formulas);
    } catch {
      value = null;
    }
    say(operandWords(o, context), plainValue(value));
  }
  for (const c of conditionsOf(rule))
    if (c.test === 'yes_no')
      say(
        operandWords({ kind: 'column', column: c.column }, context),
        plainValue(run(columnAt(c.column, context)?.path ?? 'null', formulas)),
      );
  for (const m of new Set(momentsOf(rule)))
    if (m === READ) {
      // The other half of a comparison with the read, said as a fact.
      const at = momentWhen(READ, record, context);
      if (at) parts.push(`the data was read at ${at}`);
    } else
      say(
        momentWords(m, context).replace(/ \(.*\)$/, ''),
        momentWhen(m, record, context) ?? 'blank',
      );
  return parts.join('; ');
}
