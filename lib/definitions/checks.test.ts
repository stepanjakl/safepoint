import { describe, expect, it } from 'vitest';

import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  SUBJECT,
} from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import {
  problemsOf,
  readingProblems,
  review,
  settingOf,
  states,
  strayNumbers,
  type Against,
  type Draft,
} from './checks';
import { definition, example } from './set.fixture';
import { worksOutItself, type Definition, type DefinitionSet } from './types';

// What the app holds a written definition to before running it
// (docs/processes/brunch-orders/PLAN.md, phase 2b): numbers and records the
// instructions name are declared with their words, never written in.

const instructions =
  'Products on offer sell about 40% more. Eggs, cherry tomatoes and rocket are on offer. Round up to whole units.';
const names = {
  'EG-06': 'Free-range eggs, medium, 6',
  'CT-250': 'Cherry tomatoes 250g',
  'RK-60': 'Wild rocket 60g',
  'SD-01': 'Sourdough loaf 800g',
};
const against: Against = {
  text: instructions,
  subject: SUBJECT,
  keys: Object.keys(names),
  names,
  earlier: [],
  lookupKeys: [],
};
const problems = (
  written: Partial<Parameters<typeof problemsOf>[0]>,
  more: Partial<Against> = {},
) =>
  problemsOf(
    {
      formula: 'true',
      constants: [],
      groups: [],
      examples: [],
      ...written,
    },
    { ...against, ...more },
  );

describe('a written definition', () => {
  it('passes with its numbers and records declared in the instructions’ words', () => {
    expect(
      problems({
        formula:
          'ceil(double(record.weekend_1) * (1.0 + double(constants.uplift) / 100.0)) + (key in groups.on_offer ? 1 : 0)',
        constants: [{ id: 'uplift', value: 40, quote: 'about 40% more' }],
        groups: [
          {
            id: 'on_offer',
            keys: ['EG-06', 'CT-250', 'RK-60'],
            // Quote marks, case and spacing aside.
            quote: '“eggs,  cherry tomatoes and rocket”',
          },
        ],
        examples: [{ key: 'EG-06' }, { key: 'SD-01' }],
      }),
    ).toEqual([]);
  });

  it('refuses a number written into the formula', () => {
    expect(strayNumbers('order * 1.4 > values.x')).toEqual([1.4]);
    // Field names, strings, 0, 1 and 100 are not numbers in this sense.
    expect(
      strayNumbers('record.weekend_4 + groups["Sat 7"] * 100 - 1 + 0'),
    ).toEqual([]);
    expect(problems({ formula: 'order <= 40' })[0]).toMatch(/writes 40/);
  });

  it('refuses words that are not in the instructions, and unknown keys', () => {
    const found = problems({
      formula: 'key in groups.kit',
      constants: [{ id: 'kits', value: 40, quote: 'we expect 40 kits' }],
      groups: [{ id: 'kit', keys: ['SD-01', 'XX-1'], quote: 'the kit' }],
      examples: [{ key: 'ZZ-9' }],
    });
    expect(found.join(' ')).toMatch(/constant kits.*not in the instructions/);
    expect(found.join(' ')).toMatch(/group kit.*not in the instructions/);
    expect(found.join(' ')).toMatch(/names XX-1/);
    expect(found.join(' ')).toMatch(/No product ZZ-9/);
  });

  it('refuses a key or category written into the formula', () => {
    const found = problems(
      {
        formula:
          'key == "SD-01" || record.category == \'bakery\' || record.supplier == "Local bakery"',
      },
      { lookupKeys: ['bakery', 'produce'] },
    );
    // Other text is data the formula compares, not a record.
    expect(found).toEqual([
      expect.stringMatching(/names "SD-01", "bakery" itself/),
    ]);
  });

  it('refuses a constant, group or definition it reads but never has', () => {
    const found = problems(
      { formula: 'constants.a + values.later > 0 && key in groups.b' },
      { earlier: ['earlier'] },
    );
    expect(found.join(' ')).toMatch(/reads a, b, never declared/);
    expect(found.join(' ')).toMatch(/values\.later/);
  });

  it('refuses a constant whose words do not state its number', () => {
    expect(
      problems({
        constants: [
          // Somewhere in the instructions, but saying nothing of 1440.
          { id: 'minutes_per_day', value: 1440, quote: 'Round up' },
        ],
      }),
    ).toEqual([
      'Constant minutes_per_day is 1440, but its words "Round up" do not state that number; quote the words of the instructions that give it.',
    ]);
  });

  it('refuses a group holding a record its words do not name', () => {
    const found = problems({
      formula: 'key in groups.on_offer',
      groups: [
        {
          id: 'on_offer',
          keys: ['EG-06', 'SD-01'],
          quote: 'Eggs, cherry tomatoes and rocket are on offer',
        },
      ],
      examples: [{ key: 'EG-06' }, { key: 'RK-60' }],
    });
    expect(found).toEqual([
      expect.stringMatching(/do not name SD-01 \(Sourdough loaf 800g\)/),
    ]);
  });

  it('refuses examples that never try a group from both sides', () => {
    const found = problems({
      formula: 'key in groups.on_offer',
      groups: [
        {
          id: 'on_offer',
          keys: ['EG-06', 'CT-250', 'RK-60'],
          quote: 'Eggs, cherry tomatoes and rocket are on offer',
        },
      ],
      examples: [{ key: 'EG-06' }, { key: 'CT-250' }],
    });
    expect(found).toEqual([
      'No example tries a product outside group on_offer; add one, so the formula is tried both ways.',
    ]);
  });
});

