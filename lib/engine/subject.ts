import type { DayTime } from '@/lib/sheets/cycle';
import type { FieldType } from '@/lib/sheets/field-types';
import type { SourceKind } from '@/lib/sources/model';

/*
  What the engine works on: the subject a process's definitions are about, the
  shape of the data it reads, and the moments in a week a formula may compare.
  A process declares them (lib/processes/); the engine reads them and imports
  nothing of the shell that shows the process.
*/

// What a process's definitions are about, in the words its prompts and screens
// use: the record a formula is worked out for, and the fields a proposal sets
// for one record. The engine and the card say none of these words themselves.
export type DefinitionSubject = {
  record: { singular: string; plural: string };
  data: DataShape;
  // Whole numbers a proposal sets per record, read by a formula by `id`.
  // `none` is the value that proposes nothing for a record, where one does: a
  // check that stops a proposal must then let it through. Absent, no value
  // means that, and nothing is assumed. `min` is the least a proposal may
  // set: a value below it blocks the record, and the model is told it.
  proposal: {
    id: string;
    label: string;
    unit: string;
    none?: number;
    min?: number;
  }[];
  // Who reads the plain-words reasons.
  reader: string;
};

/*
  How a process's read becomes the records its formulas read, declared rather
  than assumed: which tabs hold a record's columns (joined by its key column),
  which tables a record reaches through one of its columns, and the columns
  read as a type other than as written. A formula reads `key`, `record` and
  each lookup by its `as`.

  `tabs` and `tab` below are historical names, kept because stored files and
  every process declaration use them: each means one resource of the source,
  whatever its kind calls it (SOURCE_KINDS in lib/sources/model.ts).
*/
export type DataShape = {
  // The kind of source the data is read from, which says what its resources
  // are called and how a value is addressed. Absent: a sheet, as before.
  source?: SourceKind;
  // The first tab lists the records; `name` is the column that says what each is.
  records: { tabs: string[]; key: string; name: string };
  // A table a record reaches: the row of `tab` whose `key` column holds the
  // record's `via` column, read as `as`.
  lookups: { tab: string; key: string; via: string; as: string }[];
  // By column header, or for a lookup's column by its path, `<as>.<column>`,
  // which wins; any column not listed is read as written.
  types: Record<string, FieldType>;
  // The confirmed types of every column, which a read is then held to rather
  // than typed from its own values. Absent: typed from each read, as before.
  // Set by the engine (lib/engine/profile.ts), never by a process.
  profile?: DataProfileTypes;
  // Where approved proposals would be written: a tab, one row per record by
  // its key column, one column per proposal field. Absent: nowhere yet.
  output?: { tab: string; key: string };
  // Columns worked out from when the data was read, in hours: `since` how
  // long ago a moment happened, `until` how long is left before it, negative
  // once it has passed. Each is a weekday column and a time-of-day column,
  // placed in the week (`until` then needs `opens`: the deadline in the week
  // being planned), or one date or date-time column, the instant it holds, or
  // a dated column that falls back on the pair (`DatedOrWeeklyMoment`).
  // Never the wall clock, so a read always gives the same answers.
  timing?: {
    timeZone: string;
    // When the planned period opens each week. Absent for a process whose
    // period is not weekly: it has no start, and no deadline or next moment.
    opens?: DayTime;
    since: Record<string, TimeColumns>;
    until: Record<string, TimeColumns>;
    // Moments a check can compare, before or after one another, never by
    // the hours between. A weekday and time pair is placed by `kind`:
    // observed, the last time it came round by the read; deadline, the last
    // before the planned period opens; next, the first after the read. A
    // dated moment is the instant its cell holds; with a pair as well, the
    // pair places it where the cell is blank or the source has no such column.
    moments?: Record<string, Moment>;
  };
};

// What reading a source needs of its data profile: each column, by the path
// a shape names it with, and its type, null where none could be told; its
// words, and what a blank cell in it means for a rule (null: not answered).
export type DataProfileTypes = {
  id: string;
  confirmedAt: string | null;
  columns: {
    column: string;
    type: FieldType | null;
    label: string;
    blanksSeen: boolean;
    blank: 'skip' | 'fail' | null;
  }[];
};

// A moment's columns: a weekday and a time of day, or one dated column, or
// both (`DatedOrWeeklyMoment`).
export type TimeColumns =
  | { day: string; time: string; at?: undefined }
  | { at: string; day?: undefined }
  | DatedOrWeeklyMoment;

export type WeeklyMoment = {
  day: string;
  time: string;
  kind: 'observed' | 'deadline' | 'next';
  // How a sentence names it; absent, its name with spaces.
  label?: string;
  // Never set: what tells it from one with a dated column.
  at?: undefined;
};

// One `date` or `datetime` column: the instant its cell holds, a date with
// no time being the start of that day in the column's time zone.
export type DatedMoment = { at: string; label?: string; day?: undefined };

/*
  A dated column and a weekday and time pair together, for data that gains
  its dates after it has been kept without them. For each record, the instant
  its `at` cell holds; where that cell is blank, or the source has no such
  column at all, the weekday and time placed by `kind`, exactly as a weekly
  moment is. Everywhere else it is that weekly moment of its `kind`: the same
  rules may read it, the same formula and sentence are written for it, and a
  blank `at` cell is not a blank of the moment, only the pair's cells are. An
  `observed` one is never in the future: a dated cell after the read is a read
  problem. As a `since` or `until` entry its `kind` is the one its place
  gives: `observed` for `since`, `deadline` for `until`.
*/
export type DatedOrWeeklyMoment = {
  at: string;
  day: string;
  time: string;
  kind: 'observed' | 'deadline' | 'next';
  label?: string;
};

export type Moment = WeeklyMoment | DatedMoment | DatedOrWeeklyMoment;

// A column that is only dated: not one that falls back on a weekday and time.
export const isDated = (
  columns: TimeColumns | Moment,
): columns is { at: string; day?: undefined } =>
  'at' in columns && !('day' in columns);

// A dated column with a weekday and time to fall back on.
export const isDatedOrWeekly = (
  columns: TimeColumns | Moment,
): columns is DatedOrWeeklyMoment => 'at' in columns && 'day' in columns;
