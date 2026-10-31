import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { review, reviewBreakdown, settingOf, type Draft } from './checks';
import { debugDefinition, debugDraft } from './debug';
import { definition, example } from './set.fixture';
import type { KeptRead } from './records';
import type { DefinitionProcess, DefinitionSet } from './types';

// What a person debugging a draft is shown, worked out by code alone.

const read = capturedRead();
const TEXT = 'Expected sales are the first weekend. Order in whole cases.';
const WHOLE_CASES = 'order % record.case_size == 0';
const holds = { ...example(true, true), inputs: { order: 8 } };
const fails = { ...example(false, true), inputs: { order: 5 } };
const number = definition('first_weekend', {
  name: 'First weekend',
  formula: 'record.weekend_1',
  uses: [],
});
const check = definition('whole_cases', {
  name: 'Whole cases',
  result: 'check',
  consequence: 'block',
  text: 'Order in whole cases.',
  formula: WHOLE_CASES,
  examples: [holds, fails],
  model: 'test-model',
});
const setOf = (
  ...definitions: DefinitionSet['definitions']
): DefinitionSet => ({
  hash: 'h',
  version: 'v1',
  intent: 'Order enough.',
  intentConfirmedAt: null,
  readId: read.id,
  foundAt: '2026-10-31T00:00:00.000Z',
  model: 'finder',
  definitions,
});
const debugOf = (
  set: DefinitionSet,
  id: string,
  inputs?: Record<string, number>,
) => debugDefinition(owner, TEXT, set, read, id, inputs)!;

describe('debugging one rule', () => {
  it('says nothing of a definition that is not there', () => {
    expect(debugDefinition(owner, TEXT, setOf(check), read, 'nope')).toBeNull();
  });

  it('works the formula out on every record, at the value tried', () => {
    const { records, inputs } = debugOf(setOf(check), 'whole_cases', {
      order: 8,
    });
    expect(inputs).toEqual({ order: 8 });
    expect(records).toHaveLength(11);
    const sourdough = records.find((r) => r.key === 'SD-01')!;
    expect(sourdough).toMatchObject({ result: true, error: null });
    expect(sourdough.steps[0]).toBe('8 % 8 == 0');
    expect(records.find((r) => r.key === 'AV-RR')?.result).toBe(false);
  });

  it('gives a calculation’s value as a plain number', () => {
    const { records } = debugOf(setOf(number), 'first_weekend');
    expect(records.find((r) => r.key === 'SD-01')?.result).toBe(28);
  });

  it('reports a record it could not work out, and carries on', () => {
    const broken = definition('broken', {
      result: 'check',
      formula: 'record.no_such_column > 0',
    });
    const { records } = debugOf(setOf(broken), 'broken');
    expect(records).toHaveLength(11);
    expect(records[0]?.error).toBeTruthy();
    expect(records[0]?.result).toBeNull();
  });

  it('has nothing to work out or check before it is written', () => {
    const debug = debugOf(setOf(definition('unwritten')), 'unwritten');
    expect(debug.records).toEqual([]);
    expect(debug.checks).toEqual([]);
    expect(debug.summary.written).toBe(false);
  });

  it('gives the sentences a rule came from, and says when none were kept', () => {
    const accounted = {
      ...setOf(check),
      accounting: [
        {
          sentence: 'Order in whole cases.',
          kind: 'check' as const,
          definitions: ['whole_cases'],
        },
        { sentence: 'Other.', kind: 'context' as const, definitions: [] },
      ],
    };
    expect(debugOf(accounted, 'whole_cases').source.sentences).toEqual([
      { sentence: 'Order in whole cases.', kind: 'check', how: 'states' },
    ]);
    expect(debugOf(setOf(check), 'whole_cases').source.sentences).toBeNull();
  });

  it('gives a sentence it only takes a number from, read as what it was read', () => {
    const quoting = definition('opening', {
      result: 'check',
      formula: 'order >= constants.opening',
      constants: [{ id: 'opening', value: 7, quote: 'from 07:00' }],
    });
    const set = {
      ...setOf(quoting),
      accounting: [
        {
          sentence: 'We open every Saturday from 07:00 to noon.',
          kind: 'context' as const,
          definitions: [],
        },
        {
          sentence: 'Unrelated.',
          kind: 'context' as const,
          definitions: [],
        },
      ],
    };
    expect(debugOf(set, 'opening').source.sentences).toEqual([
      {
        sentence: 'We open every Saturday from 07:00 to noon.',
        kind: 'context',
        how: 'quotes',
      },
    ]);
    const rows = debugDraft(owner, TEXT, set, read).accounting!;
    expect(rows[0]?.quotedBy).toEqual(['opening']);
    expect(rows[1]?.quotedBy).toEqual([]);
  });

  it('says what it reads and what reads it', () => {
    const reader = definition('reader', {
      name: 'Reader',
      result: 'check',
      formula: 'values.first_weekend > 0',
      uses: ['first_weekend'],
    });
    const set = setOf(number, reader);
    expect(debugOf(set, 'reader').summary.reads).toEqual([
      { id: 'first_weekend', name: 'First weekend' },
    ]);
    expect(debugOf(set, 'first_weekend').summary.readBy).toEqual([
      { id: 'reader', name: 'Reader' },
    ]);
  });
});

