import type { DataShape, DefinitionSubject } from '@/lib/engine/subject';
import type { SystemLink } from '@/lib/shell/system-links';
import type { SourceUse } from '@/lib/sources/model';

/*
  What the Brunch orders processes read and write: the sheet's tabs, how the
  data is shaped, and what a proposal sets. Both processes share it.
*/

// Where a product's columns are, and the category parameters it reaches. The
// spreadsheet has other tabs, from the Brunch weekend experiment; they are not
// this process's data and are left out.
const DATA = {
  records: {
    tabs: ['Products', 'Stock', 'Sales', 'Deliveries'],
    key: 'sku',
    name: 'product',
  },
  lookups: [
    { tab: 'Parameters', key: 'category', via: 'category', as: 'category' },
  ],
  types: {
    ripe: { kind: 'yes_no' },
    counted_day: { kind: 'weekday' },
    counted_time: { kind: 'time_of_day' },
    // Optional: a sheet without it is read by the weekday and time alone.
    counted_at: { kind: 'datetime', timeZone: 'Europe/London' },
    delivery_day: { kind: 'weekday' },
    delivery_time: { kind: 'time_of_day' },
    cutoff_day: { kind: 'weekday' },
    cutoff_time: { kind: 'time_of_day' },
  },
  output: { tab: 'Orders', key: 'sku' },
  // The promotion's opening, as the instructions state it.
  timing: {
    timeZone: 'Europe/London',
    opens: { day: 'Sat', minutes: 7 * 60 },
    since: {
      count_age_hours: {
        at: 'counted_at',
        day: 'counted_day',
        time: 'counted_time',
        kind: 'observed',
      },
    },
    until: {
      hours_until_cutoff: { day: 'cutoff_day', time: 'cutoff_time' },
    },
    moments: {
      counted: {
        at: 'counted_at',
        day: 'counted_day',
        time: 'counted_time',
        kind: 'observed',
        label: 'stock count',
      },
      cutoff: {
        day: 'cutoff_day',
        time: 'cutoff_time',
        kind: 'deadline',
        label: 'supplier’s cutoff',
      },
      delivery: {
        day: 'delivery_day',
        time: 'delivery_time',
        kind: 'next',
        label: 'delivery',
      },
    },
  },
} satisfies DataShape;

// The tabs a run reads.
export const DATA_TABS = [
  ...DATA.records.tabs,
  ...DATA.lookups.map((lookup) => lookup.tab),
];

// The sheet's tabs this process reads and the one it writes. What they hold is
// the source's to say (lib/sources); what the process makes of them is DATA.
export const SHEET_USE: SourceUse = {
  source: 'brunch-store-sheet',
  inputs: DATA_TABS,
  outputs: [DATA.output.tab],
};

// The same tabs as the process's inputs, for the header's count.
export const SHEET_INPUTS: SystemLink[] = DATA_TABS.map((tab) => ({
  id: tab,
  label: tab,
  icon: 'sheet',
  direction: 'input',
  file: `Google Sheet · ${tab}`,
}));

// What its definitions are worked out for, and what a proposal sets.
export const SUBJECT: DefinitionSubject = {
  record: { singular: 'product', plural: 'products' },
  data: DATA,
  // Ordering nothing is always open to a person: no rule can forbid it.
  proposal: [{ id: 'order', label: 'order', unit: 'units', none: 0, min: 0 }],
  reader: 'store owner',
};
