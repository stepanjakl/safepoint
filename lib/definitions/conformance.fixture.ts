import type { DataShape, DefinitionSubject } from '@/lib/process/model';

import type { DataTab, KeptRead } from './records';
import type { Shape } from './shapes';
import type { DefinitionProcess } from './types';

/*
  A second process, for tests only: bike-share docks, planned each week. It
  shares nothing with Brunch orders on purpose -- other record words, a key
  not called sku, other tabs, two proposal fields, two lookups whose via, key
  and as all differ, moments under other names, and data that is decimals,
  percentages, money, yes/no checkboxes, dates and blanks -- so that whatever
  the engine assumed from the one process it has run is found
  (conformance.test.ts). Never registered in the app.

  Every number below is worked out by hand from the data, never by running
  the engine: these are what the engine is held to.
*/

const ZONE = 'Asia/Singapore';

// Thu 5 Nov 2026 07:30 in Singapore.
const READ_AT = '2026-11-04T23:30:00.000Z';

const DATA = {
  records: {
    tabs: ['Docks', 'Usage', 'Visits'],
    key: 'dock_ref',
    name: 'dock_name',
  },
  lookups: [
    // Three names: the tab's key, the record's column, the formula's name.
    { tab: 'Zones', key: 'zone_id', via: 'zone_code', as: 'area' },
    // Reached through a column of the third record tab.
    { tab: 'Crews', key: 'crew_name', via: 'crew', as: 'team' },
  ],
  types: {
    occupancy_pct: { kind: 'percent' },
    surge_pct: { kind: 'percent' },
    cover_pct: { kind: 'percent' },
    base_fare: { kind: 'money', currency: { code: 'SGD', minor_units: 2 } },
    last_inspected: { kind: 'date', timeZone: ZONE },
    swept_day: { kind: 'weekday' },
    swept_time: { kind: 'time_of_day' },
    van_day: { kind: 'weekday' },
    van_time: { kind: 'time_of_day' },
    lock_day: { kind: 'weekday' },
    lock_time: { kind: 'time_of_day' },
  },
  output: { tab: 'Plan', key: 'dock_ref' },
  timing: {
    timeZone: ZONE,
    // The planned week opens on Monday at 06:00.
    opens: { day: 'Mon', minutes: 6 * 60 },
    since: { sweep_age_hours: { day: 'swept_day', time: 'swept_time' } },
    until: {},
    moments: {
      swept: {
        day: 'swept_day',
        time: 'swept_time',
        kind: 'observed',
        label: 'last sweep',
      },
      // No label: a sentence says its name.
      lockout: { day: 'lock_day', time: 'lock_time', kind: 'deadline' },
      van: {
        day: 'van_day',
        time: 'van_time',
        kind: 'next',
        label: 'van visit',
      },
    },
  },
} satisfies DataShape;

const SUBJECT: DefinitionSubject = {
  record: { singular: 'dock', plural: 'docks' },
  data: DATA,
  proposal: [
    // Bringing nothing is always open; fewer than nothing is not.
    { id: 'bikes', label: 'bikes to bring', unit: 'bikes', none: 0, min: 0 },
    // Every dock has a fare: no value proposes nothing, and none is least.
    { id: 'fare', label: 'hire fare', unit: 'cents' },
  ],
  reader: 'operations lead',
};

export const DOCKS: DefinitionProcess = {
  id: 'conformance-docks',
  subject: SUBJECT,
};

/*
  The same process read from a database, not a sheet: its resources are
  tables named as a database names them, a value is addressed by its row's
  key and its column's name, and a written block by its rows and columns.
*/
const TABLES: Record<string, string> = {
  Docks: 'docks',
  Usage: 'usage',
  Visits: 'visits',
  Zones: 'zones',
  Crews: 'crews',
};
export const TABLE_DOCKS: DefinitionProcess = {
  id: 'conformance-docks-tables',
  subject: {
    ...SUBJECT,
    data: {
      ...DATA,
      source: 'database',
      records: { ...DATA.records, tabs: ['docks', 'usage', 'visits'] },
      lookups: DATA.lookups.map((lookup) => ({
        ...lookup,
        tab: TABLES[lookup.tab]!,
      })),
      output: { tab: 'plan', key: 'dock_ref' },
    },
  },
};
// Any variant of the read below, as the database holds it.
export const asTables = (tabs: DataTab[]): DataTab[] =>
  tabs.map((tab) => ({ ...tab, name: TABLES[tab.name] ?? tab.name }));

