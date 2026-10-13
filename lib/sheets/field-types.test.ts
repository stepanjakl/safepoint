import { describe, expect, it } from 'vitest';

import { interpretCell } from './field-types';

describe('interpretCell', () => {
  it('reads money in the rulebook currency as whole minor units', () => {
    const gbp = {
      kind: 'money',
      currency: { code: 'GBP', minor_units: 2 },
    } as const;
    const money = interpretCell(2.8, gbp, true);
    expect(money).toMatchObject({ value: 280, display: '£2.80' });
    expect(money.how).toContain('280 minor units');
    expect(interpretCell(2.805, gbp, true).issue).toMatch(
      /whole number of GBP/,
    );
    expect(
      interpretCell(
        1250,
        { kind: 'money', currency: { code: 'JPY', minor_units: 0 } },
        true,
      ),
    ).toMatchObject({ value: 1250, display: '¥1,250' });
    expect(
      interpretCell(
        9.99,
        { kind: 'money', currency: { code: 'EUR', minor_units: 2 } },
        true,
      ),
    ).toMatchObject({ value: 999, display: '€9.99' });
  });

  it('reads decimals, and percentages from a percentage cell or text', () => {
    expect(interpretCell(1.75, { kind: 'decimal' }, true)).toMatchObject({
      value: 1.75,
    });
    expect(interpretCell(0.125, { kind: 'percent' }, true)).toMatchObject({
      value: 0.125,
      display: '12.5%',
    });
    expect(interpretCell('25%', { kind: 'percent' }, true)).toMatchObject({
      value: 0.25,
    });
    expect(
      interpretCell('a lot', { kind: 'percent' }, true).issue,
    ).toBeDefined();
  });

  it('reads dates and date-times in the time zone, across a clock change', () => {
    const london = { kind: 'date', timeZone: 'Europe/London' } as const;
    // 15 Oct 2026 is summer time: midnight in London is 23:00 UTC the day before.
    expect(interpretCell(46310, london, true)).toMatchObject({
      value: Date.parse('2026-10-14T23:00:00Z'),
      display: '2026-10-15',
    });
    expect(interpretCell('2026-10-15', london, true).value).toBe(
      Date.parse('2026-10-14T23:00:00Z'),
    );
    expect(interpretCell(46310.5, london, true).issue).toMatch(
      /without a time/,
    );
    const at = { kind: 'datetime', timeZone: 'Europe/London' } as const;
    // 29 Mar 2026, 08:45: the morning the clocks went forward.
    expect(interpretCell(46110 + 0.3645833333333333, at, true)).toMatchObject({
      value: Date.parse('2026-03-29T07:45:00Z'),
      display: '2026-03-29 08:45',
    });
    expect(interpretCell('2026-07-01 12:00', at, true).value).toBe(
      Date.parse('2026-07-01T11:00:00Z'),
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

  it('reads yes or no, and a checkbox, as true or false', () => {
    const yesNo = { kind: 'yes_no' } as const;
    expect(interpretCell('Yes', yesNo, true).value).toBe(true);
    expect(interpretCell('no', yesNo, true).value).toBe(false);
    expect(interpretCell('TRUE', yesNo, true).value).toBe(true);
    // A ticked checkbox in Sheets reads as a boolean, not as text.
    expect(interpretCell(true, yesNo, true)).toMatchObject({
      value: true,
      display: 'yes',
    });
    expect(interpretCell(false, yesNo, true).value).toBe(false);
    expect(interpretCell('maybe', yesNo, true).issue).toBeDefined();
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
