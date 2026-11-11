import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
import { givenOf, valuesFor } from './checks';
import { checkFormula, contextFor, run } from './formulas';
import { recordsOf, type KeptRead } from './records';
import {
  confirmProfile,
  profileOf,
  setColumnBlank,
  setColumnLabel,
  withProfile,
} from './profile';
import { definition } from './set.fixture';
import {
  canonicalShape,
  withoutUnused,
  formulaOf,
  referencesOf,
  valuesInWords,
  sameShape,
  sentenceOf,
  shapeProblems,
  unansweredBlanks,
  usesOf,
  type Shape,
  type ShapeContext,
} from './shapes';
import {
  definitionSetSchema,
  type DataProfile,
  type Definition,
  type DefinitionSet,
} from './types';
import { applies } from './working';

// Checks written as shapes: the formula and the sentence come from code, so
// what a hand-written formula got wrong cannot be written. Run on the captured
// read (read Thu 17:03; every cutoff that Thursday has passed).

const earlier: Definition[] = [
  definition('stock_available', {
    name: 'Stock available',
    formula: 'record.on_hand - record.reserved + record.inbound_before_start',
  }),
  definition('expected_sales', {
    name: 'Expected sales',
    formula: 'record.weekend_1',
  }),
];

const contextOn = (
  read: KeptRead,
  more: Partial<ShapeContext> = {},
): ShapeContext => ({
  subject: owner.subject,
  records: recordsOf(read, owner.subject.data),
  read,
  consequence: 'block',
  constants: [],
  groups: [],
  earlier,
  ...more,
});

// The shape's formula on one record, with this much proposed.
function outcome(
  shape: Shape,
  key: string,
  order: number,
  { read = capturedRead(), ...more }: Partial<ShapeContext> = {},
) {
  const context = contextOn(read, more);
  const item = definition('the_rule', {
    result: 'check',
    consequence: context.consequence,
  });
  const set = {
    definitions: [...earlier, item],
  } as unknown as DefinitionSet;
  const formula = formulaOf(shape, context);
  return run(
    formula,
    contextFor(
      read,
      key,
      owner.subject,
      givenOf(context, { order }),
      valuesFor(set, read, key, { order }, item.id, owner.subject),
    ),
  );
}

const shape = (more: Partial<Shape> & Pick<Shape, 'kind'>): Shape => ({
  field: more.kind === 'flag' ? null : 'order',
  at: null,
  amount: null,
  base: null,
  compare: null,
  target: null,
  margin_pct: null,
  when: [],
  only_for_group: null,
  only_for_when: [],
  if_blank: 'skip',
  ...more,
});

const CUTOFF = shape({
  kind: 'only_when',
  when: [{ left: 'moment:cutoff', op: 'after', right: 'moment:read' }],
});
const ARRIVES = shape({
  kind: 'only_when',
  when: [{ left: 'moment:delivery', op: 'before', right: 'moment:start' }],
});
const SUPPLIER_MAX = shape({
  kind: 'limit',
  at: 'most',
  amount: 'column:max_order_units',
});
const WHOLE_CASES = shape({ kind: 'step', amount: 'column:case_size' });
const COVER = shape({
  kind: 'target',
  base: 'value:stock_available',
  compare: 'reach',
  target: 'value:expected_sales',
  margin_pct: 'column:category.safety_pct',
});
const FRESH_COUNT = shape({
  kind: 'flag',
  when: [
    {
      left: 'hours_since:counted',
      op: '>',
      right: 'column:category.max_count_age_hours',
    },
  ],
});
const RIPE_CAP = shape({
  kind: 'target',
  base: 'value:stock_available',
  compare: 'not_exceed',
  target: 'value:expected_sales',
  only_for_when: [{ left: 'column:ripe', op: 'is_yes', right: null }],
});

