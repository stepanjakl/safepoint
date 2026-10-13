import { describe, expect, it } from 'vitest';

import { SUBJECT } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import {
  checkFormula,
  contextFor,
  describe as describeVariables,
  parseError,
  run,
  variablesOf,
  type Given,
} from './formulas';

// The captured read of the cleaned sheet, as a run keeps it.
const read = capturedRead();

// A proposal of `order` units, with no constants or groups unless given.
const given = (order: number, more: Partial<Given> = {}): Given => ({
  inputs: { order },
  constants: {},
  groups: {},
  ...more,
});
const at = (key: string, order: number, more?: Partial<Given>, values = {}) =>
  contextFor(read, key, SUBJECT, given(order, more), values);

describe('what a formula reads', () => {
  it('joins a record across its tabs, with the lookup it reaches', () => {
    const ctx = at('SD-01', 72);
    expect(ctx.key).toBe('SD-01');
    expect(ctx.record).toMatchObject({
      sku: 'SD-01',
      case_size: 8n,
      weekend_1: 28n,
      max_order_units: 72n,
    });
    // Declared by the process, not assumed: Parameters, through category.
    expect(ctx.category).toMatchObject({ category: 'bakery', safety_pct: 10n });
    expect(run('order % record.case_size == 0', ctx)).toBe(true);
  });

  it('reads typed columns as plain numbers: days 1 to 7, times in minutes', () => {
    // The bakery delivers on Saturday at 06:00.
    expect(at('SD-01', 0).record).toMatchObject({
      delivery_day: 6n,
      delivery_time: 360n,
    });
  });

  it('reads a yes/no column as true or false, and refuses comparing it to text', () => {
    expect(at('AV-RR', 0).record.ripe).toBe(true);
    expect(at('SD-01', 0).record.ripe).toBe(false);
    const scope = { values: {}, constants: {}, groups: [] };
    expect(
      checkFormula(read, SUBJECT, scope, 'check', 'record.ripe == "yes"'),
    ).toMatch(/no such overload/);
    expect(
      checkFormula(
        read,
        SUBJECT,
        scope,
        'check',
        '!record.ripe || order <= 10',
      ),
    ).toBeNull();
    expect(describeVariables(read, SUBJECT)).toContain(
      'Yes/no columns (ripe) are true or false',
    );
  });

  it('leaves a blank cell out, so has() says whether it was filled in', () => {
    // Only the bakery has a supplier maximum.
    const check =
      '!has(record.max_order_units) || order <= record.max_order_units';
    expect(run(check, at('AV-RR', 500))).toBe(true);
    expect(run(check, at('SD-01', 80))).toBe(false);
  });

  it('reads as the instructions do: constants, groups and rounding by name', () => {
    // Sourdough: (28 + 31 + 30 + 31) / 4 = 30, plus 10% is 33, plus 40 kits.
    const expected =
      'ceil(double(record.weekend_1 + record.weekend_2 + record.weekend_3 + record.weekend_4) / double(constants.weekends) * (1.0 + double(constants.uplift_kit) / 100.0)) + (key in groups.kit ? constants.kits : 0)';
    const kit = {
      constants: { weekends: 4, uplift_kit: 10, kits: 40 },
      groups: { kit: ['SD-01', 'AV-RR', 'FT-200'] },
    };
    expect(run(expected, at('SD-01', 0, kit))).toBe(73n);
    // Out of the group, no kits are added: eggs average 20, plus 10% is 22.
    expect(run(expected, at('EG-06', 0, kit))).toBe(22n);
    // A value worked out earlier is read as values.<id>.
    expect(
      run(
        'values.expected_sales * (100 + category.safety_pct)',
        at('SD-01', 0, {}, { expected_sales: 73n }),
      ),
    ).toBe(8030n);
  });

  it('rounds past the noise of decimal arithmetic', () => {
    // 100 * 1.1 is 110.00000000000001 in floating point: still 110.
    expect(run('ceil(100.0 * 1.1)', at('SD-01', 0))).toBe(110n);
    expect(run('floor(2.5)', at('SD-01', 0))).toBe(2n);
    expect(run('round(2.5)', at('SD-01', 0))).toBe(3n);
    // Not on whole numbers: their division has already dropped the remainder.
    expect(() => run('ceil(253 / 10)', at('SD-01', 0))).toThrow();
  });

  it('says why a formula does not parse, and what it can read', () => {
    expect(parseError('order %')).toMatch(/./);
    expect(parseError('order > 0')).toBeNull();
    const guide = describeVariables(read, SUBJECT);
    expect(guide).toContain("record: the product's row");
    expect(guide).toContain('category: the Parameters row whose category');
    expect(guide).not.toMatch(/\bsku\b:|weekdays/);
    expect(guide).toContain('order: the proposed order, in units');
  });

  it('refuses a process whose formula names clash', () => {
    const clashing = {
      ...SUBJECT,
      proposal: [{ id: 'record', label: 'record', unit: 'units' }],
    };
    expect(() => variablesOf(clashing)).toThrow(
      'A formula name is used twice: record.',
    );
    expect(variablesOf(SUBJECT)).toEqual([
      'key',
      'record',
      'category',
      'order',
      'values',
      'constants',
      'groups',
    ]);
  });
});