// The same process with no timing at all: no moments, no worked-out hours.
export const UNTIMED_DOCKS: DefinitionProcess = {
  id: 'conformance-docks-untimed',
  subject: { ...SUBJECT, data: { ...DATA, timing: undefined } },
};

/*
  Dated moments: last_inspected, a date column, as a moment and as hours
  since. A date is the start of its day in Singapore, the zone its type
  declares, so 2026-10-20 is 2026-10-19T16:00Z.
*/
const INSPECTED = { at: 'last_inspected', label: 'last inspection' };
const withTiming = (
  id: string,
  timing: NonNullable<DataShape['timing']>,
  types: DataShape['types'] = DATA.types,
): DefinitionProcess => ({
  id,
  subject: { ...SUBJECT, data: { ...DATA, types, timing } },
});
export const DATED_DOCKS = withTiming('conformance-docks-dated', {
  ...DATA.timing,
  since: { ...DATA.timing.since, inspection_age_hours: INSPECTED },
  until: { inspection_hours_left: INSPECTED },
  moments: { ...DATA.timing.moments, inspected: INSPECTED },
});
// last_inspected read with its time of day, where a cell has one.
export const DATETIME_DOCKS = withTiming(
  'conformance-docks-datetime',
  { ...DATA.timing, moments: { inspected: INSPECTED } },
  { ...DATA.types, last_inspected: { kind: 'datetime', timeZone: ZONE } },
);
// A period that does not open weekly: a time zone, an observed weekly
// moment and a dated one, hours until a dated column; no start.
export const UNOPENED_DOCKS = withTiming('conformance-docks-unopened', {
  timeZone: ZONE,
  since: {},
  until: { inspection_hours_left: INSPECTED },
  moments: { swept: DATA.timing.moments.swept, inspected: INSPECTED },
});
// What needs a weekly opening, declared without one, and a dated moment on
// a column that holds no dates.
export const MISDECLARED_DOCKS = withTiming('conformance-docks-misdeclared', {
  timeZone: ZONE,
  since: {},
  until: { hours_to_lock: { day: 'lock_day', time: 'lock_time' } },
  moments: {
    lockout: DATA.timing.moments.lockout,
    noted: { at: 'notes' },
  },
});

// Hours from the read to each dock's last inspection: back to the start of
// that day, Singapore time, from Thu 5 Nov 07:30.
export const INSPECTED_HOURS: Record<string, number> = {
  'D-01': -391.5,
  'D-02': -367.5,
  'D-03': -871.5,
  'D-04': -823.5,
  'D-05': -511.5,
  'D-06': -199.5,
  'D-07': -607.5,
  'D-08': -415.5,
  'D-09': -751.5,
  'D-10': -271.5,
};

// D-06 never inspected; D-10's inspection booked for Tue 10 Nov, after the
// read: 112.5 hours on.
export function blankInspectionTabs(): DataTab[] {
  const tabs = docksTabs();
  rowOf(tabs, 'Docks', 'D-06')[7] = '';
  return tabs;
}
export function futureInspectionTabs(): DataTab[] {
  const tabs = docksTabs();
  rowOf(tabs, 'Docks', 'D-10')[7] = '2026-11-10';
  return tabs;
}
// D-01 inspected at 08:45, read as a date-time.
export function timedInspectionTabs(): DataTab[] {
  const tabs = docksTabs();
  rowOf(tabs, 'Docks', 'D-01')[7] = '2026-10-20 08:45';
  return tabs;
}

// Flag a dock not inspected for 30 days, said in hours: no constant can
// state 720 from "30 days" (a limit, conformance.test.ts).
export const INSPECT_HOURS = {
  id: 'inspect_hours',
  value: 720,
  quote: 'more than 720 hours',
};

// Times of day as a sheet gives them: a fraction of a day.
const at = (hours: number) => hours / 24;