describe('a check written as a shape', () => {
  it('stops an order once the cutoff has passed, and never stops ordering nothing', () => {
    expect(outcome(CUTOFF, 'SD-01', 8)).toBe(false);
    expect(outcome(CUTOFF, 'SD-01', 0)).toBe(true);
  });

  it('compares a delivery with the start, wherever in the week it falls', () => {
    expect(outcome(ARRIVES, 'SD-01', 8)).toBe(true);
    const tabs = capturedTabs();
    const deliveries = tabs.find((t) => t.name === 'Deliveries')!.values;
    deliveries.find((row) => row[0] === 'SD-01')![2] = 'Sun';
    const late = capturedRead(tabs);
    expect(outcome(ARRIVES, 'SD-01', 8, { read: late })).toBe(false);
    expect(outcome(ARRIVES, 'SD-01', 0, { read: late })).toBe(true);
  });

  it('skips a record whose cell is blank, and says so where the read has one', () => {
    expect(outcome(SUPPLIER_MAX, 'SD-01', 80)).toBe(false);
    expect(outcome(SUPPLIER_MAX, 'SD-01', 72)).toBe(true);
    expect(outcome(SUPPLIER_MAX, 'AV-RR', 1000)).toBe(true);
    expect(sentenceOf(SUPPLIER_MAX, contextOn(capturedRead()))).toContain(
      'Where the max order units is blank, it does not apply.',
    );
    const failing = { ...SUPPLIER_MAX, if_blank: 'fail' as const };
    expect(outcome(failing, 'AV-RR', 1000)).toBe(false);
  });

  it('reads whole multiples', () => {
    expect(outcome(WHOLE_CASES, 'SD-01', 8)).toBe(true);
    expect(outcome(WHOLE_CASES, 'SD-01', 5)).toBe(false);
  });

  it('covers a target with its margin, and leaves the rest to a person', () => {
    const decide = { consequence: 'decide' as const };
    // SD-01: nothing in stock, 28 expected, 10% margin: 30.8 is needed.
    expect(outcome(COVER, 'SD-01', 0, decide)).toBe(false);
    expect(outcome(COVER, 'SD-01', 30, decide)).toBe(false);
    expect(outcome(COVER, 'SD-01', 31, decide)).toBe(true);
    expect(sentenceOf(COVER, contextOn(capturedRead(), decide))).toBe(
      'The stock available plus the proposed order should reach the expected sales plus the category safety pct percent. Otherwise a person decides.',
    );
  });

  it('flags an old count whatever is proposed, as hours since a moment', () => {
    const decide = { consequence: 'decide' as const };
    // AV-LS was counted on Tuesday; SD-01 on Thursday morning.
    expect(outcome(FRESH_COUNT, 'AV-LS', 0, decide)).toBe(false);
    expect(outcome(FRESH_COUNT, 'SD-01', 0, decide)).toBe(true);
  });

  it('applies only within its scope, in the form the working recognises', () => {
    expect(outcome(RIPE_CAP, 'AV-RR', 60)).toBe(false);
    expect(outcome(RIPE_CAP, 'AV-RR', 0)).toBe(true);
    expect(outcome(RIPE_CAP, 'SD-01', 1000)).toBe(true);
    const read = capturedRead();
    const formula = formulaOf(RIPE_CAP, contextOn(read));
    const given = givenOf({ constants: [], groups: [] }, { order: 1000 });
    expect(
      applies(formula, contextFor(read, 'SD-01', owner.subject, given, {}), [
        'order',
      ]),
    ).toBe(false);
  });

  it('lets nothing through only where the process says what nothing is', () => {
    const silent = {
      ...owner.subject,
      proposal: owner.subject.proposal.map((f) => ({ ...f, none: undefined })),
    };
    const read = capturedRead();
    expect(formulaOf(CUTOFF, contextOn(read))).toContain('order == 0');
    expect(
      formulaOf(CUTOFF, contextOn(read, { subject: silent })),
    ).not.toContain('order == 0');
    expect(
      formulaOf(CUTOFF, contextOn(read, { consequence: 'decide' })),
    ).not.toContain('order == 0');
  });

  it('type-checks as written, for every shape', () => {
    const read = capturedRead();
    for (const [one, consequence] of [
      [CUTOFF, 'block'],
      [ARRIVES, 'block'],
      [SUPPLIER_MAX, 'block'],
      [WHOLE_CASES, 'block'],
      [COVER, 'decide'],
      [FRESH_COUNT, 'decide'],
      [RIPE_CAP, 'block'],
    ] as const) {
      const context = contextOn(read, { consequence });
      expect(shapeProblems(one, context)).toEqual([]);
      expect(
        checkFormula(
          read,
          owner.subject,
          {
            values: { stock_available: 'int', expected_sales: 'int' },
            constants: {},
            groups: [],
          },
          'check',
          formulaOf(one, context),
        ),
      ).toBeNull();
    }
    expect(usesOf(COVER, contextOn(read, { consequence: 'decide' }))).toEqual([
      'stock_available',
      'expected_sales',
    ]);
  });

  it('says the moments it compares, and never one read’s clock', () => {
    expect(sentenceOf(CUTOFF, contextOn(capturedRead()))).toBe(
      'The proposed order is allowed only when the supplier’s cutoff is after the data is read. Proposing 0 units is always allowed.',
    );
    expect(sentenceOf(ARRIVES, contextOn(capturedRead()))).toContain(
      'the delivery is before the start (Sat 07:00)',
    );
  });
});

