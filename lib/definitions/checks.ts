import type { DefinitionSubject } from '@/lib/process/model';

import {
  checkFormula,
  contextFor,
  parseError,
  run,
  variablesOf,
  type Given,
  type Scope,
} from './formulas';
import { profiledFor } from './profile';
import { describeExample } from './prompts';
import { recordsOf, type KeptRead, type Records, type Row } from './records';
import { hasScope } from './shapes';
import {
  acceptable,
  readsName,
  SCOPE_MISMATCH,
  type Definition,
  type DefinitionProcess,
  type DefinitionSet,
  type Example,
  type VersionDifference,
} from './types';

/*
  What the app holds a definition to, in one review: the same whether the
  model is checking a draft or a person is accepting the version kept. Its
  numbers and names must come from the instructions and the data, its
  formula must type-check against exactly what it may read, and every example
  must agree with the formula run on the read.
*/

// A definition as written: what a draft gives and a kept version holds.
export type Draft = Pick<Definition, 'constants' | 'groups' | 'shape'> & {
  formula: string;
  examples: Pick<Example, 'key' | 'inputs' | 'expect' | 'why'>[];
};

// Where a definition stands: its set and read, and the definitions before
// it, split by whether they work, with what each gives on the first record.
export type Setting = {
  owner: DefinitionProcess;
  text: string;
  set: DefinitionSet;
  read: KeptRead;
  definition: Definition;
  records: Records;
  earlier: Definition[];
  working: Definition[];
  broken: Definition[];
  sample: Row;
};

export function settingOf(
  owner: DefinitionProcess,
  text: string,
  set: DefinitionSet,
  read: KeptRead,
  definition: Definition,
): Setting {
  owner = profiledFor(owner, set);
  const records = recordsOf(read, owner.subject.data);
  const earlier = set.definitions.slice(0, set.definitions.indexOf(definition));
  return {
    owner,
    text,
    set,
    read,
    definition,
    records,
    earlier,
    working: earlier.filter(acceptable),
    broken: earlier.filter((d) => !acceptable(d)),
    sample: valuesFor(
      set,
      read,
      records.keys[0] ?? '',
      {},
      definition.id,
      owner.subject,
    ),
  };
}

export const givenOf = (
  written: Pick<Definition, 'constants' | 'groups'>,
  inputs: Record<string, number>,
): Given => ({
  inputs,
  constants: Object.fromEntries(written.constants.map((c) => [c.id, c.value])),
  groups: Object.fromEntries(written.groups.map((g) => [g.id, g.keys])),
});

// The definitions worked out for one record before `upTo`, from those that
// have a formula, with the example's inputs; one that fails is left out, and
// a definition reading it then fails with the cause named.
export function valuesFor(
  set: DefinitionSet,
  read: KeptRead,
  key: string,
  inputs: Record<string, number>,
  upTo: string,
  subject: DefinitionSubject,
): Row {
  const values: Row = {};
  for (const definition of set.definitions) {
    if (definition.id === upTo) break;
    if (!definition.formula) continue;
    try {
      values[definition.id] = run(
        definition.formula,
        contextFor(read, key, subject, givenOf(definition, inputs), values),
      );
    } catch {
      // Left out, as above.
    }
  }
  return values;
}

// What an earlier definition gives, as the CEL type a formula is checked
// against; CEL keeps whole numbers and decimals apart.
export const celOf = (value: unknown, definition: Definition) =>
  typeof value === 'bigint'
    ? 'int'
    : typeof value === 'number'
      ? 'double'
      : definition.result === 'check'
        ? 'bool'
        : 'dyn';

// The same, in the words the model is told.
export const KIND_WORDS: Record<string, string> = {
  int: 'a whole number, an int',
  double: 'a decimal, a double',
  bool: 'true or false',
  dyn: 'a number',
};

// Words compared as a reader would: case, quote marks and spacing aside.
const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, '');

// The numbers written into a formula, strings aside; 0, 1 and 100 are
// arithmetic rather than policy, so they may stand in it.
export function strayNumbers(formula: string): number[] {
  const bare = formula.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  return [...bare.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g)]
    .map((m) => Number(m[0]))
    .filter((n) => n !== 0 && n !== 1 && n !== 100);
}

