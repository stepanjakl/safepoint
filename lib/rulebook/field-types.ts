import { WEEKDAYS, zonedInstant, type Weekday } from './cycle';

/*
  How one raw spreadsheet value becomes a typed value. Every conversion says, in
  words, what it did, so the reader can see the manipulation and not only its
  result. Domain-neutral: the rulebook says which type a column has, and the
  currency and time zone that money and dates are read in.

  Raw values are what Google returns with UNFORMATTED_VALUE and SERIAL_NUMBER:
  numbers stay numbers (money in the main currency unit, a percentage cell as a
  fraction, times as a fraction of a day, dates as days since 30 Dec 1899) and
  text stays text. Dates typed as ISO text are read too. Nothing here reads the
  wall clock.
*/

export { WEEKDAYS, type Weekday };

export type Currency = { code: string; minor_units: number };

export type FieldType =
  | { kind: 'key' }
  | { kind: 'text' }
  | { kind: 'whole_number' }
  | { kind: 'decimal' }
  | { kind: 'percent' }
  | { kind: 'money'; currency: Currency }
  | { kind: 'date'; timeZone: string }
  | { kind: 'datetime'; timeZone: string }
  | { kind: 'weekday' }
  | { kind: 'time_of_day' }
  | { kind: 'yes_no' }
  | { kind: 'one_of'; values: readonly string[] };

// Dates and date-times are held as the instant, in milliseconds.
export type CellValue = string | number | boolean | null;

export type Interpreted = {
  value: CellValue;
  // How a person would write the value.
  display: string;
  // What the conversion did, in words.
  how: string;
  // Set when the value cannot be used as this type.
  issue?: string;
};

const isBlank = (raw: unknown) =>
  raw === undefined || raw === null || raw === '';

const DAY = 86_400_000;
// Day 0 of the spreadsheet serial calendar, 30 December 1899.
const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (minutes: number) =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export function formatMoney(minor: number, currency: Currency) {
  const amount = minor / 10 ** currency.minor_units;
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: currency.minor_units,
      maximumFractionDigits: currency.minor_units,
    }).format(amount);
  } catch {
    return `${currency.code} ${amount.toFixed(currency.minor_units)}`;
  }
}

