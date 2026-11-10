import type { DataShape } from '@/lib/process/model';
import {
  deadlineBefore,
  firstAfter,
  hoursBetween,
  latestAtOrBefore,
  type DayTime,
} from '@/lib/sheets/cycle';
import {
  WEEKDAYS,
  interpretCell,
  type FieldType,
  type Weekday,
} from '@/lib/sheets/field-types';

import { celTypeOf } from './profile';

/*
  How a read becomes the records a formula reads, as the process declares it
  (`DataShape`): the record tabs joined by their key column, each lookup a
  record reaches through one of its columns, and the columns read as a type.
  A weekday becomes 1 (Monday) to 7 and a time of day minutes after midnight,
  so a formula compares plain numbers. Columns the process declares as timing
  are added from when the read was taken, so they stay the same for that read.

  Whatever does not fit the declaration is reported, never smoothed over: a
  missing tab or column, a key listed twice, a cell that cannot be read as its
  type, a record whose lookup finds no row. A read with problems is not
  drafted on; the Read step shows them.

  With a data profile (`DataShape.profile`), each column it types keeps that
  type whatever this read holds: a cell that does not fit is a problem, a
  column blank throughout is still typed, and one the read no longer has is
  missing. A column it does not type is read as without a profile.
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

// A column's type: from the profile, where it types the column, as CEL reads
// it; otherwise as declared, or as written.
type TypeOf = (column: string) => { type: FieldType; cel?: string } | undefined;

// A typed value as the CEL type the profile gives its column: a whole number
// in a decimal column is a decimal, never an int.
const asCel = (value: unknown, type: string | undefined) =>
  type === 'double'
    ? Number(value)
    : type === 'int'
      ? BigInt(value as number)
      : type
        ? value
        : cel(value);

// A tab's rows by its `key` column, with blank cells left out.
function keyed(
  tab: DataTab | undefined,
  name: string,
  key: string,
  typeOf: TypeOf,
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
      const typing = typeOf(column);
      if (!typing) {
        record[column] = cel(raw);
        return;
      }
      const read = typed(raw, typing.type);
      if (read.issue)
        problems.push(
          `${cellOf(name, i, index + 1)} (${column}) reads "${String(raw)}": ${read.issue}`,
        );
      else record[column] = asCel(read.value, typing.cel);
    });
    rows.set(id, record);
  });
  return rows;
}

// A weekday column and a time column of a record as one moment in the week;
// null when either cell is blank.
function dayTimeOf(
  record: Row,
  { day, time }: { day: string; time: string },
): DayTime | null {
  const index = record[day];
  const minutes = record[time];
  return index === undefined || minutes === undefined
    ? null
    : {
        day: WEEKDAYS[Number(index) - 1] as Weekday,
        minutes: Number(minutes),
      };
}

// Hours to two places; always a double, as a formula is checked against one.
const hours = (from: number, to: number) =>
  Math.round(hoursBetween(from, to) * 100) / 100;

function addTiming(record: Row, read: KeptRead, data: DataShape) {
  const { timing } = data;
  if (!timing) return;
  const readAt = Date.parse(read.readAt);
  for (const [name, columns] of Object.entries(timing.since)) {
    const at = dayTimeOf(record, columns);
    if (at)
      record[name] = hours(
        latestAtOrBefore(at, readAt, timing.timeZone),
        readAt,
      );
  }
  for (const [name, columns] of Object.entries(timing.until)) {
    const at = dayTimeOf(record, columns);
    if (at)
      record[name] = hours(
        readAt,
        deadlineBefore(at, timing.opens, readAt, timing.timeZone),
      );
  }
  // Every moment as hours from the read, so code compares them; the period's
  // opening is on every record, the read itself is 0.
  record[momentColumn(START)] = hours(
    readAt,
    firstAfter(timing.opens, readAt, timing.timeZone),
  );
  for (const [name, moment] of Object.entries(timing.moments ?? {})) {
    const at = dayTimeOf(record, moment);
    if (!at) continue;
    const instant =
      moment.kind === 'observed'
        ? latestAtOrBefore(at, readAt, timing.timeZone)
        : moment.kind === 'deadline'
          ? deadlineBefore(at, timing.opens, readAt, timing.timeZone)
          : firstAfter(at, readAt, timing.timeZone);
    record[momentColumn(name)] = hours(readAt, instant);
  }
}

// The moments every timed process has: when its planned period opens, and
// when the data was read.
export const START = 'start';
export const READ = 'read';
// Where a moment is kept on a record: a column no sheet writes, which only
// code-written formulas read.
export const MOMENT_PREFIX = 'moment__';
export const momentColumn = (name: string) => `${MOMENT_PREFIX}${name}`;

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

// How each column is typed: the profile's type for those it types, as their
// CEL type, and the declaration for the rest. `prefix` names a lookup's.
function typerOf(data: DataShape, prefix = ''): TypeOf {
  const profiled = new Map(
    (data.profile?.columns ?? []).flatMap(({ column, type }) =>
      type ? [[column, type] as const] : [],
    ),
  );
  return (column) => {
    const type = profiled.get(`${prefix}${column}`);
    if (type) return { type, cel: celTypeOf(type) };
    const declared = data.types[column];
    return declared ? { type: declared } : undefined;
  };
}

// The profile's types over what this read gives: a column blank throughout
// stays typed, and a column the profile does not type keeps its own.
function profiledTypes(
  inferred: Record<string, string>,
  data: DataShape,
  prefix: string,
): Record<string, string> {
  const types = { ...inferred };
  for (const { column, type } of data.profile?.columns ?? []) {
    if (!type || !column.startsWith(prefix)) continue;
    const name = column.slice(prefix.length);
    // A record column is any path no lookup claims.
    if (!prefix && lookupOf(data, column)) continue;
    types[name] = celTypeOf(type);
  }
  return types;
}

// The lookup a profile path names, if it names one.
const lookupOf = (data: DataShape, column: string) =>
  data.lookups.find((lookup) => column.startsWith(`${lookup.as}.`));

// Columns worked out from when the data was read: always hours, a double.
function timedColumns(data: DataShape): string[] {
  const { timing } = data;
  if (!timing) return [];
  return [
    ...Object.keys(timing.since),
    ...Object.keys(timing.until),
    momentColumn(START),
    ...Object.keys(timing.moments ?? {}).map(momentColumn),
  ];
}

const noColumnIn = (tabs: string[], column: string) =>
  tabs.length === 1
    ? `The ${tabs[0]} tab has no ${column} column`
    : `None of the ${tabs.slice(0, -1).join(', ')} and ${tabs.at(-1)} tabs has a ${column} column`;

// Each column the profile lists that the read no longer has.
function missingColumns(read: KeptRead, data: DataShape): string[] {
  const headerOf = (name: string) =>
    (read.tabs.find((t) => t.name === name)?.values[0] ?? []).map(String);
  const present = (tabs: string[]) => tabs.some((t) => headerOf(t).length);
  const problems: string[] = [];
  for (const { column } of data.profile?.columns ?? []) {
    const lookup = lookupOf(data, column);
    if (lookup) {
      const name = column.slice(lookup.as.length + 1);
      if (present([lookup.tab]) && !headerOf(lookup.tab).includes(name))
        problems.push(
          `${noColumnIn([lookup.tab], name)}, which the data profile lists.`,
        );
    } else if (
      present(data.records.tabs) &&
      !data.records.tabs.some((tab) => headerOf(tab).includes(column))
    )
      problems.push(
        `${noColumnIn(data.records.tabs, column)}, which the data profile lists.`,
      );
  }
  return problems;
}

function build(read: KeptRead, data: DataShape): Records {
  const problems: string[] = [];
  const tabOf = (name: string) => read.tabs.find((t) => t.name === name);
  const [first, ...rest] = data.records.tabs;
  const recordTypes = typerOf(data);
  const listed = keyed(
    tabOf(first ?? ''),
    first ?? '',
    data.records.key,
    recordTypes,
    problems,
  );
  const keys = [...listed.keys()];
  const records = new Map(keys.map((key) => [key, { ...listed.get(key)! }]));
  for (const name of rest) {
    const rows = keyed(
      tabOf(name),
      name,
      data.records.key,
      recordTypes,
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
  for (const record of records.values()) addTiming(record, read, data);
  const header = (tabOf(first ?? '')?.values[0] ?? []).map(String);
  if (tabOf(first ?? '')?.values.length && !header.includes(data.records.name))
    problems.push(`The ${first} tab has no ${data.records.name} column.`);
  const lookups = data.lookups.map((lookup) => {
    const rows = keyed(
      tabOf(lookup.tab),
      lookup.tab,
      lookup.key,
      typerOf(data, `${lookup.as}.`),
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
  const recordTypesSeen = unifyColumns([...records.values()]);
  const lookupTypesSeen = lookups.map(
    (lookup) => [lookup.as, unifyColumns([...lookup.rows.values()])] as const,
  );
  if (data.profile) problems.push(...missingColumns(read, data));
  return {
    keys,
    types: data.profile
      ? {
          record: {
            ...profiledTypes(recordTypesSeen, data, ''),
            ...Object.fromEntries(
              timedColumns(data).map((name) => [name, 'double']),
            ),
          },
          lookups: Object.fromEntries(
            lookupTypesSeen.map(([as, seen]) => [
              as,
              profiledTypes(seen, data, `${as}.`),
            ]),
          ),
        }
      : {
          record: recordTypesSeen,
          lookups: Object.fromEntries(lookupTypesSeen),
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
