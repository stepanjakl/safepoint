import type { DataShape } from '@/lib/process/model';
import {
  WEEKDAYS,
  interpretCell,
  type FieldType,
  type Weekday,
} from '@/lib/sheets/field-types';

/*
  How a read becomes the records a formula reads, as the process declares it
  (`DataShape`): the record tabs joined by their key column, each lookup a
  record reaches through one of its columns, and the columns read as a type.
  A weekday becomes 1 (Monday) to 7 and a time of day minutes after midnight,
  so a formula compares plain numbers.

  Whatever does not fit the declaration is reported, never smoothed over: a
  missing tab or column, a key listed twice, a cell that cannot be read as its
  type, a record whose lookup finds no row. A read with problems is not
  drafted on; the Read step shows them.
*/

export type DataTab = { name: string; values: unknown[][] };
export type KeptRead = {
  id: string;
  readAt: string;
  source: string;
  spreadsheet: {
    title: string | null;
    url: string;
    tabIds?: Record<string, number>;
  };
  tabs: DataTab[];
};

export type Row = Record<string, unknown>;

// Whole numbers are CEL ints, so money and counts stay exact.
export const cel = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) ? BigInt(value) : value;

const blank = (raw: unknown) => raw === undefined || raw === null || raw === '';

// A1 notation for a cell: column index and row index from zero.
export const cellOf = (tab: string, column: number, row: number) => {
  let letters = '';
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return `${tab}!${letters}${row + 1}`;
};

// A typed cell as a formula reads it, or why it cannot be.
function typed(
  raw: unknown,
  type: FieldType,
): { value: unknown; issue?: string } {
  const read = interpretCell(raw, type, false);
  if (read.issue) return { value: null, issue: read.issue };
  return {
    value:
      type.kind === 'weekday'
        ? WEEKDAYS.indexOf(read.value as Weekday) + 1
        : read.value,
  };
}

// A tab's rows by its `key` column, with blank cells left out.
function keyed(
  tab: DataTab | undefined,
  name: string,
  key: string,
  types: DataShape['types'],
  problems: string[],
): Map<string, Row> {
  const rows = new Map<string, Row>();
  if (!tab || !tab.values.length) {
    problems.push(`The ${name} tab is missing or empty.`);
    return rows;
  }
  const [header = [], ...body] = tab.values;
  const names = header.map((h) => String(h));
  const at = names.indexOf(key);
  if (at < 0) {
    problems.push(`The ${name} tab has no ${key} column.`);
    return rows;
  }
  body.forEach((row, index) => {
    if (blank(row[at])) return;
    const id = String(row[at]);
    if (rows.has(id))
      problems.push(
        `The ${name} tab lists ${key} ${id} twice (${cellOf(name, at, index + 1)}); each record needs one row.`,
      );
    const record: Row = {};
    names.forEach((column, i) => {
      const raw = row[i];
      if (blank(raw)) return;
      const type = types[column];
      if (!type) {
        record[column] = cel(raw);
        return;
      }
      const read = typed(raw, type);
      if (read.issue)
        problems.push(
          `${cellOf(name, i, index + 1)} (${column}) reads "${String(raw)}": ${read.issue}`,
        );
      else record[column] = cel(read.value);
    });
    rows.set(id, record);
  });
  return rows;
}

const celType = (value: unknown) =>
  typeof value === 'bigint'
    ? 'int'
    : typeof value === 'number'
      ? 'double'
      : typeof value === 'boolean'
        ? 'bool'
        : typeof value === 'string'
          ? 'string'
          : 'dyn';

// Makes each column one CEL type across its rows, and returns the types: a
// column of whole numbers and decimals becomes decimals throughout, since
// CEL keeps the two apart and a formula is checked against one type.
function unifyColumns(rows: Row[]): Record<string, string> {
  const seen = new Map<string, Set<string>>();
  for (const row of rows)
    for (const [name, value] of Object.entries(row))
      seen.set(name, (seen.get(name) ?? new Set()).add(celType(value)));
  const types: Record<string, string> = {};
  for (const [name, kinds] of seen) {
    const mixed = kinds.size === 2 && kinds.has('int') && kinds.has('double');
    types[name] = mixed ? 'double' : kinds.size === 1 ? [...kinds][0]! : 'dyn';
    if (mixed)
      for (const row of rows)
        if (typeof row[name] === 'bigint') row[name] = Number(row[name]);
  }
  return types;
}