describe('an example worked out in words', () => {
  it('says what the rule reads of the record, never its formula', () => {
    const read = capturedRead();
    const given = givenOf({ constants: [], groups: [] }, { order: 70 });
    const formulas = contextFor(read, 'SD-01', owner.subject, given, {});
    expect(
      valuesInWords(SUPPLIER_MAX, contextOn(read), 'SD-01', formulas),
    ).toBe('the proposed order is 70; the max order units is 72');
    expect(valuesInWords(CUTOFF, contextOn(read), 'SD-01', formulas)).toBe(
      'the proposed order is 70; the supplier’s cutoff is Thu 14:00; the data was read at Thu 17:03',
    );
  });
});

describe('what is wrong with a shape', () => {
  const problems = (one: Shape, more: Partial<ShapeContext> = {}) =>
    shapeProblems(one, contextOn(capturedRead(), more));

  it('names what does not exist, or is not the kind its place needs', () => {
    expect(
      problems(
        shape({
          kind: 'limit',
          field: 'price',
          at: 'most',
          amount: 'column:product',
        }),
      ),
    ).toEqual([
      'No proposal field price; the fields are order.',
      'product is not a number.',
    ]);
    expect(
      problems(
        shape({
          kind: 'only_when',
          when: [
            { left: 'column:case_size', op: 'is_yes', right: null },
            { left: 'moment:arrival', op: 'before', right: 'moment:start' },
          ],
        }),
      ),
    ).toEqual([
      'case_size is not a yes/no column.',
      'No moment arrival; the moments are start, read, counted, cutoff, delivery.',
    ]);
    expect(problems({ ...WHOLE_CASES, only_for_group: 'kit' })).toEqual([
      'No group kit: declare it with the words that name its records.',
    ]);
  });

  it('reads a bare name where only one thing is meant, and asks otherwise', () => {
    const bare = shape({
      kind: 'limit',
      at: 'most',
      amount: 'max_order_units',
    });
    expect(problems(bare)).toEqual([]);
    expect(formulaOf(bare, contextOn(capturedRead()))).toBe(
      formulaOf(SUPPLIER_MAX, contextOn(capturedRead())),
    );
    const both = {
      constants: [{ id: 'case_size', value: 6, quote: '6' }],
    };
    expect(
      problems(shape({ kind: 'step', amount: 'case_size' }), both)[0],
    ).toMatch(/could be a column or a constant/);
    expect(
      problems(
        shape({
          kind: 'only_when',
          when: [{ left: 'hours_since:counted', op: 'before', right: 'start' }],
        }),
      )[0],
    ).toMatch(/^before puts one moment against another/);
  });

  it('says time only with moments, never the signed hours worked out for formulas', () => {
    expect(
      problems(
        shape({
          kind: 'only_when',
          when: [
            {
              left: 'column:hours_until_cutoff',
              op: '>=',
              right: 'column:case_size',
            },
          ],
        }),
      ),
    ).toEqual(['No column hours_until_cutoff.']);
  });

  it('reads hours since only a moment that has happened by the read', () => {
    const since = (moment: string) =>
      problems(
        shape({
          kind: 'only_when',
          when: [
            {
              left: `hours_since:${moment}`,
              op: '<',
              right: 'column:case_size',
            },
          ],
        }),
      );
    expect(since('counted')).toEqual([]);
    expect(since('cutoff')[0]).toMatch(
      /^hours_since:cutoff is not a number of hours: cutoff may still be to come/,
    );
    expect(since('read')[0]).toMatch(/is when the data was read/);
  });

  it('says which blanks a kind needs', () => {
    expect(
      problems(shape({ kind: 'target', base: 'value:stock_available' })),
    ).toEqual(['target needs compare.', 'target needs target.']);
  });

  it('keeps a flag for a check a person decides', () => {
    expect(problems(FRESH_COUNT)[0]).toMatch(/^flag is for a check a person/);
    expect(problems(FRESH_COUNT, { consequence: 'decide' })).toEqual([]);
  });
});

