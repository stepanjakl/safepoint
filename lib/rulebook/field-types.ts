/*
  How one raw spreadsheet value becomes a typed value. Every conversion says, in
  words, what it did, so the reader can see the manipulation and not only its
  result. Domain-neutral: the process says which type a column has.

  Raw values are what Google returns with UNFORMATTED_VALUE and SERIAL_NUMBER:
  numbers stay numbers (money in pounds, times as a fraction of a day) and text
  stays text. Nothing here reads the wall clock.
*/

export const WEEKDAYS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type FieldType =
  | { kind: 'key' }
  | { kind: 'text' }
  | { kind: 'whole_number' }
  | { kind: 'money_gbp' }
  | { kind: 'weekday' }
  | { kind: 'time_of_day' }
  | { kind: 'yes_no' }
  | { kind: 'one_of'; values: readonly string[] };

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
    case 'money_gbp': {
      if (typeof raw !== 'number')
        return invalid(raw, 'Expected an amount in pounds.');
      const pence = Math.round(raw * 100);
      // Sheets stores 2.8 as a binary fraction; anything further than this
      // from whole pence was typed with too many decimals, not rounded by us.
      if (Math.abs(raw * 100 - pence) > 0.001)
        return invalid(raw, 'Not a whole number of pence.');
      return {
        value: pence,
        display: `£${(pence / 100).toFixed(2)}`,
        how: `${raw} pounds × 100 = ${pence} pence (stored as a whole number).`,
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
      const display = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
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
