import {
  isDated,
  isDatedOrWeekly,
  type DataShape,
  type Moment,
  type TimeColumns,
} from '@/lib/process/model';
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
import { sourceTermsOf, type SourceTerms } from '@/lib/sources/model';

import { celTypeOf, declaredType } from './profile';

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

// One resource of the source as read: its header row, then its rows. `tabs`
// and `tabIds` are historical names, kept because kept reads use them.
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

// What the process's source calls its parts, and how it addresses a value.
export const sourceOf = (data: DataShape) => sourceTermsOf(data.source);

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

// The dated columns that may not hold an instant after the data was read:
// those of an observed moment that also has a weekday and time to fall back on.
type NotAfter = { columns: Set<string>; readAt: number };

// A resource's rows by its `key` column, with blank cells left out.
function keyed(
  tab: DataTab | undefined,
  name: string,
  key: string,
  typeOf: TypeOf,
  problems: string[],
  { resource, address }: SourceTerms,
  notAfter?: NotAfter,
): Map<string, Row> {
  const rows = new Map<string, Row>();
  if (!tab || !tab.values.length) {
    problems.push(`The ${name} ${resource.singular} is missing or empty.`);
    return rows;
  }
  const [header = [], ...body] = tab.values;
  const names = header.map((h) => String(h));
  const at = names.indexOf(key);
  if (at < 0) {
    problems.push(`The ${name} ${resource.singular} has no ${key} column.`);
    return rows;
  }
  // A row by its place, the header being 0, and by its key where that names
  // it alone: a key listed twice does not.
  const valueAt = (column: number, row: number, id?: string) =>
    address.value({
      resource: name,
      column: { index: column, header: names[column] ?? '' },
      row: { index: row, key: id },
    });
  body.forEach((row, index) => {
    if (blank(row[at])) return;
    const id = String(row[at]);
    const twice = rows.has(id);
    if (twice)
      problems.push(
        `The ${name} ${resource.singular} lists ${key} ${id} twice (${valueAt(at, index + 1)}); each record needs one row.`,
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
          `${valueAt(i, index + 1, twice ? undefined : id)} (${column}) reads "${String(raw)}": ${read.issue}`,
        );
      else {
        if (
          notAfter?.columns.has(column) &&
          Number(read.value) > notAfter.readAt
        )
          problems.push(
            `${valueAt(i, index + 1, twice ? undefined : id)} (${column}) reads "${String(raw)}": it is after the data was read.`,
          );
        record[column] = asCel(read.value, typing.cel);
      }
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

// A dated column's instant, or null when its cell is blank: a date or
// date-time column is read as the instant in milliseconds (field-types.ts).
const instantOf = (record: Row, { at }: { at: string }) =>
  record[at] === undefined ? null : Number(record[at]);

function addTiming(record: Row, read: KeptRead, data: DataShape) {
  const { timing } = data;
  if (!timing) return;
  const { opens, timeZone } = timing;
  const readAt = Date.parse(read.readAt);
  // A dated cell's own instant, else a weekday and time placed in the week.
  const placed = (
    columns: TimeColumns,
    place: (at: DayTime) => number | null,
  ) => {
    if (isDated(columns)) return instantOf(record, columns);
    const instant = isDatedOrWeekly(columns)
      ? instantOf(record, columns)
      : null;
    if (instant !== null) return instant;
    const at = dayTimeOf(record, columns);
    return at ? place(at) : null;
  };
  for (const [name, columns] of Object.entries(timing.since)) {
    const instant = placed(columns, (at) =>
      latestAtOrBefore(at, readAt, timeZone),
    );
    if (instant !== null) record[name] = hours(instant, readAt);
  }
  for (const [name, columns] of Object.entries(timing.until)) {
    const instant = placed(columns, (at) =>
      opens ? deadlineBefore(at, opens, readAt, timeZone) : null,
    );
    if (instant !== null) record[name] = hours(readAt, instant);
  }
  // Every moment as hours from the read, so code compares them; the period's
  // opening is on every record where there is one, the read itself is 0.
  if (opens)
    record[momentColumn(START)] = hours(
      readAt,
      firstAfter(opens, readAt, timeZone),
    );
  for (const [name, moment] of Object.entries(timing.moments ?? {})) {
    const instant = placed(moment, (at) => {
      if (isDated(moment)) return null;
      if (moment.kind === 'observed')
        return latestAtOrBefore(at, readAt, timeZone);
      if (!opens) return null;
      return moment.kind === 'deadline'
        ? deadlineBefore(at, opens, readAt, timeZone)
        : firstAfter(at, readAt, timeZone);
    });
    if (instant !== null) record[momentColumn(name)] = hours(readAt, instant);
  }
}

// The columns a moment or a worked-out column is read from.
export const timeColumnsOf = (columns: TimeColumns | Moment): string[] =>
  isDated(columns)
    ? [columns.at]
    : isDatedOrWeekly(columns)
      ? [columns.at, columns.day, columns.time]
      : [columns.day, columns.time];

// The columns whose blanks make a moment blank: a dated column with a weekday
// and time to fall back on is blank only where they are, so its date is not.
export const blankColumnsOf = (columns: TimeColumns | Moment): string[] =>
  isDated(columns) ? [columns.at] : [columns.day, columns.time];

// The dated columns an observed moment, or hours since one, may not hold an
// instant after the read in: there, the weekday and time would have said it
// was never still to come, so no formula guards it.
const datesNotAfterRead = (data: DataShape): Set<string> => {
  const { timing } = data;
  return new Set(
    [
      ...Object.values(timing?.since ?? {}),
      ...Object.values(timing?.moments ?? {}),
    ].flatMap((columns) =>
      isDatedOrWeekly(columns) && columns.kind === 'observed'
        ? [columns.at]
        : [],
    ),
  );
};

/*
  What is wrong with the timing a process declares, said once, where its
  data is first read: what needs a weekly opening where there is none, and a
  dated column that is not typed as a date or date-time.
*/
function timingProblems(data: DataShape): string[] {
  const { timing } = data;
  if (!timing) return [];
  const problems: string[] = [];
  const dated = (what: string, { at }: { at: string }) => {
    const type =
      data.profile?.columns.find((c) => c.column === at)?.type ??
      data.types[at];
    if (type?.kind !== 'date' && type?.kind !== 'datetime')
      problems.push(
        `The process declares ${what} from the ${at} column, which is not typed as a date or date-time.`,
      );
  };
  // Where a dated column also has a weekday and time, those are placed as
  // the entry's place says, so its `kind` must be that one.
  const placed = (name: string, columns: TimeColumns, kind: string) => {
    if (isDatedOrWeekly(columns) && columns.kind !== kind)
      problems.push(
        `The process declares ${name} from a dated column and a weekday and time, which are placed as ${kind}, but gives its kind as ${columns.kind}.`,
      );
  };
  for (const [name, columns] of Object.entries(timing.since)) {
    if (isDated(columns) || isDatedOrWeekly(columns)) dated(name, columns);
    placed(name, columns, 'observed');
  }
  for (const [name, columns] of Object.entries(timing.until)) {
    if (isDated(columns) || isDatedOrWeekly(columns)) dated(name, columns);
    placed(name, columns, 'deadline');
    if (!isDated(columns) && !timing.opens)
      problems.push(
        `The process declares ${name} as hours until a weekday and time, but no weekly opening to place it in: give it a dated column, or declare when the period opens.`,
      );
  }
  for (const [name, moment] of Object.entries(timing.moments ?? {})) {
    if (isDated(moment) || isDatedOrWeekly(moment))
      dated(`the moment ${name}`, moment);
    if (!isDated(moment) && moment.kind !== 'observed' && !timing.opens)
      problems.push(
        `The process declares the moment ${name} as a ${moment.kind}, which is placed by the weekly opening, but declares none: give it a dated column, or declare when the period opens.`,
      );
  }
  return problems;
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
    const declared = declaredType(data, column, `${prefix}${column}`);
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
    ...(timing.opens ? [momentColumn(START)] : []),
    ...Object.keys(timing.moments ?? {}).map(momentColumn),
  ];
}

const noColumnIn = (
  tabs: string[],
  column: string,
  { resource }: SourceTerms,
) =>
  tabs.length === 1
    ? `The ${tabs[0]} ${resource.singular} has no ${column} column`
    : `None of the ${tabs.slice(0, -1).join(', ')} and ${tabs.at(-1)} ${resource.plural} has a ${column} column`;

// Each column the process declares as another type than the confirmed
// profile has it: a later change to the declaration is never overruled in
// silence, nor applied without the profile being confirmed again.
function declarationsChanged(data: DataShape): string[] {
  const kind = (type: FieldType | null) =>
    type ? type.kind.replaceAll('_', ' ') : 'not known';
  return (data.profile?.columns ?? []).flatMap(({ column, type }) => {
    const lookup = lookupOf(data, column);
    const declared = declaredType(
      data,
      lookup ? column.slice(lookup.as.length + 1) : column,
      column,
    );
    return declared && JSON.stringify(declared) !== JSON.stringify(type)
      ? [
          `The process declares the ${column} column as ${kind(declared)}, but the data profile has it as ${kind(type)}: confirm the profile again.`,
        ]
      : [];
  });
}

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
          `${noColumnIn([lookup.tab], name, sourceOf(data))}, which the data profile lists.`,
        );
    } else if (
      present(data.records.tabs) &&
      !data.records.tabs.some((tab) => headerOf(tab).includes(column))
    )
      problems.push(
        `${noColumnIn(data.records.tabs, column, sourceOf(data))}, which the data profile lists.`,
      );
  }
  return problems;
}

