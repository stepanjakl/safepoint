import { describe, expect, it } from 'vitest';

import { runChecks } from './checks';
import { sheetForModel } from './draft';
import { evaluate, type Snapshot } from './engine';
import { rulebook, snapshot } from './library.fixture';
import type { Rulebook } from './schema';
import { validateDataModel, validateLogic } from './validate';

/*
  The library again, with data of every other kind: a decimal, a percentage, a
  date, a date-time and euros. Nothing in the engine may assume a currency,
  whole numbers or a weekly timetable.
*/
const books = snapshot.valueRanges.find((r) => r.range.startsWith('Books!'))!;
const wider: Snapshot = {
  tabs: [...snapshot.tabs.filter((t) => t !== 'Checks'), 'Expected'],
  valueRanges: [
    ...snapshot.valueRanges.filter(
      (r) => r !== books && !r.range.includes('Checks'),
    ),
    {
      range: 'Books!A1:H3',
      values: [
        [
          ...books.values![0]!,
          'weight_kg',
          'discount',
          'published',
          'returned_at',
        ],
        [...books.values![1]!, 0.45, 0.1, 46310, 46310.75],
        [...books.values![2]!, 1.2, '25%', '2026-07-01', ''],
      ],
    },
    {
      // Named freely: the checks tab is found by its headers.
      range: 'Expected!A1:F3',
      values: [
        ['check_id', 'run_at', 'item', 'set', 'expect', 'because'],
        ['E1', '2026-10-16 10:00', 'B2', 'fee=3.00', 'needs_decision', 'F1'],
        ['E2', 46311.4166666667, 'B1', 'fee=1.50', 'ready', ''],
      ],
    },
  ],
};

const column = (
  header: string,
  type: Rulebook['tables'][number]['columns'][number]['type'],
  required: boolean,
) => ({ header, name: header, type, allowed: null, required, meaning: header });

const euros: Rulebook = {
  ...rulebook,
  currency: { code: 'EUR', minor_units: 2 },
  tables: rulebook.tables.map((t) =>
    t.name === 'books'
      ? {
          ...t,
          columns: [
            ...t.columns,
            column('weight_kg', 'decimal', true),
            column('discount', 'percent', true),
            column('published', 'date', true),
            column('returned_at', 'datetime', false),
          ],
        }
      : t,
  ),
  facts: [
    ...rulebook.facts,
    {
      kind: 'book',
      name: 'heavy',
      label: 'Heavy',
      type: 'bool',
      expr: 'row.weight_kg > 1.0',
      explain: 'Over a kilo',
    },
    {
      kind: 'book',
      name: 'new_title',
      label: 'New',
      type: 'bool',
      expr: 'run_at - row.published < duration("2160h")',
      explain: 'Published in the last 90 days',
    },
    {
      kind: 'book',
      name: 'deep_discount',
      label: 'Deep discount',
      type: 'bool',
      expr: 'row.discount >= 0.25',
      explain: 'A quarter off or more',
    },
  ],
};

describe('any kind of data', () => {
  it('binds decimals, percentages, dates and euros, and formulas read them typed', () => {
    expect(validateDataModel(euros, euros, wider)).toEqual([]);
    expect(validateLogic(euros, euros, euros, wider)).toEqual([]);
    const runAt = Date.parse('2026-10-16T09:00:00Z');
    const facts = (key: string) =>
      Object.fromEntries(
        evaluate(euros, wider, runAt)
          .items.find((i) => i.key === key)!
          .facts.map((f) => [f.name, f.value]),
      );
    expect(facts('B1')).toMatchObject({
      heavy: 'false',
      new_title: 'true',
      deep_discount: 'false',
    });
    expect(facts('B2')).toMatchObject({
      heavy: 'true',
      new_title: 'false',
      deep_discount: 'true',
    });
  });

  it('asks for a currency when there is money, and the right type of default', () => {
    expect(
      validateDataModel(euros, { ...euros, currency: null }, wider),
    ).toContainEqual(expect.objectContaining({ where: 'currency' }));
    const issues = validateLogic(
      euros,
      euros,
      {
        ...euros,
        editable: [
          {
            ...euros.editable[0]!,
            name: 'discount',
            type: 'percent',
            default: '1',
          },
        ],
      },
      wider,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ where: 'editable.discount.default' }),
    );
  });

  it('catches percentage points bound as a percentage', () => {
    const points = {
      ...euros,
      tables: euros.tables.map((t) =>
        t.name === 'books'
          ? {
              ...t,
              columns: t.columns.map((c) =>
                c.name === 'copies' ? { ...c, type: 'percent' as const } : c,
              ),
            }
          : t,
      ),
    };
    expect(validateDataModel(points, points, wider)).toContainEqual({
      where: 'tables.books.copies',
      message: expect.stringMatching(/percentage points: use whole_number/),
    });
  });

  it('finds the checks tab by its headers and runs exact run times', () => {
    const report = runChecks(euros, wider, { year: 2026, month: 10, day: 12 });
    expect(report.tab).toBe('Expected');
    expect(
      report.results.map((r) => [r.id, r.actual, r.passed, r.problem]),
    ).toEqual([
      ['E1', 'needs_decision', true, null],
      ['E2', 'ready', true, null],
    ]);
  });

  it('shows the model a long tab as its first rows and a profile of every row', () => {
    const rows = [
      ['sku', 'price', 'note'],
      ...Array.from({ length: 300 }, (_, i) => [
        `S${i}`,
        i % 2 ? 1.5 : 2,
        ...(i === 299 ? [] : ['x']),
      ]),
    ];
    const long: Snapshot = {
      tabs: ['Long'],
      valueRanges: [{ range: 'Long!A1:C301', values: rows }],
    };
    const [tab] = sheetForModel(long) as unknown as [
      { rows: unknown[]; rows_not_shown: number; column_profiles: unknown[] },
    ];
    expect(tab.rows).toHaveLength(41);
    expect(tab.rows_not_shown).toBe(260);
    expect(tab.column_profiles).toEqual([
      expect.objectContaining({
        header: 'sku',
        filled: 300,
        distinct_texts: 300,
      }),
      expect.objectContaining({
        header: 'price',
        whole_numbers_only: false,
        min: 1.5,
        max: 2,
      }),
      expect.objectContaining({ header: 'note', filled: 299, blank: 1 }),
    ]);
  });
});