describe('two shapes', () => {
  it('are the same whatever their constants and groups are called', () => {
    const read = capturedRead();
    const limit = (id: string, value: number) => ({
      ...contextOn(read, { constants: [{ id, value, quote: String(value) }] }),
      shape: shape({ kind: 'limit', at: 'most', amount: `constant:${id}` }),
    });
    expect(sameShape(limit('cap', 40), limit('most_units', 40))).toBe(true);
    expect(sameShape(limit('cap', 40), limit('most_units', 41))).toBe(false);
  });
});

describe('a shape written loosely, where only one thing is meant', () => {
  // The same rule, spelt as the canonical shape: formula and sentence agree.
  const says = (
    loose: Shape,
    canonical: Shape,
    more: Partial<ShapeContext> = {},
  ) => {
    const context = contextOn(capturedRead(), more);
    expect(shapeProblems(loose, context)).toEqual([]);
    expect(formulaOf(loose, context)).toBe(formulaOf(canonical, context));
    expect(sentenceOf(loose, context)).toBe(sentenceOf(canonical, context));
    expect(canonicalShape(loose, context)).toEqual(
      canonicalShape(canonical, context),
    );
    expect(
      sameShape({ ...context, shape: loose }, { ...context, shape: canonical }),
    ).toBe(true);
  };
  const problems = (one: Shape, more: Partial<ShapeContext> = {}) =>
    shapeProblems(one, contextOn(capturedRead(), more));
  const two = {
    ...owner.subject,
    proposal: [
      ...owner.subject.proposal,
      { ...owner.subject.proposal[0]!, id: 'extra' },
    ],
  };

  it('reads conditions on a kind with none of its own as its scope, never dropping them', () => {
    const ripe = [{ left: 'column:ripe', op: 'is_yes' as const, right: null }];
    // Dropped, the limit would hold for every record, with nothing to say so.
    says(
      { ...SUPPLIER_MAX, when: ripe },
      { ...SUPPLIER_MAX, only_for_when: ripe },
    );
    expect(
      sentenceOf({ ...SUPPLIER_MAX, when: ripe }, contextOn(capturedRead())),
    ).toMatch(/^For products where the ripe is yes only: /);
    expect(
      withoutUnused({ ...SUPPLIER_MAX, when: ripe }).only_for_when,
    ).toEqual(ripe);
    // Beside another scope they could mean two things: said, not guessed.
    const refused = [
      'limit does not read when: put what limits the rule to some products in only_for_when alone, or use only_when.',
    ];
    const other = [{ left: 'column:ripe', op: 'is_no' as const, right: null }];
    expect(
      problems({ ...SUPPLIER_MAX, when: ripe, only_for_when: other }),
    ).toEqual(refused);
    expect(
      problems(
        withoutUnused({ ...SUPPLIER_MAX, when: ripe, only_for_when: other }),
      ),
    ).toEqual(refused);
  });

  it('reads a field written proposed:<id> as the bare id', () => {
    says({ ...SUPPLIER_MAX, field: 'proposed:order' }, SUPPLIER_MAX);
    expect(problems({ ...SUPPLIER_MAX, field: 'proposed:price' })).toEqual([
      'No proposal field price; the fields are order.',
    ]);
  });

  it('gives a missing field the only proposal field there is, and lists them where there are several', () => {
    says({ ...SUPPLIER_MAX, field: null }, SUPPLIER_MAX);
    says({ ...WHOLE_CASES, field: '' }, WHOLE_CASES);
    expect(
      problems({ ...SUPPLIER_MAX, field: null }, { subject: two }),
    ).toEqual(['limit needs field: the fields are order, extra.']);
    // A flag is about no field, and needs none.
    expect(
      problems(FRESH_COUNT, { consequence: 'decide', subject: two }),
    ).toEqual([]);
  });

  it('reads a group of "" or the word null as no group', () => {
    for (const group of ['', 'null', ' Null ', 'NULL'])
      says({ ...WHOLE_CASES, only_for_group: group }, WHOLE_CASES);
    // Still a group where one is named, and still not with conditions.
    expect(problems({ ...WHOLE_CASES, only_for_group: 'kit' })).toEqual([
      'No group kit: declare it with the words that name its records.',
    ]);
    expect(
      problems({
        ...RIPE_CAP,
        only_for_group: 'kit',
      }),
    ).toContain('Limit the rule to a group or to conditions, not both.');
  });

  it('reads the kind a name is where a prefix names the wrong one and it is only one', () => {
    // An earlier number written as a column, and a column written as a value.
    says(
      {
        ...COVER,
        base: 'column:stock_available',
        target: 'column:expected_sales',
      },
      COVER,
      { consequence: 'decide' },
    );
    says({ ...SUPPLIER_MAX, amount: 'value:max_order_units' }, SUPPLIER_MAX);
    says(
      {
        ...RIPE_CAP,
        only_for_when: [{ left: 'value:ripe', op: 'is_yes', right: null }],
      },
      RIPE_CAP,
    );
    says(
      {
        ...SUPPLIER_MAX,
        amount: 'column:cap',
      },
      { ...SUPPLIER_MAX, amount: 'constant:cap' },
      { constants: [{ id: 'cap', value: 40, quote: '40' }] },
    );
  });

  it('keeps the problem where the name is nothing, two things, or a moment', () => {
    expect(
      problems({ ...SUPPLIER_MAX, amount: 'column:nothing_here' }),
    ).toEqual(['No column nothing_here.']);
    // A moment is not a number whichever prefix it is given.
    expect(problems({ ...SUPPLIER_MAX, amount: 'column:cutoff' })).toEqual([
      'No column cutoff.',
    ]);
    expect(problems({ ...SUPPLIER_MAX, amount: 'moment:cutoff' })[0]).toMatch(
      /is a moment, not a number/,
    );
    // Moments are never reread as another kind.
    expect(
      problems(
        shape({
          kind: 'only_when',
          when: [{ left: 'value:cutoff', op: 'before', right: 'moment:start' }],
        }),
      )[0],
    ).toMatch(/^before puts one moment against another/);
    // case_size is a column and a constant: written as a value, it is neither.
    expect(
      problems(
        { ...WHOLE_CASES, amount: 'value:case_size' },
        { constants: [{ id: 'case_size', value: 6, quote: '6' }] },
      ),
    ).toEqual(['No earlier definition case_size to read.']);
    // Written with the right kind, a name that exists is never reread.
    expect(problems({ ...WHOLE_CASES, amount: 'column:product' })).toEqual([
      'product is not a number.',
    ]);
  });

  it('stores the canonical spelling, and names what the shape reads', () => {
    const context = contextOn(capturedRead(), {
      constants: [
        { id: 'cap', value: 40, quote: '40' },
        { id: 'unused', value: 7, quote: '7' },
      ],
      groups: [{ id: 'all', keys: ['SD-01'], quote: 'sourdough' }],
    });
    const loose = shape({
      kind: 'limit',
      field: 'proposed:order',
      at: 'most',
      amount: 'cap',
      // Cleared: a limit reads none of these.
      base: 'value:stock_available',
      only_for_group: 'null',
    });
    expect(canonicalShape(loose, context)).toEqual({
      ...shape({ kind: 'limit', at: 'most', amount: 'constant:cap' }),
      only_for_group: null,
    });
    expect(referencesOf(loose, context)).toEqual({
      constants: ['cap'],
      group: null,
    });
    expect(
      referencesOf(
        { ...loose, only_for_group: 'all', amount: 'column:case_size' },
        context,
      ),
    ).toEqual({ constants: [], group: 'all' });
    // What cannot be read is returned as it is, and names nothing.
    const broken = { ...loose, amount: 'nothing_here' };
    expect(canonicalShape(broken, context).amount).toBe('nothing_here');
    expect(referencesOf(broken, context)).toBeNull();
  });
});

