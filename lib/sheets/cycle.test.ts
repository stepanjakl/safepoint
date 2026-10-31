import { describe, expect, it } from 'vitest';

import {
  deadlineBefore,
  firstAfter,
  hoursBetween,
  inWeek,
  latestAtOrBefore,
  mondayOf,
  zonedInstant,
} from './cycle';

const TZ = 'Europe/London';

describe('calendar primitives', () => {
  it('keeps wall-clock times across the October change and measures real hours', () => {
    // Clocks go back at 02:00 BST on Sunday 25 October 2026.
    const saturday = zonedInstant(
      { year: 2026, month: 10, day: 24 },
      7 * 60,
      TZ,
    );
    const sunday = zonedInstant({ year: 2026, month: 10, day: 25 }, 7 * 60, TZ);
    expect(new Date(saturday).toISOString()).toBe('2026-10-24T06:00:00.000Z');
    expect(new Date(sunday).toISOString()).toBe('2026-10-25T07:00:00.000Z');
    expect(hoursBetween(saturday, sunday)).toBe(25);
  });

  it('keeps wall-clock times across the March change', () => {
    // Clocks go forward at 01:00 GMT on Sunday 28 March 2027.
    const saturday = zonedInstant(
      { year: 2027, month: 3, day: 27 },
      7 * 60,
      TZ,
    );
    const sunday = zonedInstant({ year: 2027, month: 3, day: 28 }, 7 * 60, TZ);
    expect(new Date(sunday).toISOString()).toBe('2027-03-28T06:00:00.000Z');
    expect(hoursBetween(saturday, sunday)).toBe(23);
  });

  it('pins what happens inside the missing and repeated hours', () => {
    // 01:30 does not exist on 28 March: it lands an hour later, 02:30 BST.
    expect(
      new Date(
        zonedInstant({ year: 2027, month: 3, day: 28 }, 90, TZ),
      ).toISOString(),
    ).toBe('2027-03-28T01:30:00.000Z');
    // 01:30 happens twice on 25 October: it lands on the second, 01:30 GMT.
    expect(
      new Date(
        zonedInstant({ year: 2026, month: 10, day: 25 }, 90, TZ),
      ).toISOString(),
    ).toBe('2026-10-25T01:30:00.000Z');
  });

  it('resolves an observation to its latest occurrence, a week back if needed', () => {
    const runAt = zonedInstant({ year: 2026, month: 10, day: 15 }, 7 * 60, TZ);
    expect(
      new Date(
        latestAtOrBefore({ day: 'Thu', minutes: 450 }, runAt, TZ),
      ).toISOString(),
    ).toBe('2026-10-08T06:30:00.000Z');
    expect(
      new Date(
        latestAtOrBefore({ day: 'Tue', minutes: 1080 }, runAt, TZ),
      ).toISOString(),
    ).toBe('2026-10-13T17:00:00.000Z');
  });

  it('places a weekday inside the week that starts on a Monday', () => {
    const monday = mondayOf(
      zonedInstant({ year: 2026, month: 10, day: 17 }, 600, TZ),
      TZ,
    );
    expect(monday).toEqual({ year: 2026, month: 10, day: 12 });
    expect(
      new Date(inWeek(monday, { day: 'Fri', minutes: 1080 }, TZ)).toISOString(),
    ).toBe('2026-10-16T17:00:00.000Z');
  });
});

describe('a deadline for the week being planned', () => {
  const OPENS = { day: 'Sat', minutes: 7 * 60 } as const;
  const NOON_THU = { day: 'Thu', minutes: 12 * 60 } as const;
  const at = (iso: string) => Date.parse(iso);
  const deadline = (iso: string) =>
    new Date(deadlineBefore(NOON_THU, OPENS, at(iso), TZ)).toISOString();

  it('is still ahead on the morning it falls', () => {
    expect(deadline('2026-10-29T08:45:00Z')).toBe('2026-10-29T12:00:00.000Z');
  });

  it('stays missed from then until the weekend opens', () => {
    expect(deadline('2026-10-30T19:52:00Z')).toBe('2026-10-29T12:00:00.000Z');
  });

  it('moves to the next week once the weekend has opened', () => {
    expect(deadline('2026-10-31T10:00:00Z')).toBe('2026-11-05T12:00:00.000Z');
  });

  it('takes the next opening when the run falls exactly on one', () => {
    expect(
      new Date(firstAfter(OPENS, at('2026-10-31T07:00:00Z'), TZ)).toISOString(),
    ).toBe('2026-11-07T07:00:00.000Z');
  });
});