describe('debugging any process, not this one', () => {
  // Nothing in common with the process above: its own records and fields.
  const rota: DefinitionProcess = {
    id: 'rota',
    subject: {
      record: { singular: 'employee', plural: 'employees' },
      data: {
        records: { tabs: ['Staff'], key: 'employee', name: 'name' },
        lookups: [],
        types: {},
      },
      proposal: [
        { id: 'hours', label: 'hours', unit: 'hours' },
        { id: 'shifts', label: 'shifts', unit: 'shifts' },
      ],
      reader: 'shift manager',
    },
  };
  const rotaRead: KeptRead = {
    ...read,
    tabs: [
      {
        name: 'Staff',
        values: [
          ['employee', 'name', 'contracted'],
          ['E1', 'Ada', 40],
          ['E2', 'Bo', 20],
        ],
      },
    ],
  };
  const limit = definition('limit', {
    result: 'check',
    consequence: 'block',
    formula: 'hours <= record.contracted',
  });
  const debugRota = (
    item: DefinitionSet['definitions'][number],
    inputs?: Record<string, number>,
  ) => debugDefinition(rota, TEXT, setOf(item), rotaRead, item.id, inputs)!;

  it('says what is tried and worked out in that process’s own words', () => {
    const debug = debugRota(limit, { hours: 30 });
    expect(debug.about).toEqual({ record: 'employee', key: 'employee' });
    expect(debug.fields).toEqual([{ id: 'hours', label: 'hours' }]);
    expect(debug.records.map((r) => [r.key, r.name, r.result])).toEqual([
      ['E1', 'Ada', true],
      ['E2', 'Bo', false],
    ]);
  });

  it('offers every field a formula reads, and none it does not', () => {
    const both = definition('both', {
      result: 'check',
      formula: 'hours <= record.contracted && shifts <= record.contracted',
    });
    expect(debugRota(both).fields.map((f) => f.id)).toEqual([
      'hours',
      'shifts',
    ]);
    const none = definition('none', { formula: 'record.contracted' });
    expect(debugRota(none).fields).toEqual([]);
    expect(debugRota(none).records[1]?.result).toBe(20);
  });

  it('does not take a field of the same name for the proposal’s', () => {
    const other = definition('other', { formula: 'record.hours' });
    expect(debugRota(other).fields).toEqual([]);
  });
});

describe('the breakdown of what code checks', () => {
  const drafted = (formula: string, examples: Draft['examples']): Draft => ({
    formula,
    constants: [],
    groups: [],
    examples,
  });
  const settingFor = () => settingOf(owner, TEXT, setOf(check), read, check);
  const problemsIn = (draft: Draft) =>
    reviewBreakdown(settingFor(), draft).flatMap((part) => part.problems);

  // Each is a draft review refuses for one reason, or passes.
  it.each([
    ['passes', drafted(WHOLE_CASES, [holds, fails])],
    ['one way', drafted(WHOLE_CASES, [holds])],
    ['disagrees', drafted(WHOLE_CASES, [{ ...holds, expect: false }])],
    ['never met', drafted('order < 0', [fails])],
  ])('says what review says: %s', (_, draft) => {
    expect(problemsIn(draft)).toEqual(review(settingFor(), draft).problems);
  });

  it('shows every part at once, where review stops at the first to fail', () => {
    const draft = drafted('false', [fails]);
    expect(problemsIn(draft)).toEqual(
      expect.arrayContaining(review(settingFor(), draft).problems),
    );
    expect(problemsIn(draft).length).toBeGreaterThan(
      review(settingFor(), draft).problems.length,
    );
    const parts = reviewBreakdown(settingFor(), draft);
    expect(parts.map((part) => part.id)).toEqual([
      'reads-working',
      'instructions',
      'fits',
      'reading',
      'every-record',
      'examples',
      'both-ways',
    ]);
    expect(parts.find((p) => p.id === 'reading')?.problems).toHaveLength(1);
    expect(parts.find((p) => p.id === 'examples')?.note).toBe('1 of 1 agree.');
  });

  it('says when this read cannot make a check fail', () => {
    const [bothWays] = reviewBreakdown(
      settingFor(),
      drafted('order == 0 || record.delivery_day < 100', [holds]),
    ).filter((part) => part.id === 'both-ways');
    expect(bothWays?.problems).toEqual([]);
    expect(bothWays?.note).toContain('cannot fail');
  });

  it('leaves both-ways out of a calculation', () => {
    const parts = reviewBreakdown(
      settingOf(owner, TEXT, setOf(number), read, number),
      drafted('record.weekend_1', [{ ...example(28, true), inputs: {} }]),
    );
    expect(parts.some((part) => part.id === 'both-ways')).toBe(false);
  });
});