/*
  The read. Rows of the record tabs end where their last filled cell is, as
  a sheet returns them; retired_bikes is blank throughout, notes in most rows.
*/
export const docksTabs = (): DataTab[] =>
  structuredClone([
    {
      name: 'Docks',
      values: [
        [
          'dock_ref',
          'dock_name',
          'zone_code',
          'capacity',
          'elevation_m',
          'has_kiosk',
          'notes',
          'last_inspected',
          'retired_bikes',
        ],
        ['D-01', 'Marina Bay North', 'Z1', 20, 3.5, true, '', '2026-10-20'],
        [
          'D-02',
          'Marina Bay South',
          'Z1',
          16,
          4.25,
          true,
          'Near the ferry',
          '2026-10-21',
        ],
        ['D-03', 'Ridge Road', 'Z2', 12, 61.8, false, '', '2026-09-30'],
        [
          'D-04',
          'Harbour Steps',
          'Z2',
          10,
          22,
          false,
          'Steep approach',
          '2026-10-02',
        ],
        ['D-05', 'Chinatown Gate', 'Z3', 24, 8.75, true, '', '2026-10-15'],
        [
          'D-06',
          'Bugis Junction',
          'Z3',
          18,
          6.5,
          true,
          'Kiosk faulty',
          '2026-10-28',
          '',
        ],
        ['D-07', 'Kallang Wave', 'Z4', 14, 2.1, false, '', '2026-10-11'],
        ['D-08', 'Tiong Bahru Market', 'Z4', 12, 11.4, true, '', '2026-10-19'],
        ['D-09', 'Botanic Gate', 'Z5', 8, 30.2, false, '', '2026-10-05'],
        ['D-10', 'Esplanade Walk', 'Z5', 22, 1.9, true, '', '2026-10-25'],
      ],
    },
    {
      name: 'Usage',
      values: [
        ['dock_ref', 'avg_departures', 'occupancy_pct', 'bikes_present'],
        ['D-01', 9.6, 0.45, 9],
        ['D-02', 7.2, 0.5, 8],
        ['D-03', 3.4, 0.25, 3],
        ['D-04', 2.5, 0.3, 3],
        ['D-05', 12.8, 0.625, 15],
        // A whole number in a column of decimals.
        ['D-06', 5, 0.39, 7],
        // A percentage typed as text.
        ['D-07', 6.1, '36%', 5],
        ['D-08', 4.4, 0.75, 9],
        ['D-09', 1.6, 0.5, 4],
        // Full: 100% is the whole number 1.
        ['D-10', 11.2, 1, 22],
      ],
    },
    {
      name: 'Visits',
      values: [
        [
          'dock_ref',
          'crew',
          'swept_day',
          'swept_time',
          'van_day',
          'van_time',
          'lock_day',
          'lock_time',
        ],
        ['D-01', 'Alpha', 'Wed', at(18), 'Fri', at(10), 'Sun', at(20)],
        ['D-02', 'Alpha', 'Mon', at(9), 'Sat', at(14), 'Sat', at(12)],
        ['D-03', 'Bravo', 'Thu', at(6), 'Fri', at(10), 'Sun', at(20)],
        ['D-04', 'Bravo', 'Thu', at(8), 'Mon', at(7), 'Mon', at(6)],
        ['D-05', 'Alpha', 'Wed', at(18), 'Fri', at(10), 'Sun', at(20)],
        // Never swept.
        ['D-06', 'Charlie', '', '', 'Sat', at(14), 'Sun', at(20)],
        ['D-07', 'Charlie', 'Mon', at(9), 'Thu', at(7), 'Tue', at(18)],
        ['D-08', 'Bravo', 'Wed', at(18), 'Fri', at(10), 'Sun', at(20)],
        // A van day with no time.
        ['D-09', 'Alpha', 'Wed', at(18), 'Sat', '', 'Sun', at(20)],
        ['D-10', 'Charlie', 'Thu', at(6), 'Sat', at(14), 'Sun', at(20)],
      ],
    },
    {
      name: 'Zones',
      values: [
        ['zone_id', 'zone_label', 'surge_pct', 'cover_pct', 'base_fare'],
        ['Z1', 'Bayfront', '20%', '10%', 2.5],
        ['Z2', 'Hills', '10%', '10%', 3],
        ['Z3', 'Old town', 0.15, 0.2, 2.2],
        ['Z4', 'East', 0, 0.2, 1.8],
        // No base fare set yet.
        ['Z5', 'Gardens', '5%', '10%'],
      ],
    },
    {
      name: 'Crews',
      values: [
        ['crew_name', 'van_capacity', 'on_call'],
        ['Alpha', 24, true],
        ['Bravo', 12, false],
        ['Charlie', 8, true],
      ],
    },
  ]);

export const docksRead = (
  tabs: DataTab[] = docksTabs(),
  id = 'conformance',
): KeptRead => ({
  id,
  readAt: READ_AT,
  source: 'conformance',
  spreadsheet: { title: null, url: '' },
  tabs,
});

const tabIn = (tabs: DataTab[], name: string) =>
  tabs.find((tab) => tab.name === name)!.values;
const rowOf = (tabs: DataTab[], name: string, key: string) =>
  tabIn(tabs, name).find((row) => row[0] === key)!;

// D-07's zone is one the Zones tab does not list.
export function brokenLookupTabs(): DataTab[] {
  const tabs = docksTabs();
  rowOf(tabs, 'Docks', 'D-07')[2] = 'Z9';
  return tabs;
}

