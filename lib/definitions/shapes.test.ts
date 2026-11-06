import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
import { givenOf, valuesFor } from './checks';
import { checkFormula, contextFor, run } from './formulas';
import { recordsOf, type KeptRead } from './records';
import { definition } from './set.fixture';
import {
  formulaOf,
  valuesInWords,
  sameShape,
  sentenceOf,
  shapeProblems,
  usesOf,
  type Shape,
  type ShapeContext,
} from './shapes';
import type { Definition, DefinitionSet } from './types';
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

  it('says the moments it compares, with when the data was read', () => {
    expect(sentenceOf(CUTOFF, contextOn(capturedRead()))).toBe(
      'The proposed order is allowed only when the cutoff is after when the data was read (Thu 17:03). Proposing 0 units is always allowed.',
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
      'the proposed order is 70; the cutoff is Thu 14:00',
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