// A wall-clock date (and minutes after midnight) from a serial or ISO text.
function wallTime(
  raw: unknown,
  withTime: boolean,
): {
  date: { year: number; month: number; day: number };
  minutes: number;
  from: string;
} | null {
  if (typeof raw === 'number') {
    const exact = raw * 1440;
    const total = Math.round(exact);
    if (Math.abs(exact - total) > 0.01) return null;
    const days = Math.floor(total / 1440);
    const d = new Date(SERIAL_EPOCH + days * DAY);
    return {
      date: {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      },
      minutes: total - days * 1440,
      from: `serial ${raw} (days since 30 Dec 1899)`,
    };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(
    String(raw).trim(),
  );
  if (!match || (!withTime && match[4])) return null;
  return {
    date: {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    },
    minutes: match[4] ? Number(match[4]) * 60 + Number(match[5]) : 0,
    from: `text "${String(raw).trim()}"`,
  };
}

export function interpretCell(
  raw: unknown,
  type: FieldType,
  required: boolean,
): Interpreted {
  if (isBlank(raw)) {
    return {
      value: null,
      display: '—',
      how: 'Blank cell.',
      ...(required ? { issue: 'Required, but the cell is blank.' } : {}),
    };
  }
  switch (type.kind) {
    case 'key':
    case 'text': {
      const text = String(raw).trim();
      return { value: text, display: text, how: 'Kept as text, trimmed.' };
    }
    case 'whole_number': {
      if (typeof raw !== 'number' || !Number.isInteger(raw))
        return invalid(raw, 'Expected a whole number.');
      return {
        value: raw,
        display: String(raw),
        how: 'Whole number, unchanged.',
      };
    }
    case 'decimal': {
      if (typeof raw !== 'number') return invalid(raw, 'Expected a number.');
      return { value: raw, display: String(raw), how: 'Number, unchanged.' };
    }
    case 'percent': {
      const text = typeof raw === 'string' ? raw.trim() : null;
      const fraction =
        typeof raw === 'number'
          ? raw
          : text && /^-?\d+(\.\d+)?%$/.test(text)
            ? Number(text.slice(0, -1)) / 100
            : null;
      if (fraction === null)
        return invalid(
          raw,
          'Expected a percentage (a percentage cell, or text like 25%).',
        );
      const display = `${Number((fraction * 100).toPrecision(12))}%`;
      return {
        value: fraction,
        display,
        how: `${typeof raw === 'number' ? `Percentage cell ${raw}` : `Text "${text}"`} = ${display}, used as the fraction ${fraction}.`,
      };
    }
    case 'money': {
      if (typeof raw !== 'number')
        return invalid(raw, `Expected an amount in ${type.currency.code}.`);
      const scale = 10 ** type.currency.minor_units;
      const minor = Math.round(raw * scale);
      // The sheet stores 2.8 as a binary fraction; anything further than this
      // from a whole minor unit was typed with too many decimals.
      if (Math.abs(raw * scale - minor) > 0.001)
        return invalid(
          raw,
          `Not a whole number of ${type.currency.code} minor units.`,
        );
      return {
        value: minor,
        display: formatMoney(minor, type.currency),
        how: `${raw} ${type.currency.code} × ${scale} = ${minor} minor units (stored as a whole number).`,
      };
    }
    case 'date':
    case 'datetime': {
      const withTime = type.kind === 'datetime';
      const wall = wallTime(raw, withTime);
      if (!wall || (!withTime && wall.minutes !== 0))
        return invalid(
          raw,
          withTime
            ? 'Expected a date and time (a date cell, or text like 2026-10-15 08:45).'
            : 'Expected a date without a time (a date cell, or text like 2026-10-15).',
        );
      const instant = zonedInstant(wall.date, wall.minutes, type.timeZone);
      const day = `${wall.date.year}-${pad(wall.date.month)}-${pad(wall.date.day)}`;
      const display = withTime ? `${day} ${clock(wall.minutes)}` : day;
      return {
        value: instant,
        display,
        how: `${wall.from} = ${display}${withTime ? '' : ', midnight'} in ${type.timeZone} = ${new Date(instant).toISOString()}.`,
      };
    }
    case 'weekday': {
      const text = String(raw).trim();
      const index = WEEKDAYS.indexOf(text as Weekday);
      if (index < 0)
        return invalid(raw, `Expected one of ${WEEKDAYS.join(', ')}.`);
      return {
        value: text,
        display: text,
        how: `Weekday ${index + 1} of 7, Monday first; resolved to a date only when a run is planned.`,
      };
    }
    case 'time_of_day': {
      if (typeof raw !== 'number' || raw < 0 || raw >= 1)
        return invalid(raw, 'Expected a time of day (a fraction of a day).');
      const exact = raw * 1440;
      const minutes = Math.round(exact);
      if (Math.abs(exact - minutes) > 0.01)
        return invalid(raw, 'Not a whole minute.');
      const display = clock(minutes);
      return {
        value: minutes,
        display,
        how: `${raw} of a day × 1,440 minutes = ${minutes} minutes after midnight (${display}).`,
      };
    }
    case 'yes_no': {
      const text = String(raw).trim().toLowerCase();
      if (text !== 'yes' && text !== 'no')
        return invalid(raw, 'Expected yes or no.');
      return {
        value: text === 'yes',
        display: text,
        how: `"${text}" → ${text === 'yes'}.`,
      };
    }
    case 'one_of': {
      const text = String(raw).trim();
      if (!type.values.includes(text))
        return invalid(raw, `Expected one of ${type.values.join(', ')}.`);
      return { value: text, display: text, how: 'Matches an allowed value.' };
    }
  }
}

function invalid(raw: unknown, issue: string): Interpreted {
  return {
    value: null,
    display: String(raw),
    how: 'Could not be read as this type.',
    issue,
  };
}