// D-03 listed twice in Usage, the second time straight after the first.
export function duplicateKeyTabs(): DataTab[] {
  const tabs = docksTabs();
  const usage = tabIn(tabs, 'Usage');
  usage.splice(4, 0, ['D-03', 3.4, 0.25, 4]);
  return tabs;
}

// Bikes present, whole numbers in the read a profile was made from, is a
// decimal in one row of a later read.
export function decimalTabs(): DataTab[] {
  const tabs = docksTabs();
  rowOf(tabs, 'Usage', 'D-05')[3] = 15.5;
  return tabs;
}

// D-08's average departures left blank.
export function blankDeparturesTabs(): DataTab[] {
  const tabs = docksTabs();
  rowOf(tabs, 'Usage', 'D-08')[1] = '';
  return tabs;
}

// A dock the data gains after the rules were accepted: D-01 again, as D-11.
export function gainedTabs(): DataTab[] {
  const tabs = docksTabs();
  for (const name of ['Docks', 'Usage', 'Visits']) {
    const row = rowOf(tabs, name, 'D-01');
    tabIn(tabs, name).push(['D-11', ...row.slice(1)]);
  }
  return tabs;
}

export const TEXT = `What this is for
Each week, plan for every dock how many bikes the van brings and the hire fare, so riders find a bike without docks overflowing.
A person approves every plan before it is used.

What we expect
Free space is the dock's capacity less the bikes present.
Expected departures are the dock's average departures raised by its area's surge.

Rules
1. Bring bikes in whole racks of 4.
2. Never bring more bikes than the crew's van holds.
3. Never bring more bikes than the dock has free space.
4. The bikes present plus the bikes brought should reach the expected departures plus the area's cover. If not, a person decides.
5. Only bring bikes when the van visit is before the lockout.
6. At the hillside docks, Ridge Road and Harbour Steps, the hire fare must not exceed 300 cents.
7. The hire fare must be at least the area's base fare.
8. If the last sweep was more than 48 hours before the data was read, flag the dock for a person to decide.
9. At docks without a kiosk, bring at most 8 bikes.`;

export const KEYS = [
  'D-01',
  'D-02',
  'D-03',
  'D-04',
  'D-05',
  'D-06',
  'D-07',
  'D-08',
  'D-09',
  'D-10',
];

// ---- What finding answers ---------------------------------------------------

type Found = {
  id: string;
  name: string;
  text: string;
  result: 'number' | 'check';
  consequence: 'block' | 'decide' | null;
  // How finding reads a check: stated for every dock, or only for some.
  applies_to: 'every' | 'some' | null;
};

const number = (id: string, name: string, text: string): Found => ({
  id,
  name,
  text,
  result: 'number',
  consequence: null,
  applies_to: null,
});
const rule = (
  id: string,
  name: string,
  text: string,
  consequence: 'block' | 'decide',
  applies_to: 'every' | 'some' = 'every',
): Found => ({ id, name, text, result: 'check', consequence, applies_to });

export const FOUND_DEFINITIONS: Found[] = [
  number(
    'free_space',
    'Free space',
    "The dock's capacity less the bikes present.",
  ),
  number(
    'expected_departures',
    'Expected departures',
    "The dock's average departures raised by its area's surge.",
  ),
  rule(
    'whole_racks',
    'Whole racks',
    'Bring bikes in whole racks of 4.',
    'block',
  ),
  rule(
    'van_holds',
    'Van holds',
    "Never bring more bikes than the crew's van holds.",
    'block',
  ),
  rule(
    'fits_free_space',
    'Fits free space',
    'Never bring more bikes than the dock has free space.',
    'block',
  ),
  rule(
    'covers_departures',
    'Covers departures',
    "The bikes present plus the bikes brought should reach the expected departures plus the area's cover.",
    'decide',
  ),
  rule(
    'van_before_lockout',
    'Van before lockout',
    'Only bring bikes when the van visit is before the lockout.',
    'block',
  ),
  rule(
    'hillside_fare_cap',
    'Hillside fare cap',
    'At the hillside docks the hire fare must not exceed 300 cents.',
    'block',
    'some',
  ),
  rule(
    'fare_floor',
    'Fare floor',
    "The hire fare must be at least the area's base fare.",
    'block',
  ),
  rule(
    'stale_sweep',
    'Stale sweep',
    'Flag a dock whose last sweep was more than 48 hours before the read.',
    'decide',
  ),
  rule(
    'no_kiosk_cap',
    'No kiosk cap',
    'At docks without a kiosk, bring at most 8 bikes.',
    'block',
    'some',
  ),
];

