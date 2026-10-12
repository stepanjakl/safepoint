import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import {
  calculate,
  crossCheck,
  fingerprintOf,
  keepCrossCheck,
  keptCrossCheck,
} from './calculate';
import { capturedRead } from './captured.fixture';
import { always, answer, told } from './models.fixture';
import { inScratchDirectory } from './scratch.fixture';
import { definition, TEXT } from './set.fixture';
import type { DefinitionSet } from './types';

// The two calculations as accepted for the Brunch orders instructions, so the
// test does not follow whatever set a later draft keeps.
const ACCEPTED = '2026-10-09T12:00:00.000Z';
const expectedSales = definition('expected_sales', {
  formula:
    'ceil((double(record.weekend_1 + record.weekend_2 + record.weekend_3 + record.weekend_4) / double(constants.four_weekends)) * (1.0 + double(key in groups.on_offer ? constants.offer_boost_pct : (key in groups.kit_ingredients ? constants.kit_ingredient_boost_pct : constants.other_boost_pct)) / 100.0) + double(key in groups.kit_ingredients ? constants.kit_extra_units : 0))',
  constants: [
    { id: 'four_weekends', value: 4, quote: 'four weekends' },
    { id: 'offer_boost_pct', value: 40, quote: '40% more' },
    { id: 'kit_ingredient_boost_pct', value: 10, quote: '10% more' },
    { id: 'other_boost_pct', value: 15, quote: '15% more' },
    { id: 'kit_extra_units', value: 40, quote: '40 kits' },
  ],
  groups: [
    { id: 'on_offer', keys: ['EG-06', 'CT-250', 'RK-60'], quote: 'on offer' },
    {
      id: 'kit_ingredients',
      keys: ['SD-01', 'AV-RR', 'FT-200'],
      quote: 'the kit',
    },
  ],
  approvedAt: ACCEPTED,
});
const targetStock = definition('target_stock_level', {
  formula:
    'double(values.expected_sales) * (1.0 + double(category.safety_pct) / 100.0)',
  uses: ['expected_sales'],
  approvedAt: ACCEPTED,
});
const wholeCases = definition('order_in_whole_cases', {
  result: 'check',
  consequence: 'block',
  formula: 'order % record.case_size == 0',
  approvedAt: ACCEPTED,
});

const setOf = (definitions = [expectedSales, targetStock, wholeCases]) =>
  ({
    hash: 'test',
    version: 'v1',
    intent: 'Order enough.',
    intentConfirmedAt: ACCEPTED,
    readId: 'test',
    foundAt: ACCEPTED,
    model: 'test',
    definitions,
  }) satisfies DefinitionSet;

// Worked out by hand from the captured sheet: the four weekends' average,
// 40% more on offer, 10% more and 40 kits for the kit's ingredients, 15% more
// otherwise, rounded up; then the category's safety margin on top.
const BY_HAND: Record<string, [number, number]> = {
  'SD-01': [73, 80.3],
  'AV-RR': [65, 71.5],
  'AV-LS': [21, 23.1],
  'EG-06': [28, 30.8],
  'FT-200': [54, 59.4],
  'LM-04': [12, 13.2],
  'CT-250': [23, 25.3],
  'RK-60': [13, 14.3],
  'CF-40': [4, 4.2],
  'SS-125': [3, 3.15],
  'OO-500': [5, 5.25],
};

const read = capturedRead();