// The text written into a formula in quotes.
const literals = (formula: string) =>
  [...formula.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map(
    (m) => m[1] ?? m[2]!,
  );

// The ids a formula reads under one name, such as values.<id>.
export const readsUnder = (formula: string, name: string) => [
  ...new Set(
    [...formula.matchAll(new RegExp(`\\b${name}\\.([a-z0-9_]+)`, 'gi'))].map(
      (m) => m[1]!,
    ),
  ),
];

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
const DAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// Whether a quote states a value: as a number, a percentage (40% for 40,
// 0.4 or 1.4), a time of day (07:00 for 420 minutes), a day (Saturday for
// 6, Monday being 1) or a small number in words. Its words being somewhere
// in the instructions is not enough: they must say the number.
export function states(quote: string, value: number): boolean {
  const said = quote.toLowerCase();
  const clock = /\b(\d{1,2}):(\d{2})\b/g;
  const times = [...said.matchAll(clock)].map(
    (m) => Number(m[1]) * 60 + Number(m[2]),
  );
  const bare = said.replace(clock, ' ');
  const numbers = [
    ...[...bare.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])),
    ...NUMBER_WORDS.flatMap((word, n) =>
      new RegExp(`\\b${word}\\b`).test(said) ? [n] : [],
    ),
  ];
  const percents = [...bare.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|per ?cent)/g)].map(
    (m) => Number(m[1]),
  );
  const days = DAY_NAMES.flatMap((day, i) =>
    new RegExp(`\\b${day.slice(0, 3)}`).test(said) ? [i + 1] : [],
  );
  return (
    numbers.some((n) => near(n, value)) ||
    percents.some(
      (p) =>
        near(p / 100, value) ||
        near(1 + p / 100, value) ||
        near(1 - p / 100, value),
    ) ||
    times.includes(value) ||
    days.includes(value)
  );
}

// A name's words, singular, for matching a record to the words naming it.
const nameWords = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/(es|s)$/, ''));

// What a written definition is checked against besides itself.
export type Against = {
  text: string;
  subject: DefinitionSubject;
  keys: string[];
  // Each record's name, as the data writes it.
  names: Record<string, string>;
  // The definitions before it, which it may read.
  earlier: string[];
  // The keys of the tables a record reaches, which a formula could single out.
  lookupKeys: string[];
};

// Everything wrong with a written definition before its examples are run,
// in words the model is told; empty when it may be run.
export function problemsOf(
  written: Pick<Definition, 'constants' | 'groups'> & {
    formula: string;
    examples: { key: string }[];
  },
  { text, subject, keys, names, earlier, lookupKeys }: Against,
): string[] {
  const { formula } = written;
  const { singular, plural } = subject.record;
  const problems: string[] = [];
  const parsed = parseError(formula);
  if (parsed) problems.push(`The formula does not parse: ${parsed}.`);
  const instructions = words(text);
  for (const c of written.constants) {
    if (!instructions.includes(words(c.quote)))
      problems.push(
        `The words for constant ${c.id}, "${c.quote}", are not in the instructions; quote them exactly.`,
      );
    else if (!states(c.quote, c.value))
      problems.push(
        `Constant ${c.id} is ${c.value}, but its words "${c.quote}" do not state that number; quote the words of the instructions that give it.`,
      );
  }
  for (const g of written.groups) {
    if (!instructions.includes(words(g.quote)))
      problems.push(
        `The words for group ${g.id}, "${g.quote}", are not in the instructions; quote them exactly.`,
      );
    const unknown = g.keys.filter((k) => !keys.includes(k));
    if (unknown.length)
      problems.push(
        `Group ${g.id} names ${unknown.join(', ')}, which are not ${plural} in the data.`,
      );
    const quoted = new Set(nameWords(g.quote));
    const unnamed = g.keys.filter(
      (k) =>
        keys.includes(k) &&
        ![...nameWords(names[k] ?? ''), ...nameWords(k)].some((w) =>
          quoted.has(w),
        ),
    );
    if (unnamed.length)
      problems.push(
        `The words for group ${g.id}, "${g.quote}", do not name ${unnamed.map((k) => `${k} (${names[k] ?? k})`).join(', ')}; a group holds only the ${plural} its words name.`,
      );
  }
  const used = new Set(readsUnder(formula, 'groups'));
  for (const g of written.groups.filter((g) => used.has(g.id))) {
    const inside = written.examples.some((e) => g.keys.includes(e.key));
    const outside = written.examples.some((e) => !g.keys.includes(e.key));
    if (!inside || !outside)
      problems.push(
        `No example tries a ${singular} ${inside ? 'outside' : 'in'} group ${g.id}; add one, so the formula is tried both ways.`,
      );
  }
  // A proposal's nothing is the process's, not policy the formula invents.
  const stray = strayNumbers(formula).filter(
    (n) => !subject.proposal.some((field) => field.none === n),
  );
  if (stray.length)
    problems.push(
      `The formula writes ${stray.join(', ')} itself; make each a constant with the instructions' words it comes from.`,
    );
  const named = literals(formula).filter(
    (l) => keys.includes(l) || lookupKeys.includes(l),
  );
  if (named.length)
    problems.push(
      `The formula names ${named.map((n) => `"${n}"`).join(', ')} itself; where the instructions name ${subject.record.plural} in words, make them a group with those words, and never single out a key in the formula.`,
    );
  const constants = written.constants.map((c) => c.id);
  const groups = written.groups.map((g) => g.id);
  const undeclared = [
    ...readsUnder(formula, 'constants').filter((id) => !constants.includes(id)),
    ...readsUnder(formula, 'groups').filter((id) => !groups.includes(id)),
  ];
  if (undeclared.length)
    problems.push(
      `The formula reads ${undeclared.join(', ')}, never declared.`,
    );
  const ahead = readsUnder(formula, 'values').filter(
    (id) => !earlier.includes(id),
  );
  if (ahead.length)
    problems.push(
      `The formula reads values.${ahead.join(', values.')}, which is not written before it.`,
    );
  const unknownKeys = written.examples
    .map((e) => e.key)
    .filter((k) => !keys.includes(k));
  if (unknownKeys.length)
    problems.push(`No ${subject.record.singular} ${unknownKeys.join(', ')}.`);
  return problems;
}