// ---- Blank cells, from the data profile ------------------------------------

// A shape as a model writes it now: what a blank means is the profile's.
const fresh = (one: Shape): Shape => {
  const rest = { ...one };
  delete rest.if_blank;
  return rest;
};
// The captured read on a confirmed profile with these blank answers.
function onProfile(
  answers: Record<string, 'skip' | 'fail' | null> = {},
  more: Partial<ShapeContext> = {},
  change: (profile: DataProfile) => DataProfile = (p) => p,
): ShapeContext {
  let profile = profileOf(capturedRead(), owner.subject.data);
  for (const [column, blank] of Object.entries(answers))
    profile = setColumnBlank(profile, column, blank);
  const subject = withProfile(owner, confirmProfile(change(profile))).subject;
  return contextOn(capturedRead(), {
    subject,
    records: recordsOf(capturedRead(), subject.data),
    ...more,
  });
}
const runOn = (context: ShapeContext, one: Shape, key: string, order: number) =>
  run(
    formulaOf(one, context),
    contextFor(
      context.read,
      key,
      context.subject,
      givenOf(context, { order }),
      valuesFor(
        { definitions: earlier } as unknown as DefinitionSet,
        context.read,
        key,
        { order },
        'none',
        context.subject,
      ),
    ),
  );