export type Records = {
  keys: string[];
  // Each column's CEL type, the same in every row.
  types: {
    record: Record<string, string>;
    lookups: Record<string, Record<string, string>>;
  };
  // Every lookup's keys, which a formula reaches through a record's columns.
  lookupKeys: string[];
  record: (key: string) => Row;
  lookups: (key: string) => Record<string, Row>;
  // Where the read does not fit the declaration, in words a person can act on.
  problems: string[];
};

function build(read: KeptRead, data: DataShape): Records {
  const problems: string[] = [];
  const tabOf = (name: string) => read.tabs.find((t) => t.name === name);
  const [first, ...rest] = data.records.tabs;
  const listed = keyed(
    tabOf(first ?? ''),
    first ?? '',
    data.records.key,
    data.types,
    problems,
  );
  const keys = [...listed.keys()];
  const records = new Map(keys.map((key) => [key, { ...listed.get(key)! }]));
  for (const name of rest) {
    const rows = keyed(
      tabOf(name),
      name,
      data.records.key,
      data.types,
      problems,
    );
    for (const [key, row] of rows) {
      const record = records.get(key);
      if (record) Object.assign(record, row);
      else
        problems.push(
          `The ${name} tab has ${data.records.key} ${key}, which the ${first} tab does not list.`,
        );
    }
  }
  const header = (tabOf(first ?? '')?.values[0] ?? []).map(String);
  if (tabOf(first ?? '')?.values.length && !header.includes(data.records.name))
    problems.push(`The ${first} tab has no ${data.records.name} column.`);
  const lookups = data.lookups.map((lookup) => {
    const rows = keyed(
      tabOf(lookup.tab),
      lookup.tab,
      lookup.key,
      data.types,
      problems,
    );
    for (const key of keys) {
      const via = records.get(key)?.[lookup.via];
      if (via === undefined)
        problems.push(
          `${key} has no ${lookup.via}, so no ${lookup.tab} row can be found for it.`,
        );
      else if (rows.size && !rows.has(String(via)))
        problems.push(
          `${key}'s ${lookup.via} is "${String(via)}", which the ${lookup.tab} tab does not list.`,
        );
    }
    return { ...lookup, rows };
  });
  return {
    keys,
    types: {
      record: unifyColumns([...records.values()]),
      lookups: Object.fromEntries(
        lookups.map((lookup) => [
          lookup.as,
          unifyColumns([...lookup.rows.values()]),
        ]),
      ),
    },
    lookupKeys: lookups.flatMap((lookup) => [...lookup.rows.keys()]),
    record: (key) => records.get(key) ?? {},
    lookups: (key) =>
      Object.fromEntries(
        lookups.map((lookup) => [
          lookup.as,
          lookup.rows.get(String(records.get(key)?.[lookup.via] ?? '')) ?? {},
        ]),
      ),
    problems,
  };
}

// Built once per read and declaration: a draft runs formulas hundreds of
// times on the same read.
const built = new WeakMap<KeptRead, WeakMap<DataShape, Records>>();

export function recordsOf(read: KeptRead, data: DataShape): Records {
  let byShape = built.get(read);
  if (!byShape) built.set(read, (byShape = new WeakMap()));
  let records = byShape.get(data);
  if (!records) byShape.set(data, (records = build(read, data)));
  return records;
}

// Each record's name, for showing a key with what it is: the declared name
// column of the first record tab, as the sheet writes it.
export function namesOf(
  read: KeptRead,
  data: DataShape,
): Record<string, string> {
  const records = recordsOf(read, data);
  return Object.fromEntries(
    records.keys.map((key) => [
      key,
      String(records.record(key)[data.records.name] ?? ''),
    ]),
  );
}

// The records of a read that fits the declaration; a read that does not is
// refused with what is wrong, since a definition drafted on it would be
// checked against data the process does not describe.
export function fitting(read: KeptRead, data: DataShape): Records {
  const records = recordsOf(read, data);
  if (records.problems.length)
    throw new Error(
      `The read does not fit what this process reads: ${records.problems.slice(0, 3).join(' ')}${records.problems.length > 3 ? ` And ${records.problems.length - 3} more.` : ''} Fix the sheet and read it again.`,
    );
  return records;
}