const numberOf = (v: unknown) =>
  typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : null;

// The formula on one record, with these values for the proposal's fields.
function runOn(
  { set, read, definition, owner }: Setting,
  draft: Draft,
  key: string,
  inputs: Record<string, number>,
) {
  return run(
    draft.formula,
    contextFor(
      read,
      key,
      owner.subject,
      givenOf(draft, inputs),
      valuesFor(set, read, key, inputs, definition.id, owner.subject),
    ),
  );
}

// Each example run on the read, with what the formula gives and whether it
// agrees.
function runExamples(setting: Setting, draft: Draft): Example[] {
  const { definition } = setting;
  return draft.examples.map((example) => {
    try {
      const raw = runOn(setting, draft, example.key, example.inputs);
      const actual =
        definition.result === 'check'
          ? typeof raw === 'boolean'
            ? raw
            : null
          : numberOf(raw);
      return {
        ...example,
        actual,
        error:
          actual === null
            ? `Gives ${String(raw)}, not ${definition.result === 'check' ? 'true or false' : 'a number'}`
            : null,
        agrees:
          actual !== null &&
          (typeof example.expect === 'number'
            ? Math.abs(Number(actual) - example.expect) < 1e-9
            : actual === example.expect),
      };
    } catch (error) {
      return {
        ...example,
        actual: null,
        error: (error as Error).message.split('\n')[0]!,
        agrees: false,
      };
    }
  });
}

// What a formula may read, typed, for the check before anything runs.
export const scopeOf = (
  setting: Setting,
  written: Pick<Definition, 'constants' | 'groups'>,
): Scope => ({
  values: Object.fromEntries(
    setting.working.map((d) => [d.id, celOf(setting.sample[d.id], d)]),
  ),
  constants: Object.fromEntries(written.constants.map((c) => [c.id, c.value])),
  groups: written.groups.map((g) => g.id),
});

export type Review = {
  // Each problem, in words the model can act on; empty when it passes.
  problems: string[];
  // When the formula ran: its examples, what it reads, and the problem a
  // person is shown (null when every example agrees).
  ran: { examples: Example[]; uses: string[]; problem: string | null } | null;
  // Set when it reads a definition that does not work yet.
  blocked: string | null;
};

export { readsName };