const SUPPLIER = fresh(SUPPLIER_MAX);

describe('what a blank cell means, column by column', () => {
  it('skips a record where a column the profile says skip is blank', () => {
    const context = onProfile({ max_order_units: 'skip' });
    expect(formulaOf(SUPPLIER, context)).toBe(
      '!(has(record.max_order_units)) || order == 0 || (double(order) <= double(record.max_order_units))',
    );
    expect(runOn(context, SUPPLIER, 'AV-RR', 1000)).toBe(true);
    expect(runOn(context, SUPPLIER, 'SD-01', 80)).toBe(false);
    const given = givenOf({ constants: [], groups: [] }, { order: 1000 });
    expect(
      applies(
        formulaOf(SUPPLIER, context),
        contextFor(context.read, 'AV-RR', context.subject, given, {}),
        ['order'],
      ),
    ).toBe(false);
  });

  it('fails a record where a column that must be there is blank, or unanswered', () => {
    for (const blank of ['fail', null] as const) {
      const context = onProfile({ max_order_units: blank });
      expect(formulaOf(SUPPLIER, context)).toBe(
        'order == 0 || (has(record.max_order_units) && (double(order) <= double(record.max_order_units)))',
      );
      expect(runOn(context, SUPPLIER, 'AV-RR', 1000)).toBe(false);
      expect(runOn(context, SUPPLIER, 'AV-RR', 0)).toBe(true);
    }
  });

  it('fails a blank wherever there is no profile at all', () => {
    const context = contextOn(capturedRead());
    expect(formulaOf(SUPPLIER, context)).toBe(
      formulaOf(SUPPLIER, onProfile({ max_order_units: 'fail' })),
    );
  });

  it('reads one of each in one rule: skipped, required and unanswered', () => {
    const mixed = fresh(
      shape({
        kind: 'only_when',
        when: [
          { left: 'column:on_hand', op: '<', right: 'column:max_order_units' },
          {
            left: 'column:case_size',
            op: '>',
            right: 'column:category.safety_pct',
          },
        ],
      }),
    );
    const context = onProfile({
      on_hand: 'skip',
      max_order_units: 'fail',
      'category.safety_pct': 'skip',
    });
    expect(formulaOf(mixed, context)).toBe(
      '!((has(record.on_hand)) && (has(category.safety_pct))) || order == 0 || ((has(record.max_order_units)) && (has(record.case_size)) && ((double(record.on_hand) < double(record.max_order_units)) && (double(record.case_size) > double(category.safety_pct))))',
    );
  });

  it('skips a moment only where every column it is read from says skip', () => {
    const decide = { consequence: 'decide' as const };
    const COUNT = fresh(FRESH_COUNT);
    const both = onProfile(
      {
        counted_day: 'skip',
        counted_time: 'skip',
        'category.max_count_age_hours': 'fail',
      },
      decide,
    );
    expect(formulaOf(COUNT, both)).toBe(
      '!(has(record.moment__counted)) || (has(category.max_count_age_hours) && (!((0.0 - record.moment__counted) > double(category.max_count_age_hours))))',
    );
    const one = onProfile(
      { counted_day: 'skip', 'category.max_count_age_hours': 'fail' },
      decide,
    );
    expect(formulaOf(COUNT, one)).toBe(
      '((has(category.max_count_age_hours)) && (has(record.moment__counted)) && (!((0.0 - record.moment__counted) > double(category.max_count_age_hours))))',
    );
    // The start is never blank, so it is never asked for.
    expect(formulaOf(fresh(ARRIVES), onProfile())).not.toContain(
      'has(record.moment__start)',
    );
    expect(formulaOf(ARRIVES, onProfile())).toContain(
      'has(record.moment__start)',
    );
  });

  it('says each meaning once, with the columns that share it, where the read has a blank', () => {
    const two = fresh(
      shape({
        kind: 'only_when',
        when: [
          {
            left: 'column:max_order_units',
            op: '>=',
            right: 'column:category.ripe_cover_days',
          },
        ],
      }),
    );
    const sentence = (answers: Record<string, 'skip' | 'fail' | null>) =>
      sentenceOf(two, onProfile(answers));
    expect(
      sentence({ max_order_units: 'skip', 'category.ripe_cover_days': 'skip' }),
    ).toContain(
      'Where the max order units or the category ripe cover days is blank, it does not apply.',
    );
    expect(
      sentence({ max_order_units: 'skip', 'category.ripe_cover_days': null }),
    ).toContain(
      'Where the max order units is blank, it does not apply. Where the category ripe cover days is blank, it fails.',
    );
    // No blank in this read, nothing said.
    expect(sentenceOf(fresh(WHOLE_CASES), onProfile())).not.toContain('blank');
  });

  it('keeps a shape that says its own blanks as it was (guard)', () => {
    const read = capturedRead();
    expect(
      formulaOf(SUPPLIER_MAX, onProfile({ max_order_units: 'fail' })),
    ).toBe(formulaOf(SUPPLIER_MAX, contextOn(read)));
    expect(formulaOf(SUPPLIER_MAX, contextOn(read))).toBe(
      '!(has(record.max_order_units)) || order == 0 || (double(order) <= double(record.max_order_units))',
    );
  });

  it('keeps the formulas of the shaped checks kept under review (guard)', () => {
    const kept = definitionSetSchema.parse(
      JSON.parse(
        readFileSync(
          'fixtures/brunch-orders/rulebooks/v3-86c4ba5959e9/current.json',
          'utf8',
        ),
      ),
    );
    const read = capturedRead();
    let compared = 0;
    kept.definitions.forEach((d, i) => {
      for (const written of [d, ...(d.agreement?.versions ?? [])]) {
        if (!written.shape) continue;
        const context = contextOn(read, {
          consequence: d.consequence,
          constants: written.constants,
          groups: written.groups,
          earlier: kept.definitions.slice(0, i),
        });
        expect(formulaOf(written.shape, context)).toBe(written.formula);
        compared += 1;
      }
    });
    expect(compared).toBeGreaterThanOrEqual(21);
  });
});