// Every sentence of TEXT, numbered as the engine splits it.
export const FOUND = {
  intent:
    'Plan the bikes the van brings and the hire fare for every dock each week.',
  definitions: FOUND_DEFINITIONS,
  sentences: [
    ...[1, 2, 3, 4].map((n) => ({ n, kind: 'context', definitions: [] })),
    { n: 5, kind: 'quantity', definitions: ['free_space'] },
    { n: 6, kind: 'quantity', definitions: ['expected_departures'] },
    { n: 7, kind: 'context', definitions: [] },
    ...FOUND_DEFINITIONS.slice(2).map((d, i) => ({
      n: 8 + i,
      kind: 'check',
      definitions: [d.id],
    })),
  ],
};

// ---- What each write answers ------------------------------------------------

const blankShape: Shape = {
  kind: 'limit',
  field: null,
  at: null,
  amount: null,
  base: null,
  compare: null,
  target: null,
  margin_pct: null,
  when: [],
  only_for_group: null,
  only_for_when: [],
};
export const shape = (more: Partial<Shape> & Pick<Shape, 'kind'>): Shape => ({
  ...blankShape,
  ...more,
});

type Example = {
  key: string;
  bikes?: number;
  fare?: number;
  result: number | boolean;
};

// An example as a model writes it: every field present, null where unread.
const examplesOf = (examples: Example[]) =>
  examples.map(({ key, bikes = null, fare = null, result }) => ({
    key,
    inputs: { bikes, fare },
    result,
    why: 'Worked out by hand.',
  }));

const RACK = { id: 'rack', value: 4, quote: 'whole racks of 4' };
const HILL_CAP = {
  id: 'hill_cap',
  value: 300,
  quote: 'must not exceed 300 cents',
};
const SWEEP_HOURS = {
  id: 'sweep_hours',
  value: 48,
  quote: 'more than 48 hours',
};
const NO_KIOSK_MOST = {
  id: 'no_kiosk_most',
  value: 8,
  quote: 'bring at most 8 bikes',
};
export const HILLSIDE = {
  id: 'hillside',
  keys: ['D-03', 'D-04'],
  quote: 'the hillside docks, Ridge Road and Harbour Steps',
};

export const SHAPES = {
  whole_racks: shape({ kind: 'step', field: 'bikes', amount: 'constant:rack' }),
  van_holds: shape({
    kind: 'limit',
    field: 'bikes',
    at: 'most',
    amount: 'column:team.van_capacity',
  }),
  fits_free_space: shape({
    kind: 'limit',
    field: 'bikes',
    at: 'most',
    amount: 'value:free_space',
  }),
  covers_departures: shape({
    kind: 'target',
    field: 'bikes',
    base: 'column:bikes_present',
    compare: 'reach',
    target: 'value:expected_departures',
    margin_pct: 'column:area.cover_pct',
  }),
  van_before_lockout: shape({
    kind: 'only_when',
    field: 'bikes',
    when: [{ left: 'moment:van', op: 'before', right: 'moment:lockout' }],
  }),
  hillside_fare_cap: shape({
    kind: 'limit',
    field: 'fare',
    at: 'most',
    amount: 'constant:hill_cap',
    only_for_group: 'hillside',
  }),
  fare_floor: shape({
    kind: 'limit',
    field: 'fare',
    at: 'least',
    amount: 'column:area.base_fare',
  }),
  stale_sweep: shape({
    kind: 'flag',
    when: [
      { left: 'hours_since:swept', op: '>', right: 'constant:sweep_hours' },
    ],
  }),
  no_kiosk_cap: shape({
    kind: 'limit',
    field: 'bikes',
    at: 'most',
    amount: 'constant:no_kiosk_most',
    only_for_when: [{ left: 'column:has_kiosk', op: 'is_no', right: null }],
  }),
} satisfies Record<string, Shape>;

