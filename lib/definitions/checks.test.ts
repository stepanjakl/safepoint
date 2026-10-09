import { describe, expect, it } from 'vitest';

import { SUBJECT } from '@/lib/processes/brunch-orders/process';

import { problemsOf, states, strayNumbers, type Against } from './checks';

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