function build(read: KeptRead, data: DataShape): Records {
  const problems: string[] = [];
  const source = sourceOf(data);
  const { singular } = source.resource;
  const tabOf = (name: string) => read.tabs.find((t) => t.name === name);
  const [first, ...rest] = data.records.tabs;
  const recordTypes = typerOf(data);
  const notAfter = {
    columns: datesNotAfterRead(data),
    readAt: Date.parse(read.readAt),
  };
  const listed = keyed(
    tabOf(first ?? ''),
    first ?? '',
    data.records.key,
    recordTypes,
    problems,
    source,
    notAfter,
  );
  const keys = [...listed.keys()];
  const records = new Map(keys.map((key) => [key, { ...listed.get(key)! }]));
  // Which record tab each value came from, so two that disagree are named.
  const cameFrom = new Map(
    keys.map((key) => [
      key,
      new Map(Object.keys(listed.get(key)!).map((c) => [c, first ?? ''])),
    ]),
  );
  for (const name of rest) {
    const rows = keyed(
      tabOf(name),
      name,
      data.records.key,
      recordTypes,
      problems,
      source,
      notAfter,
    );
    for (const [key, row] of rows) {
      const record = records.get(key);
      if (record) {
        const from = cameFrom.get(key)!;
        for (const [column, value] of Object.entries(row)) {
          if (column in record && String(record[column]) !== String(value))
            problems.push(
              `${key} has ${column} ${String(record[column])} in the ${from.get(column)} ${singular} and ${String(value)} in the ${name} ${singular}; a record needs one value for each column.`,
            );
          from.set(column, name);
        }
        Object.assign(record, row);
      } else
        problems.push(
          `The ${name} ${singular} has ${data.records.key} ${key}, which the ${first} ${singular} does not list.`,
        );
    }
  }
  for (const record of records.values()) addTiming(record, read, data);
  const header = (tabOf(first ?? '')?.values[0] ?? []).map(String);
  if (tabOf(first ?? '')?.values.length && !header.includes(data.records.name))
    problems.push(
      `The ${first} ${singular} has no ${data.records.name} column.`,
    );
  const lookups = data.lookups.map((lookup) => {
    const rows = keyed(
      tabOf(lookup.tab),
      lookup.tab,
      lookup.key,
      typerOf(data, `${lookup.as}.`),
      problems,
      source,
    );
    for (const key of keys) {
      const via = records.get(key)?.[lookup.via];
      if (via === undefined)
        problems.push(
          `${key} has no ${lookup.via}, so no ${lookup.tab} row can be found for it.`,
        );
      else if (rows.size && !rows.has(String(via)))
        problems.push(
          `${key}'s ${lookup.via} is "${String(via)}", which the ${lookup.tab} ${singular} does not list.`,
        );
    }
    return { ...lookup, rows };
  });
  const recordTypesSeen = unifyColumns([...records.values()]);
  const lookupTypesSeen = lookups.map(
    (lookup) => [lookup.as, unifyColumns([...lookup.rows.values()])] as const,
  );
  problems.push(...timingProblems(data));
  if (data.profile)
    problems.push(...declarationsChanged(data), ...missingColumns(read, data));
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
      `The read does not fit what this process reads: ${records.problems.slice(0, 3).join(' ')}${records.problems.length > 3 ? ` And ${records.problems.length - 3} more.` : ''} Fix the ${sourceOf(data).noun} and read it again.`,
    );
  return records;
}