// Each definition's answer, with examples worked out by hand from the data.
export const ANSWERS: Record<string, object> = {
  free_space: {
    constants: [],
    groups: [],
    formula: 'record.capacity - record.bikes_present',
    // 20 - 9, and 22 - 22.
    examples: examplesOf([
      { key: 'D-01', result: 11 },
      { key: 'D-10', result: 0 },
    ]),
  },
  expected_departures: {
    constants: [],
    groups: [],
    formula: 'record.avg_departures * (1.0 + area.surge_pct)',
    // 9.6 raised by Bayfront's 20%; 6.1 with East's 0%.
    examples: examplesOf([
      { key: 'D-01', result: 11.52 },
      { key: 'D-07', result: 6.1 },
    ]),
  },
  whole_racks: {
    constants: [RACK],
    groups: [],
    shape: SHAPES.whole_racks,
    none_fits: null,
    examples: examplesOf([
      { key: 'D-01', bikes: 4, result: true },
      { key: 'D-01', bikes: 6, result: false },
    ]),
  },
  van_holds: {
    constants: [],
    groups: [],
    shape: SHAPES.van_holds,
    none_fits: null,
    // Charlie's van holds 8.
    examples: examplesOf([
      { key: 'D-06', bikes: 8, result: true },
      { key: 'D-06', bikes: 12, result: false },
    ]),
  },
  fits_free_space: {
    constants: [],
    groups: [],
    shape: SHAPES.fits_free_space,
    none_fits: null,
    // D-08 holds 9 of 12.
    examples: examplesOf([
      { key: 'D-08', bikes: 3, result: true },
      { key: 'D-08', bikes: 4, result: false },
    ]),
  },
  covers_departures: {
    constants: [],
    groups: [],
    shape: SHAPES.covers_departures,
    none_fits: null,
    // 11.52 plus Bayfront's 10% cover is 12.672; D-01 has 9.
    examples: examplesOf([
      { key: 'D-01', bikes: 4, result: true },
      { key: 'D-01', bikes: 3, result: false },
    ]),
  },
  van_before_lockout: {
    constants: [],
    groups: [],
    shape: SHAPES.van_before_lockout,
    none_fits: null,
    // D-01's van comes Fri 10:00, before the Sun 20:00 lockout; D-02's
    // comes Sat 14:00, after its Sat 12:00 lockout.
    examples: examplesOf([
      { key: 'D-01', bikes: 4, result: true },
      { key: 'D-02', bikes: 4, result: false },
    ]),
  },
  hillside_fare_cap: {
    constants: [HILL_CAP],
    groups: [HILLSIDE],
    shape: SHAPES.hillside_fare_cap,
    none_fits: null,
    examples: examplesOf([
      { key: 'D-03', fare: 300, result: true },
      { key: 'D-03', fare: 301, result: false },
      { key: 'D-01', fare: 400, result: true },
    ]),
  },
  fare_floor: {
    constants: [],
    groups: [],
    shape: SHAPES.fare_floor,
    none_fits: null,
    // Bayfront's base fare is 2.50, 250 cents.
    examples: examplesOf([
      { key: 'D-01', fare: 250, result: true },
      { key: 'D-01', fare: 249, result: false },
    ]),
  },
  stale_sweep: {
    constants: [SWEEP_HOURS],
    groups: [],
    shape: SHAPES.stale_sweep,
    none_fits: null,
    // D-01 was swept 13.5 hours before the read; D-02 70.5.
    examples: examplesOf([
      { key: 'D-01', result: true },
      { key: 'D-02', result: false },
    ]),
  },
  no_kiosk_cap: {
    constants: [NO_KIOSK_MOST],
    groups: [],
    shape: SHAPES.no_kiosk_cap,
    none_fits: null,
    examples: examplesOf([
      { key: 'D-03', bikes: 8, result: true },
      { key: 'D-03', bikes: 9, result: false },
      { key: 'D-01', bikes: 12, result: true },
    ]),
  },
};

// ---- What the engine should make of it ----------------------------------------

// The profile the read suggests, column by column, in the order read.
export const PROFILE_COLUMNS = [
  ['dock_ref', 'text', false],
  ['dock_name', 'text', false],
  ['zone_code', 'text', false],
  ['capacity', 'whole_number', false],
  ['elevation_m', 'decimal', false],
  ['has_kiosk', 'yes_no', false],
  ['notes', 'text', true],
  ['last_inspected', 'date', false],
  ['retired_bikes', null, true],
  ['avg_departures', 'decimal', false],
  ['occupancy_pct', 'percent', false],
  ['bikes_present', 'whole_number', false],
  ['crew', 'text', false],
  ['swept_day', 'weekday', true],
  ['swept_time', 'time_of_day', true],
  ['van_day', 'weekday', false],
  ['van_time', 'time_of_day', true],
  ['lock_day', 'weekday', false],
  ['lock_time', 'time_of_day', false],
  ['area.zone_id', 'text', false],
  ['area.zone_label', 'text', false],
  ['area.surge_pct', 'percent', false],
  ['area.cover_pct', 'percent', false],
  ['area.base_fare', 'money', true],
  ['team.crew_name', 'text', false],
  ['team.van_capacity', 'whole_number', false],
  ['team.on_call', 'yes_no', false],
] as const;