describe('words that state a number', () => {
  it('read numbers, percentages, times, days and small numbers in words', () => {
    expect(states('about 40% more', 40)).toBe(true);
    expect(states('about 40% more', 1.4)).toBe(true);
    expect(states('Saturday from 07:00', 420)).toBe(true);
    expect(states('Saturday from 07:00', 6)).toBe(true);
    expect(states('the last four weekends', 4)).toBe(true);
    expect(states('about 40 kits', 40)).toBe(true);
  });

  it('do not read a number into words that do not say it', () => {
    expect(states("Saturday's opening", 420)).toBe(false);
    expect(states('Saturday', 1440)).toBe(false);
    expect(states('safety margin', 100)).toBe(false);
    // 07:00 is a time, not a 7.
    expect(states('from 07:00', 7)).toBe(false);
  });
});

describe('what a formula has to read', () => {
  const reading = (
    formula: string,
    more: Partial<Pick<Definition, 'constants' | 'groups'>> = {},
    result: Definition['result'] = 'check',
  ) =>
    readingProblems(
      { formula, constants: [], groups: [], ...more },
      SUBJECT,
      result,
    );
  const constant = (id: string) => ({ id, value: 4, quote: 'four' });

  it('refuses a formula that reads nothing from the data', () => {
    expect(reading('false')[0]).toContain('reads nothing from the data');
    expect(reading('true')[0]).toContain('reads nothing from the data');
    expect(
      reading('constants.four > 3', { constants: [constant('four')] })[0],
    ).toContain('reads nothing from the data');
  });

  it('allows a number that is only a constant from the instructions', () => {
    expect(
      reading('constants.four', { constants: [constant('four')] }, 'number'),
    ).toEqual([]);
    expect(reading('4', {}, 'number')[0]).toContain('reads nothing');
  });

  it('does not take a word in quotes, or a field of that name, for reading', () => {
    expect(reading('"order" == "record"')[0]).toContain('reads nothing');
    expect(reading('order == 0')).toEqual([]);
    expect(reading('key == "x"')).toEqual([]);
    expect(reading('category.safety_pct > 0')).toEqual([]);
    expect(reading('values.expected > 0')).toEqual([]);
  });

  it('refuses constants and groups the formula never reads', () => {
    expect(
      reading('order == 0', {
        constants: [constant('four')],
        groups: [{ id: 'kit', keys: [], quote: '' }],
      }),
    ).toEqual([expect.stringContaining('never reads four, kit')]);
  });
});

