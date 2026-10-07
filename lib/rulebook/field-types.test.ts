import { describe, expect, it } from 'vitest';

import { interpretCell } from './field-types';

describe('interpretCell', () => {
  it('turns pounds into whole pence and says how', () => {
    const money = interpretCell(2.8, { kind: 'money_gbp' }, true);
    expect(money).toMatchObject({ value: 280, display: '£2.80' });
    expect(money.how).toContain('280 pence');
    expect(interpretCell(2.805, { kind: 'money_gbp' }, true).issue).toMatch(
      /whole number of pence/,
    );
  });

  it('reads a fraction of a day as minutes after midnight', () => {
    expect(interpretCell(0.3125, { kind: 'time_of_day' }, true)).toMatchObject({
      value: 450,
      display: '07:30',
    });
    // Sheets returns 08:45 with floating-point noise.
    expect(
      interpretCell(0.3645833333333333, { kind: 'time_of_day' }, true).display,
    ).toBe('08:45');
    expect(
      interpretCell(1.2, { kind: 'time_of_day' }, true).issue,
    ).toBeDefined();
  });

  it('keeps weekdays as text and rejects anything else', () => {
    expect(interpretCell('Thu', { kind: 'weekday' }, true).value).toBe('Thu');
    expect(
      interpretCell('Thursday', { kind: 'weekday' }, true).issue,
    ).toBeDefined();
  });

  it('reports a blank required cell, and lets an optional one through', () => {
    expect(interpretCell('', { kind: 'whole_number' }, true).issue).toMatch(
      /blank/,
    );
    expect(
      interpretCell(undefined, { kind: 'whole_number' }, false),
    ).toMatchObject({ value: null });
  });
});
