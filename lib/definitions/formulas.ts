import { Environment } from '@marcbachmann/cel-js';

import type { DefinitionSubject } from '@/lib/process/model';
import { ctorFor } from '@/lib/rulebook/cel-objects';
import type { FieldType } from '@/lib/rulebook/field-types';

import { cel, recordsOf, type KeptRead, type Row } from './records';
import type { Result } from './types';

/*
  What a formula can read, for one record: `key`; `record`, its row from every
  record tab joined by its key; each lookup the process declares, by its name;
  the proposal's fields; the values worked out before it; and its definition's
  constants and groups. Standard CEL, with ceil, floor and round added: a
  formula is a check (true when it holds) or a number.

  A blank cell is absent from the record, so `has(record.x)` says whether it
  was filled in.
*/

export type Context = Record<string, unknown> & {
  key: string;
  record: Row;
  values: Row;
  constants: Row;
  groups: Record<string, string[]>;
};

// What a formula is given besides the record: the proposal's fields by id,
// and its definition's constants and groups.
export type Given = {
  inputs: Record<string, number>;
  constants: Record<string, number>;
  groups: Record<string, string[]>;
};

// The names every formula has; a process's lookups and proposal fields take
// others, each once.
const RESERVED = ['key', 'record', 'values', 'constants', 'groups'];

export function variablesOf(subject: DefinitionSubject): string[] {
  const own = [
    ...subject.data.lookups.map((lookup) => lookup.as),
    ...subject.proposal.map((field) => field.id),
  ];
  const clash = own.filter(
    (name, i) => RESERVED.includes(name) || own.indexOf(name) !== i,
  );
  if (clash.length)
    throw new Error(`A formula name is used twice: ${clash.join(', ')}.`);
  return ['key', 'record', ...own, 'values', 'constants', 'groups'];
}

// A product of decimals carries noise (100 * 1.1 is 110.00000000000001), so
// it is settled to nine places before it is rounded. Doubles only: CEL's
// whole-number division has already dropped the remainder, so ceil(253 / 10)
// would quietly give 25; refused, it fails with the reason the model is told.
const settle = (x: number) => Number(x.toFixed(9));
// A formula past this size is past reading; split it into definitions.
const MAX_AST_NODES = 300;
const withRounding = (environment: Environment) =>
  environment
    .registerFunction('ceil(double): int', (x: number) =>
      BigInt(Math.ceil(settle(x))),
    )
    .registerFunction('floor(double): int', (x: number) =>
      BigInt(Math.floor(settle(x))),
    )
    .registerFunction('round(double): int', (x: number) =>
      BigInt(Math.round(settle(x))),
    );

// Runs formulas on plain objects; checking against types is checkFormula's.
const env = withRounding(
  new Environment({
    unlistedVariablesAreDyn: true,
    enableOptionalTypes: true,
    limits: { maxAstNodes: MAX_AST_NODES },
  }),
);
// Parsed formulas, the most recent kept: a draft tries many.
const compiled = new Map<string, (ctx: object) => unknown>();
const COMPILED_KEPT = 500;

export function run(formula: string, context: Context): unknown {
  let fn = compiled.get(formula);
  if (!fn) {
    fn = env.parse(formula) as (ctx: object) => unknown;
    if (compiled.size >= COMPILED_KEPT)
      compiled.delete(compiled.keys().next().value!);
    compiled.set(formula, fn);
  }
  return fn(context);
}

// A formula's syntax tree, for showing its working.
export const syntaxOf = (formula: string): unknown =>
  (env.parse(formula) as unknown as { ast: unknown }).ast;

// Whether a formula parses at all, before it is run on anything.
export function parseError(formula: string): string | null {
  try {
    env.parse(formula);
    return null;
  } catch (error) {
    return (error as Error).message.split('\n')[0]!;
  }
}

// What a formula may read, typed, for checking it before it runs.
export type Scope = {
  // Each earlier definition's id and what it gives: int, double or bool.
  values: Record<string, string>;
  constants: Record<string, number>;
  groups: string[];
};

// The library names the symptom; these name the fix, in the formula's terms.
const HINTS: [RegExp, (match: RegExpExecArray, names: string) => string][] = [
  [
    /Unknown variable: (\w+)/,
    (m, names) => `"${m[1]}" is not a variable here; a formula reads ${names}.`,
  ],
  [
    /no such overload: (int|double) [-+*/%<>=!]+ (int|double)/,
    () =>
      'int and double never mix: convert one side with double(x) or int(x).',
  ],
  [
    /no matching overload for '(ceil|floor|round)\(int\)'/,
    () =>
      'ceil, floor and round take a double: divide as doubles, double(a) / double(b).',
  ],
  [
    /no matching overload for 'list\.contains/,
    () => 'Test membership with x in list.',
  ],
];