describe('a rule in words a person approves', () => {
  it('says the read as an event, and hours from a moment to it', () => {
    const decide = { consequence: 'decide' as const };
    const context = contextOn(capturedRead(), decide);
    expect(
      sentenceOf(
        shape({
          kind: 'only_when',
          when: [{ left: 'moment:read', op: 'before', right: 'moment:cutoff' }],
        }),
        contextOn(capturedRead()),
      ),
    ).toBe(
      'The proposed order is allowed only when the data is read before the supplier’s cutoff. Proposing 0 units is always allowed.',
    );
    expect(sentenceOf(FRESH_COUNT, context)).toBe(
      'Flag it for a person when the hours from the stock count to when the data is read is more than the category max count age hours.',
    );
    // The start is the opening the process declares, whatever the read.
    const later = { ...capturedRead(), readAt: '2026-10-27T08:00:00Z' };
    expect(
      sentenceOf(
        ARRIVES,
        contextOn(later, { records: recordsOf(later, owner.subject.data) }),
      ),
    ).toContain('the delivery is before the start (Sat 07:00)');
  });

  it('calls a column what the profile calls it', () => {
    const context = onProfile({ max_order_units: 'skip' }, {}, (p) =>
      setColumnLabel(p, 'max_order_units', 'supplier’s most per order'),
    );
    expect(sentenceOf(SUPPLIER, context)).toBe(
      'The proposed order must be at most the supplier’s most per order. Proposing 0 units is always allowed. Where the supplier’s most per order is blank, it does not apply.',
    );
  });
});

describe('blanks nobody has said the meaning of', () => {
  it('are the columns a rule reads with a blank seen and no answer', () => {
    expect(unansweredBlanks(SUPPLIER, onProfile())).toEqual([
      { column: 'max_order_units', label: 'max order units' },
    ]);
    expect(
      unansweredBlanks(SUPPLIER, onProfile({ max_order_units: 'fail' })),
    ).toEqual([]);
    expect(unansweredBlanks(fresh(WHOLE_CASES), onProfile())).toEqual([]);
  });

  it('are none on a shape that says its own, or without a profile', () => {
    expect(unansweredBlanks(SUPPLIER_MAX, onProfile())).toEqual([]);
    expect(unansweredBlanks(SUPPLIER, contextOn(capturedRead()))).toEqual([]);
  });
});