/*
  What a formula has to read to be about anything. `false` passes every other
  check, and every example, when the examples expect false too: a draft wrote
  just that for a rule, with five constants it never used.
*/
export function readingProblems(
  draft: Pick<Definition, 'constants' | 'groups'> & { formula: string },
  subject: DefinitionSubject,
  result: Definition['result'],
): string[] {
  const { formula } = draft;
  const reads = (name: string) => readsName(formula, name);
  const data = variablesOf(subject).filter(
    (name) => name !== 'constants' && name !== 'groups',
  );
  const problems: string[] = [];
  if (!data.some(reads) && (result === 'check' || !reads('constants')))
    problems.push(
      `The formula reads nothing from the data, so it gives the same answer for every ${subject.record.singular}. Read what the rule is about.`,
    );
  const unread = [
    ...draft.constants
      .map((c) => c.id)
      .filter((id) => !readsUnder(formula, 'constants').includes(id)),
    ...draft.groups
      .map((g) => g.id)
      .filter((id) => !readsUnder(formula, 'groups').includes(id)),
  ];
  if (unread.length)
    problems.push(
      `The formula never reads ${unread.join(', ')}. Use each one it needs and remove the rest.`,
    );
  return problems;
}

// The values a field is tried at, to see what a check can do on this read.
const PROBES = [0, 1, 1_000_000];

// The most values taken from one record's own numbers, nearest first.
const MOST_OWN_VALUES = 200;
// A value is a boundary only where whole numbers stay exact.
const LARGEST_OWN_VALUE = 1_000_000_000;
// How many whole multiples of a small number are tried, so a step is met.
const MULTIPLES = [2, 3, 4];
const SMALL_STEP = 100;

/*
  The values worth trying for one record besides the fixed ones: every number
  a formula could read for it (its row, its lookups' rows, the definitions
  before it, and the constants of the versions), each with one either side,
  and a few whole multiples of the small ones, so that a rule's edge or step
  is met wherever this record puts it. Only whole numbers the proposal's
  fields allow are kept. Those the formulas name come first, then the rest,
  and the multiples last, so a bound cuts the farthest.
*/
function ownValues(setting: Setting, drafts: Draft[], key: string): number[] {
  const { records, owner, set, read, definition } = setting;
  const { subject } = owner;
  const written = drafts.map((d) => d.formula).join(' ');
  const none = Object.fromEntries(subject.proposal.map((f) => [f.id, 0]));
  const named: [string, unknown][] = [
    ...Object.entries(records.record(key)).map(
      ([column, v]): [string, unknown] => [`record.${column}`, v],
    ),
    ...Object.entries(records.lookups(key)).flatMap(([as, row]) =>
      Object.entries(row).map(([column, v]): [string, unknown] => [
        `${as}.${column}`,
        v,
      ]),
    ),
    ...Object.entries(
      valuesFor(set, read, key, none, definition.id, subject),
    ).map(([id, v]): [string, unknown] => [`values.${id}`, v]),
    ...drafts.flatMap((d) =>
      d.constants.map((c): [string, unknown] => [`constants.${c.id}`, c.value]),
    ),
  ];
  const mins = subject.proposal.flatMap((f) =>
    f.min === undefined ? [] : [f.min],
  );
  const least = mins.length ? Math.max(...mins) : 0;
  const reads = (name: string) => written.includes(name);
  const numbers = (wanted: boolean) =>
    named.flatMap(([name, v]) => {
      const n = numberOf(v);
      return n !== null && Number.isFinite(n) && reads(name) === wanted
        ? [n]
        : [];
    });
  const whole = (n: number) => [...new Set([Math.floor(n), Math.ceil(n)])];
  const tiersOf = (wanted: boolean) => {
    const own = numbers(wanted).flatMap(whole);
    return [
      own,
      own.flatMap((n) => [n - 1, n + 1]),
      own.flatMap((n) =>
        n >= 2 && n <= SMALL_STEP ? MULTIPLES.map((k) => n * k) : [],
      ),
    ];
  };
  const [mentioned, other] = [tiersOf(true), tiersOf(false)];
  const ordered = [0, 1, 2].flatMap((t) => [mentioned[t]!, other[t]!]).flat();
  return [...new Set(ordered)]
    .filter((n) => Number.isInteger(n) && n >= least && n <= LARGEST_OWN_VALUE)
    .slice(0, MOST_OWN_VALUES);
}