/*
  Hours from the read to each moment, by dock: swept is the last sweep by
  the read (negative), lockout the last before Mon 9 Nov 06:00, van the
  first after the read; start is that Monday, 94.5 hours on.
*/
export const MOMENTS: Record<
  string,
  { swept?: number; lockout: number; van?: number }
> = {
  'D-01': { swept: -13.5, van: 26.5, lockout: 84.5 },
  'D-02': { swept: -70.5, van: 54.5, lockout: 52.5 },
  'D-03': { swept: -1.5, van: 26.5, lockout: 84.5 },
  'D-04': { swept: -167.5, van: 95.5, lockout: 94.5 },
  'D-05': { swept: -13.5, van: 26.5, lockout: 84.5 },
  'D-06': { van: 54.5, lockout: 84.5 },
  'D-07': { swept: -70.5, van: 167.5, lockout: -37.5 },
  'D-08': { swept: -13.5, van: 26.5, lockout: 84.5 },
  'D-09': { swept: -13.5, lockout: 84.5 },
  'D-10': { swept: -1.5, van: 54.5, lockout: 84.5 },
};
export const START_HOURS = 94.5;

// The two calculations on every dock: capacity less bikes present, and
// average departures raised by the area's surge.
export const CALCULATED: Record<
  string,
  { free_space: number; expected_departures: number }
> = {
  'D-01': { free_space: 11, expected_departures: 11.52 },
  'D-02': { free_space: 8, expected_departures: 8.64 },
  'D-03': { free_space: 9, expected_departures: 3.74 },
  'D-04': { free_space: 7, expected_departures: 2.75 },
  'D-05': { free_space: 9, expected_departures: 14.72 },
  'D-06': { free_space: 11, expected_departures: 5.75 },
  'D-07': { free_space: 9, expected_departures: 6.1 },
  'D-08': { free_space: 3, expected_departures: 4.4 },
  'D-09': { free_space: 4, expected_departures: 1.68 },
  'D-10': { free_space: 0, expected_departures: 11.76 },
};

// Each check's formula, as code should write it from its shape, on the
// profile first confirmed: a blank base fare skips, a blank sweep time
// fails, so a sweep with either blank fails; nothing is said of van times.
export const FORMULAS = {
  whole_racks: 'bikes == 0 || (bikes % int(double(constants.rack)) == 0)',
  van_holds:
    'bikes == 0 || (has(team.van_capacity) && (double(bikes) <= double(team.van_capacity)))',
  fits_free_space: 'bikes == 0 || (double(bikes) <= double(values.free_space))',
  // A percent column is a fraction already: 10% is 0.1.
  covers_departures:
    '((has(record.bikes_present)) && (has(area.cover_pct)) && (double(record.bikes_present) + double(bikes) >= double(values.expected_departures) * (1.0 + double(area.cover_pct))))',
  van_before_lockout:
    'bikes == 0 || ((has(record.moment__van)) && (has(record.moment__lockout)) && (record.moment__van < record.moment__lockout))',
  // The fare has no value meaning nothing: no proposal of it is let through.
  hillside_fare_cap:
    '!(key in groups.hillside) || (double(fare) <= double(constants.hill_cap))',
  fare_floor:
    '!(has(area.base_fare)) || (double(fare) >= double(area.base_fare))',
  stale_sweep:
    '(has(record.moment__swept) && (!((0.0 - record.moment__swept) > double(constants.sweep_hours))))',
  no_kiosk_cap:
    '!(!record.has_kiosk) || bikes == 0 || (has(record.has_kiosk) && (double(bikes) <= double(constants.no_kiosk_most)))',
};

// Once a person says a blank sweep time means the rule does not apply.
export const STALE_SWEEP_SKIPPED =
  '!(has(record.moment__swept)) || (!((0.0 - record.moment__swept) > double(constants.sweep_hours)))';