describe('a check’s examples', () => {
  const read = capturedRead();
  const TEXT = 'The rule.';
  const checked = (
    formula: string,
    examples: Pick<Draft['examples'][number], 'key' | 'inputs' | 'expect'>[],
  ) => {
    const item = definition('the_rule', {
      result: 'check',
      consequence: 'block',
    });
    const set: DefinitionSet = {
      hash: 'h',
      version: 'v1',
      intent: '',
      intentConfirmedAt: null,
      readId: read.id,
      foundAt: '',
      model: 'test',
      definitions: [item],
    };
    return review(settingOf(owner, TEXT, set, read, item), {
      formula,
      constants: [],
      groups: [],
      examples: examples.map((e) => ({ ...e, why: 'By hand.' })),
    });
  };
  const holds = { key: 'SD-01', inputs: { order: 8 }, expect: true };
  const fails = { key: 'SD-01', inputs: { order: 5 }, expect: false };
  const WHOLE_CASES = 'order % record.case_size == 0';

  it('passes when they show it holding and failing', () => {
    expect(checked(WHOLE_CASES, [holds, fails]).problems).toEqual([]);
  });

  it('asks for the outcome they leave out, with one that would show it', () => {
    const noFail = checked(WHOLE_CASES, [holds]);
    expect(noFail.problems).toEqual([
      expect.stringMatching(/^No example where it fails\. Add one, such as /),
    ]);
    expect(noFail.ran?.problem).toContain('No example where it fails');
    expect(checked(WHOLE_CASES, [fails]).problems).toEqual([
      expect.stringMatching(/^No example where it holds/),
    ]);
  });

  it('does not ask for a failure this read cannot give', () => {
    // Whatever is ordered: no delivery day in the data reaches 100.
    expect(
      checked('order == 0 || record.delivery_day < 100', [holds]).problems,
    ).toEqual([]);
  });

  it('refuses a check nothing can meet', () => {
    expect(checked('order < 0', [fails]).problems[0]).toContain(
      'could never be met',
    );
  });

  it('refuses what a draft wrote for a rule: false, expected false twice', () => {
    expect(
      checked('false', [
        { key: 'CF-40', inputs: { order: 0 }, expect: false },
        { key: 'SS-125', inputs: { order: 0 }, expect: false },
      ]).problems[0],
    ).toContain('reads nothing from the data');
  });

  it('only asks once the examples agree', () => {
    const wrong = { key: 'SD-01', inputs: { order: 8 }, expect: false };
    const { problems } = checked(WHOLE_CASES, [wrong]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('you worked out false');
  });
});

describe('a check that works a quantity out itself', () => {
  const quoted = (id: string, quote: string) => ({ id, value: 4, quote });
  const check = (
    text: string,
    formula: string,
    constants: Definition['constants'],
  ) =>
    worksOutItself(
      definition('the_rule', {
        result: 'check',
        text,
        formula,
        constants,
        examples: [example(true, true)],
      }),
    );

  it('is told by reading numbers its own words do not state', () => {
    expect(
      check(
        'No more than we expect to sell.',
        'constants.a + constants.b > order',
        [quoted('a', 'the last four weekends'), quoted('b', 'about 40 kits')],
      ),
    ).toBe(true);
  });

  it('is not one reading a number or two its words state, or one from elsewhere', () => {
    expect(
      check('Order 4 or 5.', 'constants.a + constants.b > order', [
        quoted('a', '4'),
        quoted('b', '5'),
      ]),
    ).toBe(false);
    expect(
      check('Before Saturday’s opening.', 'constants.a > constants.b', [
        quoted('a', 'Saturday'),
        quoted('b', '07:00'),
      ]),
    ).toBe(false);
  });

  it('is not one holding constants it does not read', () => {
    expect(
      check('The rule.', 'order > 0', [quoted('a', 'x'), quoted('b', 'y')]),
    ).toBe(false);
  });
});
