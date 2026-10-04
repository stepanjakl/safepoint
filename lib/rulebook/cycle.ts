import { WEEKDAYS, type Weekday } from './field-types';

/*
  Turns "a weekday and a time of day" into real moments for one pinned run
  time. Domain-neutral; the process supplies its weekly timetable.

  Two rules, from docs/SHEET-PROCESS-PLAN.md (Run timing):
  - An observation (a count, a note) resolves to its most recent occurrence at
    or before the run time.
  - A deadline or event resolves inside a cycle: the Monday-to-Sunday week that
    contains one promotion. "This weekend" is the first cycle whose promotion
    has not ended at the run time; "next weekend" is the one after.

  Wall-clock times are resolved in the process's time zone, so 06:00 stays
  06:00 across a clock change; durations are measured between real instants.
*/

export type LocalDate = { year: number; month: number; day: number };
export type DayTime = { day: Weekday; minutes: number };

const MINUTE = 60_000;

function parts(instant: number, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    minutes: Number(values.hour) * 60 + Number(values.minute),
    weekday: values.weekday as Weekday,
  };
}

function offsetAt(instant: number, timeZone: string) {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day) + p.minutes * MINUTE;
  return asUtc - Math.floor(instant / MINUTE) * MINUTE;
}

/*
  The instant a local wall-clock time names, in two passes: the offset found
  at the first guess, then the offset at the result. A time in the hour the
  spring change skips lands an hour later; one in the hour the autumn change
  repeats lands on its second occurrence (both pinned in cycle.test.ts).
*/
export function zonedInstant(
  date: LocalDate,
  minutes: number,
  timeZone: string,
): number {
  const wall = Date.UTC(date.year, date.month - 1, date.day) + minutes * MINUTE;
  const first = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(first, timeZone);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function mondayOf(instant: number, timeZone: string): LocalDate {
  const p = parts(instant, timeZone);
  return addDays(
    { year: p.year, month: p.month, day: p.day },
    -WEEKDAYS.indexOf(p.weekday),
  );
}

// A weekday and time inside the week that starts on `monday`.
export function inWeek(
  monday: LocalDate,
  at: DayTime,
  timeZone: string,
): number {
  return zonedInstant(
    addDays(monday, WEEKDAYS.indexOf(at.day)),
    at.minutes,
    timeZone,
  );
}

export function latestAtOrBefore(
  at: DayTime,
  runAt: number,
  timeZone: string,
): number {
  const monday = mondayOf(runAt, timeZone);
  const thisWeek = inWeek(monday, at, timeZone);
  return thisWeek <= runAt
    ? thisWeek
    : inWeek(addDays(monday, -7), at, timeZone);
}

export function hoursBetween(from: number, to: number) {
  return (to - from) / 3_600_000;
}

export function describeInstant(instant: number, timeZone: string) {
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date(instant));
  return `${local} (${new Date(instant).toISOString().slice(0, 16).replace('T', ' ')} UTC)`;
}