// The sentence a person approves for each, in the process's words.
export const SENTENCES = {
  whole_racks:
    'The proposed bikes to bring must be a whole multiple of 4 (“whole racks of 4”). Proposing 0 bikes is always allowed.',
  van_holds:
    'The proposed bikes to bring must be at most the team van capacity. Proposing 0 bikes is always allowed.',
  fits_free_space:
    'The proposed bikes to bring must be at most the free space. Proposing 0 bikes is always allowed.',
  covers_departures:
    'The bikes present plus the proposed bikes to bring should reach the expected departures plus the area cover pct. Otherwise a person decides.',
  van_before_lockout:
    'The proposed bikes to bring is allowed only when the van visit is before the lockout. Proposing 0 bikes is always allowed. Where the van visit is blank, it fails.',
  hillside_fare_cap:
    'For docks in “the hillside docks, Ridge Road and Harbour Steps” only: the proposed hire fare must be at most 300 (“must not exceed 300 cents”).',
  fare_floor:
    'The proposed hire fare must be at least the area base fare. Where the area base fare is blank, it does not apply.',
  stale_sweep:
    'Flag it for a person when the hours from the last sweep to when the data is read is more than 48 (“more than 48 hours”). Where the last sweep is blank, it fails.',
  no_kiosk_cap:
    'For docks where the has kiosk is no only: the proposed bikes to bring must be at most 8 (“bring at most 8 bikes”). Proposing 0 bikes is always allowed.',
};

/*
  Proposed values and the checks each fails on the accepted rulebook (blank
  sweeps and base fares skip, blank van times fail), worked out by hand:

  dock  present free van  kiosk base  cover target   van<lock swept
  D-01   9      11   24   yes   250   10%   12.672   yes      13.5
  D-02   8       8   24   yes   250   10%    9.504   no       70.5
  D-03   3       9   12   no    300   10%    4.114   yes       1.5  hillside
  D-05  15       9   24   yes   220   20%   17.664   yes      13.5
  D-06   7      11    8   yes   220   20%    6.9     yes      blank
  D-09   4       4   24   no    blank 10%    1.848   blank    13.5
  D-10  22       0    8   yes   blank 10%   12.936   yes       1.5
*/
export const VERDICTS: {
  key: string;
  values: Record<string, number>;
  verdict: 'ready' | 'decide' | 'blocked';
  failing: string[];
}[] = [
  // 9 + 4 = 13 reaches 12.672; 260 is over the 250 floor.
  {
    key: 'D-01',
    values: { bikes: 4, fare: 260 },
    verdict: 'ready',
    failing: [],
  },
  // The van comes after the lockout, and the sweep is 70.5 hours old.
  {
    key: 'D-02',
    values: { bikes: 4, fare: 250 },
    verdict: 'blocked',
    failing: ['van_before_lockout', 'stale_sweep'],
  },
  // Nothing brought gets past the lockout, but 8 falls short of 9.504.
  {
    key: 'D-02',
    values: { bikes: 0, fare: 250 },
    verdict: 'decide',
    failing: ['covers_departures', 'stale_sweep'],
  },
  // Over the hillside cap of 300.
  {
    key: 'D-03',
    values: { bikes: 4, fare: 320 },
    verdict: 'blocked',
    failing: ['hillside_fare_cap'],
  },
  // 12 fits Bravo's van of 12, but not 9 free spaces, nor 8 without a kiosk.
  {
    key: 'D-03',
    values: { bikes: 12, fare: 300 },
    verdict: 'blocked',
    failing: ['fits_free_space', 'no_kiosk_cap'],
  },
  // 15 present against 14.72 plus a 20% cover, 17.664: short.
  {
    key: 'D-05',
    values: { bikes: 0, fare: 220 },
    verdict: 'decide',
    failing: ['covers_departures'],
  },
  // 6 is not whole racks of 4.
  {
    key: 'D-05',
    values: { bikes: 6, fare: 220 },
    verdict: 'blocked',
    failing: ['whole_racks'],
  },
  // Charlie's van holds 8 and there are 11 spaces.
  {
    key: 'D-06',
    values: { bikes: 12, fare: 220 },
    verdict: 'blocked',
    failing: ['van_holds', 'fits_free_space'],
  },
  // No van time: the van visit cannot be put before the lockout.
  {
    key: 'D-09',
    values: { bikes: 4, fare: 100 },
    verdict: 'blocked',
    failing: ['van_before_lockout'],
  },
  // Full, and no base fare set: nothing fails.
  { key: 'D-10', values: { bikes: 0, fare: 0 }, verdict: 'ready', failing: [] },
];

// Rules on a dated moment: hours since it, and before the read or start.
export const DATED_SHAPES = {
  overdue: shape({
    kind: 'flag',
    when: [
      {
        left: 'hours_since:inspected',
        op: '>',
        right: 'constant:inspect_hours',
      },
    ],
  }),
  inspected_first: shape({
    kind: 'only_when',
    field: 'bikes',
    when: [{ left: 'moment:inspected', op: 'before', right: 'moment:read' }],
  }),
  inspected_before_start: shape({
    kind: 'only_when',
    field: 'bikes',
    when: [{ left: 'moment:inspected', op: 'before', right: 'moment:start' }],
  }),
} satisfies Record<string, Shape>;