/*
  Whether a check's examples show it working both ways, as far as this read
  lets them. A check cannot always fail: where the data already settles a rule
  for every record, nothing proposed can break it. So the formula is tried on
  every record first, at the fixed values and at each record's own, and only
  an outcome it can reach is required.
*/
function reachOf(setting: Setting, draft: Draft) {
  const { records, owner } = setting;
  const fields = owner.subject.proposal.map((field) => field.id);
  const tried = fields.length
    ? [
        ...PROBES,
        ...draft.examples.flatMap((e) => fields.map((f) => e.inputs[f] ?? 0)),
      ]
    : [0];
  const found: {
    holds?: Pick<Example, 'key' | 'inputs'>;
    fails?: Pick<Example, 'key' | 'inputs'>;
  } = {};
  for (const key of records.keys) {
    const values = new Set([
      ...tried,
      ...(fields.length ? ownValues(setting, [draft], key) : []),
    ]);
    for (const value of values) {
      const inputs = Object.fromEntries(fields.map((f) => [f, value]));
      try {
        const outcome = runOn(setting, draft, key, inputs);
        if (outcome === true) found.holds ??= { key, inputs };
        if (outcome === false) found.fails ??= { key, inputs };
      } catch {
        // A record it cannot be worked out on says nothing either way.
      }
      if (found.holds && found.fails) return found;
    }
  }
  return found;
}

/*
  A formula has to give an answer for every record. One that cannot counts as
  failing wherever it is used, so a formula that forgets a blank cell would block
  every record with no maximum, whatever is proposed.
*/
function everyRecordProblems(setting: Setting, draft: Draft): string[] {
  const { records, owner } = setting;
  const inputs = Object.fromEntries(
    owner.subject.proposal.map((field) => [field.id, 0]),
  );
  const failing = records.keys.flatMap((key) => {
    try {
      runOn(setting, draft, key, inputs);
      return [];
    } catch (error) {
      return [{ key, message: (error as Error).message.split('\n')[0]! }];
    }
  });
  return failing.length
    ? [
        `It cannot be worked out for ${failing.map((f) => f.key).join(', ')}: ${failing[0]!.message}. A blank cell is absent from the record: test it with has(record.<column>).`,
      ]
    : [];
}

// The values a field is tried at when comparing two versions: every whole
// number up to 20, then steps of 5 and a few large ones. Each record adds its
// own (ownValues), where a rule's edge or step falls.
const COMPARED_AT = [
  ...Array.from({ length: 21 }, (_, i) => i),
  ...Array.from({ length: 36 }, (_, i) => 25 + i * 5),
  500,
  1000,
  1_000_000,
];
const MOST_DIFFERENCES = 12;

const outcomeOf = (
  setting: Setting,
  draft: Draft,
  key: string,
  inputs: Record<string, number>,
) => {
  try {
    const raw = runOn(setting, draft, key, inputs);
    return typeof raw === 'bigint' || typeof raw === 'number'
      ? String(Number(Number(raw).toFixed(9)))
      : String(raw);
  } catch {
    return 'cannot be worked out';
  }
};

/*
  Where two versions of a definition give different answers, on every record at
  a range of values, and at the numbers of the record itself and either side of
  them, where a limit or a step would show. How they are worded does not come
  into it, so two that read differently and behave the same agree. Empty when
  no difference was found, which is not proof: a value not tried could still
  tell them apart.
*/
export function differencesBetween(
  setting: Setting,
  a: Draft,
  b: Draft,
): VersionDifference[] {
  const { owner, records } = setting;
  const fields = owner.subject.proposal
    .map((field) => field.id)
    .filter((id) => readsName(a.formula, id) || readsName(b.formula, id));
  const fixed = fields.length
    ? [
        ...COMPARED_AT,
        ...[...a.examples, ...b.examples].flatMap((e) =>
          fields.map((field) => e.inputs[field] ?? 0),
        ),
      ]
    : [0];
  const every = (value: number) =>
    Object.fromEntries(owner.subject.proposal.map((f) => [f.id, value]));
  // Where the versions read two fields, each is also tried on its own, the
  // others at 0: with all at one value, a rule on one field and the same
  // rule on another cannot be told apart.
  const tries = (value: number) =>
    fields.length > 1
      ? [every(value), ...fields.map((f) => ({ ...every(0), [f]: value }))]
      : [every(value)];
  const firstOn = (key: string): VersionDifference | null => {
    const values = new Set([
      ...fixed,
      ...(fields.length ? ownValues(setting, [a, b], key) : []),
    ]);
    for (const value of values)
      for (const inputs of tries(value)) {
        const results = [
          outcomeOf(setting, a, key, inputs),
          outcomeOf(setting, b, key, inputs),
        ];
        if (results[0] !== results[1]) return { key, inputs, results };
      }
    return null;
  };
  const found: VersionDifference[] = [];
  for (const key of records.keys) {
    const difference = firstOn(key);
    if (!difference) continue;
    found.push(difference);
    // The first on each record says most: stop early once there are enough.
    if (found.length >= MOST_DIFFERENCES) return found;
  }
  return found;
}