/*
  Checks a formula against exactly what it may read, typed from the read and
  the process's declaration, without running it: a misspelt name or field, a
  mixed int and double, or the wrong kind of result is refused before any
  example is tried. Returns the problem, or null.
*/
export function checkFormula(
  read: KeptRead,
  subject: DefinitionSubject,
  scope: Scope,
  result: Result,
  formula: string,
): string | null {
  const records = recordsOf(read, subject.data);
  const environment = withRounding(
    new Environment({
      unlistedVariablesAreDyn: false,
      enableOptionalTypes: true,
      limits: { maxAstNodes: MAX_AST_NODES },
    }),
  );
  environment.registerType('Record', {
    schema: records.types.record,
    ctor: ctorFor('Record'),
  });
  environment.registerVariable('record', 'Record');
  environment.registerVariable('key', 'string');
  for (const lookup of subject.data.lookups) {
    const name = `Lookup_${lookup.as}`;
    environment.registerType(name, {
      schema: records.types.lookups[lookup.as] ?? {},
      ctor: ctorFor(name),
    });
    environment.registerVariable(lookup.as, name);
  }
  for (const field of subject.proposal)
    environment.registerVariable(field.id, 'int');
  environment.registerVariable({ name: 'values', schema: scope.values });
  environment.registerVariable({
    name: 'constants',
    schema: Object.fromEntries(
      Object.entries(scope.constants).map(([id, v]) => [
        id,
        Number.isInteger(v) ? 'int' : 'double',
      ]),
    ),
  });
  environment.registerVariable({
    name: 'groups',
    schema: Object.fromEntries(scope.groups.map((id) => [id, 'list<string>'])),
  });
  const names = variablesOf(subject).join(', ');
  try {
    const checked = environment.check(formula);
    if (!checked.valid) {
      const message = (checked.error?.message ?? 'Invalid').split('\n')[0]!;
      for (const [pattern, hint] of HINTS) {
        const match = pattern.exec(message);
        if (match) return `${message}. ${hint(match, names)}`;
      }
      return message;
    }
    const type = checked.type ?? 'dyn';
    if (result === 'check' && type !== 'bool' && type !== 'dyn')
      return `It gives ${type}; a check gives true or false.`;
    if (result === 'number' && !['int', 'double', 'dyn'].includes(type))
      return `It gives ${type}; it should give a number.`;
    return null;
  } catch (error) {
    return (error instanceof Error ? error.message : String(error)).split(
      '\n',
    )[0]!;
  }
}

// A proposal field the example does not set reads as 0.
export function contextFor(
  read: KeptRead,
  key: string,
  subject: DefinitionSubject,
  given: Given,
  values: Row,
): Context {
  variablesOf(subject);
  const records = recordsOf(read, subject.data);
  return {
    ...records.lookups(key),
    ...Object.fromEntries(
      subject.proposal.map((field) => [
        field.id,
        BigInt(Math.trunc(given.inputs[field.id] ?? 0)),
      ]),
    ),
    key,
    record: records.record(key),
    values,
    constants: Object.fromEntries(
      Object.entries(given.constants).map(([id, v]) => [id, cel(v)]),
    ),
    groups: given.groups,
  };
}

// What a model writing a formula is told it can read, with one record as it
// really is, and the CEL it needs: a fixed reference, the same for any data.
export function describe(read: KeptRead, subject: DefinitionSubject): string {
  const { data } = subject;
  const records = recordsOf(read, data);
  const key = records.keys[0] ?? '';
  const { singular, plural } = subject.record;
  const show = (row: Row) =>
    JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? Number(v) : v));
  const kinds = new Set(Object.values(data.types).map((type) => type.kind));
  const typedColumns = (kind: FieldType['kind']) =>
    Object.entries(data.types)
      .filter(([, type]) => type.kind === kind)
      .map(([name]) => name)
      .join(', ');
  const lookups = records.lookups(key);
  return [
    `A formula is standard CEL, evaluated for one ${singular} at a time, with these variables:`,
    `- key: the ${singular}'s key, a string (the ${plural} are ${records.keys.join(', ')}).`,
    `- record: the ${singular}'s row from the ${data.records.tabs.join(', ')} tabs, joined by its key. For ${key}: ${show(records.record(key))}.`,
    ...data.lookups.map(
      (lookup) =>
        `- ${lookup.as}: the ${lookup.tab} row whose ${lookup.key} is the ${singular}'s ${lookup.via}. For ${key}: ${show(lookups[lookup.as] ?? {})}.`,
    ),
    ...subject.proposal.map(
      (field) =>
        `- ${field.id}: the proposed ${field.label}, in ${field.unit}, an int.`,
    ),
    '- values: the definitions worked out before this one, read as values.<id>.',
    "- constants: this definition's constants, read as constants.<id>.",
    `- groups: this definition's groups of ${plural}, each a list of keys: key in groups.<id>.`,
    ...(kinds.has('weekday')
      ? [
          `Days of the week (${typedColumns('weekday')}) are ints, Monday 1 to Sunday 7.`,
        ]
      : []),
    ...(kinds.has('time_of_day')
      ? [
          `Times of day (${typedColumns('time_of_day')}) are ints, minutes after midnight: 06:30 is 390.`,
        ]
      : []),
    'ceil(x), floor(x) and round(x) round a double to a whole number; they take no int, so divide as doubles: ceil(double(a) / double(b)).',
    'Membership: x in list. Remainder: a % b. Choice: condition ? a : b. Logic: &&, ||, !.',
    'Whole numbers are ints and other numbers doubles; CEL never mixes them, so convert with double(x) or int(x) (3 == 3.0 is an error). A blank cell is absent: test it with has(record.field).',
  ].join('\n');
}