describe('debugging the draft', () => {
  const accounting = [
    {
      sentence: 'Expected sales are the first weekend.',
      kind: 'quantity' as const,
      definitions: ['first_weekend'],
    },
    {
      sentence: 'Order in whole cases.',
      kind: 'check' as const,
      definitions: ['whole_cases'],
    },
  ];

  it('holds the kept account to the same rules, now', () => {
    const debug = debugDraft(
      owner,
      TEXT,
      { ...setOf(number, check), accounting },
      read,
    );
    expect(debug.accounting).toHaveLength(2);
    expect(debug.accountProblems).toEqual([]);
    // Lost a calculation since: the account no longer holds.
    expect(
      debugDraft(owner, TEXT, { ...setOf(check), accounting }, read)
        .accountProblems,
    ).toEqual([expect.stringContaining('first_weekend')]);
  });

  it('says what was refused, and which models wrote it', () => {
    const debug = debugDraft(
      owner,
      TEXT,
      { ...setOf(check), refused: ['Not accounted for: sentence 1.'] },
      read,
    );
    expect(debug.refused).toEqual(['Not accounted for: sentence 1.']);
    expect(debug.models).toEqual(['finder', 'test-model']);
  });

  it('has no account for a draft found before they were kept', () => {
    const debug = debugDraft(owner, TEXT, setOf(check), read);
    expect(debug.accounting).toBeNull();
    expect(debug.accountProblems).toEqual([]);
  });
});

describe('the columns rules read', () => {
  const stock = (id: string, formula: string, uses: string[] = []) =>
    definition(id, { name: id, result: 'check', formula, uses });
  const ripe = stock(
    'ripe',
    'record.on_hand - record.reserved + order <= values.expected',
    ['expected'],
  );
  const cover = stock(
    'cover',
    'record.on_hand - record.reserved + record.inbound_before_start + order >= values.target',
    ['target'],
  );
  const expected = definition('expected', {
    name: 'expected',
    formula: 'record.weekend_1 + record.weekend_2',
  });
  const target = definition('target', {
    name: 'target',
    formula: 'values.expected * (100 + category.safety_pct) / 100',
    uses: ['expected'],
  });
  const set = setOf(expected, target, ripe, cover);

  it('shows two rules counting the same thing differently', () => {
    const columns = debugDraft(owner, TEXT, set, read).columns!;
    const of = (id: string) => columns.rules.find((rule) => rule.id === id)!;
    expect(of('ripe').own).toEqual(['on_hand', 'reserved']);
    expect(of('cover').own).toEqual([
      'on_hand',
      'reserved',
      'inbound_before_start',
    ]);
  });

  it('follows what a rule reads through other calculations, all the way', () => {
    const { own, through } = debugOf(set, 'cover').source.columns;
    expect(through).toEqual(['category.safety_pct', 'weekend_1', 'weekend_2']);
    expect(own).not.toContain('weekend_1');
  });

  it('does not list what a rule reads itself as read through another too', () => {
    const both = stock('both', 'record.weekend_1 > values.expected', [
      'expected',
    ]);
    const { own, through } = debugOf(setOf(expected, both), 'both').source
      .columns;
    expect(own).toEqual(['weekend_1']);
    expect(through).toEqual(['weekend_2']);
  });

  it('lists what no rule reads, not what names a record or is its way in', () => {
    const { unread } = debugDraft(owner, TEXT, set, read).columns!;
    expect(unread).toContain('cost_price');
    expect(unread).toContain('weekend_3');
    expect(unread).toContain('category.margin_floor_pct');
    for (const reads of [
      'sku',
      'product',
      'on_hand',
      'category',
      'category.category',
    ])
      expect(unread).not.toContain(reads);
  });

  it('counts what a worked-out column comes from as read', () => {
    const age = stock('age', 'record.count_age_hours <= 24.0');
    const { unread } = debugDraft(owner, TEXT, setOf(age), read).columns!;
    expect(unread).not.toContain('count_age_hours');
    expect(unread).not.toContain('counted_day');
    expect(unread).not.toContain('counted_time');
    expect(unread).toContain('cutoff_day');
    expect(unread).toContain('hours_until_cutoff');
  });

  it('has nothing to say with no read', () => {
    expect(debugDraft(owner, TEXT, set, null).columns).toBeNull();
  });
});