function bothWaysProblems(setting: Setting, draft: Draft): string[] {
  const { subject } = setting.owner;
  const found = reachOf(setting, draft);
  if (!found.holds)
    return [
      `It fails for every ${subject.record.singular} at every value tried, so it could never be met. Work out what it should say from the instructions.`,
    ];
  const shown = (expected: boolean) =>
    draft.examples.some((e) => e.expect === expected);
  const problems: string[] = [];
  if (!shown(true))
    problems.push(
      `No example where it holds. Add one, such as ${describeExample(found.holds, subject)}.`,
    );
  if (found.fails && !shown(false))
    problems.push(
      `No example where it fails. Add one, such as ${describeExample(found.fails, subject)}.`,
    );
  return problems;
}

/*
  A shape held to how finding read the rule: stated for some records, it must
  say which; stated for every record, it must not limit itself. Two readings of
  the same words compared by code, with no word of the instructions matched. A
  check with no label, no shape (a formula, a refusal) or no result of check
  is held to nothing.
*/
export function scopeProblems(setting: Setting, draft: Draft): string[] {
  const { definition, owner } = setting;
  const { appliesTo } = definition;
  if (!appliesTo || definition.result !== 'check' || !draft.shape) return [];
  const scoped = hasScope(draft.shape);
  const { singular, plural } = owner.subject.record;
  if (appliesTo === 'some' && !scoped)
    return [
      `${SCOPE_MISMATCH}: the instructions limit the rule to some ${plural}, but the shape has no scope. Give its scope, as a group or as conditions.`,
    ];
  if (appliesTo === 'every' && scoped)
    return [
      `${SCOPE_MISMATCH}: the instructions state the rule for every ${singular}, but the shape has a scope. Remove the scope.`,
    ];
  return [];
}

function reviewParts(setting: Setting, draft: Draft) {
  const { owner, text, records, earlier, definition, read } = setting;
  const words = problemsOf(draft, {
    text,
    subject: owner.subject,
    keys: records.keys,
    names: Object.fromEntries(
      records.keys.map((key) => [
        key,
        String(records.record(key)[owner.subject.data.records.name] ?? ''),
      ]),
    ),
    earlier: earlier.map((d) => d.id),
    lookupKeys: records.lookupKeys,
  });
  const typed = checkFormula(
    read,
    owner.subject,
    scopeOf(setting, draft),
    definition.result,
    draft.formula,
  );
  return {
    words,
    typed: typed ? [`The formula: ${typed}`] : [],
    reading: readingProblems(draft, owner.subject, definition.result),
    scope: scopeProblems(setting, draft),
  };
}

export function review(setting: Setting, draft: Draft): Review {
  const { broken, definition } = setting;
  const reads = readsUnder(draft.formula, 'values');
  const blocked = broken.filter((d) => reads.includes(d.id));
  if (blocked.length) {
    const message = `It reads ${blocked.map((d) => d.name).join(', ')}, which does not work yet: write that again first.`;
    return { problems: [message], ran: null, blocked: message };
  }
  const { words, typed, reading, scope } = reviewParts(setting, draft);
  const problems = [...words, ...typed, ...reading];
  if (problems.length)
    return { problems: [...problems, ...scope], ran: null, blocked: null };
  const examples = runExamples(setting, draft);
  const disagree = examples.filter((e) => !e.agrees);
  const unworkable = everyRecordProblems(setting, draft);
  // Whether the examples show both ways only means something once they agree.
  const oneWay =
    !disagree.length && definition.result === 'check'
      ? bothWaysProblems(setting, draft)
      : [];
  return {
    problems: [
      ...scope,
      ...disagree.map((e) => disagreement(e, setting, draft)),
      ...unworkable,
      ...oneWay,
    ],
    // The scope first: it is what a person can correct, and the examples
    // were written for the other reading.
    ran: {
      examples,
      uses: reads,
      problem:
        scope[0] ??
        (disagree.length
          ? `${disagree.length} of ${examples.length} examples disagree with the formula.`
          : (unworkable[0] ?? oneWay[0] ?? null)),
    },
    blocked: null,
  };
}

