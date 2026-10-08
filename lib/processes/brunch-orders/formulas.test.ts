import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { SheetRead } from '@/lib/sheets/composio';

import {
  contextFor,
  describe as describeVariables,
  parseError,
  run,
} from './formulas';
import { DATA_TABS } from './process';
import type { KeptRead } from './reads';

// The captured read of the cleaned sheet, as a run keeps it.
const snapshot = JSON.parse(
  readFileSync('fixtures/brunch-orders/sheet-snapshot.json', 'utf8'),
) as SheetRead;
const read: KeptRead = {
  id: 'test',
  readAt: snapshot.readAt,
  source: 'captured',
  spreadsheet: { title: null, url: '' },
  tabs: DATA_TABS.map((name) => ({
    name,
    values: (snapshot.valueRanges.find((vr) => vr.range.startsWith(name))
      ?.values ?? []) as unknown[][],
  })),
};

describe('what a Brunch orders formula reads', () => {
  it('joins a product across the data tabs, with its category', () => {
    const ctx = contextFor(read, 'SD-01', 72, {});
    expect(ctx.product).toMatchObject({
      sku: 'SD-01',
      case_size: 8n,
      weekend_1: 28n,
      max_order_units: 72n,
      delivery_day: 'Sat',
    });
    expect(ctx.category).toMatchObject({ category: 'bakery', safety_pct: 10n });
    expect(run('order % product.case_size == 0', ctx)).toBe(true);
  });

  it('leaves a blank cell out, so has() says whether it was filled in', () => {
    // Only the bakery has a supplier maximum.
    const check =
      '!has(product.max_order_units) || order <= product.max_order_units';
    expect(run(check, contextFor(read, 'AV-RR', 500, {}))).toBe(true);
    expect(run(check, contextFor(read, 'SD-01', 80, {}))).toBe(false);
  });

  it('keeps whole numbers exact, rounding up with whole-number arithmetic', () => {
    // Sourdough: (28 + 31 + 30 + 31) / 4 = 30, plus 10% is 33, plus 40 kits.
    const expected =
      '((product.weekend_1 + product.weekend_2 + product.weekend_3 + product.weekend_4) * 110 + 399) / 400 + 40';
    expect(run(expected, contextFor(read, 'SD-01', 0, {}))).toBe(73n);
    // A value worked out earlier is read as values.<id>.
    expect(
      run(
        'values.expected_sales * (100 + category.safety_pct) + 99',
        contextFor(read, 'SD-01', 0, { expected_sales: 73n }),
      ),
    ).toBe(8129n);
  });

  it('says why a formula does not parse, and what it can read', () => {
    expect(parseError('order %')).toMatch(/./);
    expect(parseError('order > 0')).toBeNull();
    expect(describeVariables(read)).toContain('product: the product');
  });
});