describe('calculating', () => {
  it('works out every accepted calculation for every record, as by hand', () => {
    const { rows, calculations, accepted } = calculate(owner, setOf(), read);
    expect(calculations.map((c) => c.id)).toEqual([
      'expected_sales',
      'target_stock_level',
    ]);
    expect(accepted).toBe(3);
    expect(
      Object.fromEntries(
        rows.map((row) => [
          row.key,
          [
            row.values.expected_sales!.value,
            row.values.target_stock_level!.value,
          ],
        ]),
      ),
    ).toEqual(BY_HAND);
  });

  it('shows the working of each value', () => {
    const sd = calculate(owner, setOf(), read).rows.find(
      (r) => r.key === 'SD-01',
    )!;
    expect(sd.name).toBe('Sourdough loaf 800g');
    expect(sd.values.target_stock_level!.steps).toEqual([
      '73 * (1.0 + (10 / 100.0))',
    ]);
  });

  it('refuses while a calculation is not accepted', () => {
    expect(() =>
      calculate(
        owner,
        setOf([expectedSales, { ...targetStock, approvedAt: null }]),
        read,
      ),
    ).toThrow(/Not every calculation is accepted: target stock level/);
  });

  it('names the rulebook it ran on, which any accepted change moves', () => {
    const before = fingerprintOf(setOf());
    expect(fingerprintOf(setOf())).toBe(before);
    expect(
      fingerprintOf(
        setOf([
          expectedSales,
          { ...targetStock, formula: 'double(values.expected_sales)' },
          wholeCases,
        ]),
      ),
    ).not.toBe(before);
    // What is not accepted is not part of it.
    expect(
      fingerprintOf(
        setOf([
          expectedSales,
          targetStock,
          wholeCases,
          definition('draft_only', { formula: '1' }),
        ]),
      ),
    ).toBe(before);
  });
});

describe('the model cross-checking', () => {
  inScratchDirectory();
  // One entry per record, every value under its id.
  const everyRecord = (change: (key: string, id: string) => number | null) =>
    Object.entries(BY_HAND).map(([key, [sales, target]]) => ({
      key,
      values: {
        expected_sales: {
          value: change(key, 'expected_sales') ?? sales,
          working: 'By hand.',
        },
        target_stock_level: {
          value: change(key, 'target_stock_level') ?? target,
          working: 'By hand.',
        },
      },
    }));

  it('compares every value and keeps what it found', async () => {
    const model = always(
      answer({
        records: everyRecord((key, id) =>
          key === 'AV-RR' && id === 'expected_sales' ? 64.2 : null,
        ),
      }),
    );
    const check = await crossCheck(owner, setOf(), read, 'test', TEXT, {
      resolve: () => model,
    });
    expect(check).toMatchObject({ agreed: 21, total: 22 });
    expect(check.cells['AV-RR']!.expected_sales).toEqual({
      model: 64.2,
      working: 'By hand.',
      agrees: false,
    });
    // The model works from the plain words and how the declared tabs fit
    // together, never the formulas.
    expect(told(model)).toContain('Order enough');
    expect(told(model)).toContain('matched by the sku column');
    expect(told(model)).not.toContain('ceil(');
    await keepCrossCheck(owner, check);
    expect(await keptCrossCheck(owner, 'test', check.fingerprint)).toEqual(
      check,
    );
    expect(await keptCrossCheck(owner, 'test', 'other')).toBeNull();
  });

  it('refuses an answer that leaves a record out or answers one twice', async () => {
    const records = everyRecord(() => null);
    const short = always(answer({ records: records.slice(1) }));
    await expect(
      crossCheck(owner, setOf(), read, 'test', TEXT, { resolve: () => short }),
    ).rejects.toThrow(/1 not answered \(SD-01\)/);
    const twice = always(answer({ records: [...records, records[0]] }));
    await expect(
      crossCheck(owner, setOf(), read, 'test', TEXT, { resolve: () => twice }),
    ).rejects.toThrow(/SD-01 is answered twice/);
  });

  it('refuses a value filed under something other than a record', async () => {
    // What went wrong on 9 October: the value's id where the key belongs.
    const swapped = always(
      answer({
        records: [
          {
            key: 'expected_sales',
            values: everyRecord(() => null)[0]!.values,
          },
        ],
      }),
    );
    await expect(
      crossCheck(owner, setOf(), read, 'test', TEXT, {
        resolve: () => swapped,
      }),
    ).rejects.toThrow();
  });
});