// With the values the formula read for that example, since those are what a
// model working it out by hand gets wrong.
function disagreement(e: Example, setting: Setting, draft: Draft) {
  const { owner, set, read, definition } = setting;
  const { subject } = owner;
  const values = valuesFor(set, read, e.key, e.inputs, definition.id, subject);
  const reads = readsUnder(draft.formula, 'values').map(
    (id) => `${id} is ${String(values[id])}`,
  );
  return `${describeExample(e, subject)}: you worked out ${String(e.expect)}, the formula gives ${e.error ?? String(e.actual)}.${reads.length ? ` For ${e.key}, ${reads.join(' and ')}.` : ''} Work it out again by hand from the data and these values: correct the example if it was wrong, or the formula if it misreads the instructions.`;
}

export type ReviewPart = {
  id: string;
  label: string;
  // Each problem found; empty when it passes.
  problems: string[];
  // What was found besides, or why it was not looked at.
  note: string | null;
};

/*
  Everything `review` holds a definition to, one part at a time, and without
  stopping at the first part to fail, so a person can see all of it. Built from
  the same parts as review, so the two cannot come to say different things.
*/
export function reviewBreakdown(setting: Setting, draft: Draft): ReviewPart[] {
  const { definition, broken } = setting;
  const { words, typed, reading, scope } = reviewParts(setting, draft);
  const reads = readsUnder(draft.formula, 'values');
  const missing = broken.filter((d) => reads.includes(d.id));
  const examples = runExamples(setting, draft);
  const disagree = examples.filter((e) => !e.agrees);
  const parts: ReviewPart[] = [
    {
      id: 'reads-working',
      label: 'Reads only definitions that work',
      problems: missing.length
        ? [
            `It reads ${missing.map((d) => d.name).join(', ')}, which does not work yet.`,
          ]
        : [],
      note: null,
    },
    {
      id: 'instructions',
      label: 'Quotes the instructions, and writes no number or record itself',
      problems: words,
      note: null,
    },
    {
      id: 'fits',
      label: 'Fits the data’s columns and types',
      problems: typed,
      note: null,
    },
    {
      id: 'reading',
      label: 'Reads the data, and everything it declares',
      problems: reading,
      note: null,
    },
    // Only where finding gave a reading to hold it to.
    ...(definition.appliesTo
      ? [
          {
            id: 'scope',
            label: 'Its scope matches how the instructions were read',
            problems: scope,
            note: `Finding read it as for ${definition.appliesTo === 'some' ? `some ${setting.owner.subject.record.plural}` : `every ${setting.owner.subject.record.singular}`}.`,
          },
        ]
      : []),
    {
      id: 'every-record',
      label: 'Can be worked out for every record',
      problems: everyRecordProblems(setting, draft),
      note: null,
    },
    {
      id: 'examples',
      label: 'Every example agrees with the formula',
      problems: disagree.map((e) => disagreement(e, setting, draft)),
      note: `${examples.length - disagree.length} of ${examples.length} agree.`,
    },
  ];
  if (definition.result === 'check') {
    const found = reachOf(setting, draft);
    parts.push({
      id: 'both-ways',
      label:
        'Examples show it holding and failing, as far as the data lets them',
      problems: disagree.length ? [] : bothWaysProblems(setting, draft),
      note: disagree.length
        ? 'Not looked at until the examples agree.'
        : found.holds && found.fails
          ? 'On this read it can hold and can fail.'
          : found.holds
            ? 'On this read it cannot fail, so no failing example is needed.'
            : 'On this read it cannot hold.',
    });
  }
  return parts;
}

// The definitions that read this one, directly or through another.
export function dependentsOf(set: DefinitionSet, id: string): Set<string> {
  const found = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of set.definitions)
      if (!found.has(d.id) && d.uses.some((u) => u === id || found.has(u))) {
        found.add(d.id);
        grew = true;
      }
  }
  return found;
}
