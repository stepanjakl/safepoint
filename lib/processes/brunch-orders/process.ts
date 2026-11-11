import type {
  DataShape,
  DefinitionSubject,
  ProcessStep,
  ProcessSummary,
} from '@/lib/process/model';
import type { DefinitionProcess } from '@/lib/definitions/types';
import type { SystemLink } from '@/lib/process/system-links';
import type { SourceUse } from '@/lib/sources/model';
import type { ReleasePlan } from '@/lib/review/plan-contract';

/*
  Brunch orders: the order proposal, built one step at a time from its purpose
  (docs/processes/brunch-orders/PLAN.md). The sheet holds data only; everything else --
  the intent, the promotion, how demand is worked out, the rules -- is in the
  instructions, versioned like every process's.
*/

export const BRUNCH_ORDERS_ID = 'brunch-orders';
export const BRUNCH_ORDERS_HREF = '/examples/brunch-orders';
// The same orders worked out by the model on every run, with no rulebook: the
// quicker demo, as nothing has to be drafted and approved first.
const BRUNCH_ORDERS_DIRECT_ID = 'brunch-orders-direct';
export const BRUNCH_ORDERS_DIRECT_HREF = '/examples/brunch-orders-direct';

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

// What the definitions engine (lib/definitions) works for.
export const BRUNCH_ORDERS_DEFINITIONS: DefinitionProcess = {
  id: BRUNCH_ORDERS_ID,
  subject: SUBJECT,
};

// The same subject with no rulebook: its proposals and writes are kept apart.
export const BRUNCH_ORDERS_DIRECT_DEFINITIONS: DefinitionProcess = {
  id: BRUNCH_ORDERS_DIRECT_ID,
  subject: SUBJECT,
};

// The first version, kept so a run started under it can still show it.
const INSTRUCTIONS_V1 = `Intent. Propose how many units of each product to order for the coming Brunch weekend, so the store has enough for expected demand without waste. Every proposal is checked against the rules below and approved by a person before anything is ordered.

The promotion. The Brunch weekend runs every weekend from Saturday 07:00 to Sunday 22:00, UK time; each run plans the coming weekend. Its idea is to make it easy to have avocado toast at home. Prefer availability without waste: ripe avocados don't last.

Expected demand. A product's expected demand for the weekend is the average of its sales over the last four weekends, raised by its uplift and rounded up to whole units. The uplift is 40% for products on offer (eggs, cherry tomatoes, rocket), 10% for the avocado toast kit's ingredients (sourdough, ripe avocados, feta) and 15% for everything else. Each of the kit's ingredients also needs one unit for every kit expected: 40 kits.

Rules.
1. Order quantities must be whole cases.
2. Don't order more than the supplier's maximum.
3. Anything we order must arrive before the promotion starts.
4. Stock plus the order should cover expected demand plus the category's safety stock; when it can't, a person decides.`;

const INSTRUCTIONS_V2 = `What this is for
Each week, suggest how many of each product to order for the coming Brunch weekend, so we have enough for what we expect to sell without overstocking. A person checks and approves every order before it is placed.

The promotion
Brunch weekend runs every Saturday from 07:00 to Sunday 22:00. The idea is to make avocado toast at home easy. We sell an avocado toast kit (a sourdough loaf, a pack of ripe avocados and a pack of feta), and eggs, cherry tomatoes and rocket are on offer. Ripe avocados don't keep, so don't order more than we'll sell.

How much we expect to sell
Start from each product's average over the last four weekends. Products on offer sell about 40% more, the kit's ingredients about 10% more, and everything else about 15% more. We expect to sell about 40 kits, and each one uses a loaf, a pack of avocados and a pack of feta on top of their own sales. Round up to whole units.

Rules
1. Order in whole cases.
2. Never order more than the supplier can deliver.
3. Only order what arrives before Saturday's opening.
4. Aim for enough stock to cover expected sales plus the category's safety margin. If that isn't possible, flag it for a person to decide.`;

const INSTRUCTIONS = `What this is for
Each week, suggest how many of each product to order for the coming Brunch weekend, so we have enough for what we expect to sell without overstocking. A person checks and approves every order before it is placed.

The promotion
Brunch weekend runs every Saturday from 07:00 to Sunday 22:00. The idea is to make avocado toast at home easy. We sell an avocado toast kit (a sourdough loaf, a pack of ripe avocados and a pack of feta), and eggs, cherry tomatoes and rocket are on offer. Ripe avocados don't keep.

How much we expect to sell
Start from each product's average over the last four weekends. Products on offer sell about 40% more, the kit's ingredients about 10% more, and everything else about 15% more. We expect to sell about 40 kits, and each one uses a loaf, a pack of avocados and a pack of feta on top of their own sales. Round up to whole units.

What we have
Stock available is what we have on hand, less what is reserved, plus what arrives before the start.

Rules
1. Order in whole cases.
2. Never order more than the supplier can deliver.
3. Only order what arrives before Saturday's opening.
4. Only order what can still be placed before the supplier's cutoff for this weekend.
5. Aim for enough stock available to cover expected sales plus the category's safety margin. If that isn't possible, flag it for a person to decide.
6. If a product's stock count is older than its category allows, flag it for a person to decide, even when nothing is ordered.
7. Stock available plus the order must not exceed the ripe avocados we expect to sell.`;

// The direct process's own instructions, from its first version: the same
// words as the rulebook one's v3 when it began, kept apart so each can change.
const DIRECT_INSTRUCTIONS = `What this is for
Each week, suggest how many of each product to order for the coming Brunch weekend, so we have enough for what we expect to sell without overstocking. A person checks and approves every order before it is placed.

The promotion
Brunch weekend runs every Saturday from 07:00 to Sunday 22:00. The idea is to make avocado toast at home easy. We sell an avocado toast kit (a sourdough loaf, a pack of ripe avocados and a pack of feta), and eggs, cherry tomatoes and rocket are on offer. Ripe avocados don't keep.

How much we expect to sell
Start from each product's average over the last four weekends. Products on offer sell about 40% more, the kit's ingredients about 10% more, and everything else about 15% more. We expect to sell about 40 kits, and each one uses a loaf, a pack of avocados and a pack of feta on top of their own sales. Round up to whole units.

What we have
Stock available is what we have on hand, less what is reserved, plus what arrives before the start.

Rules
1. Order in whole cases.
2. Never order more than the supplier can deliver.
3. Only order what arrives before Saturday's opening.
4. Only order what can still be placed before the supplier's cutoff for this weekend.
5. Aim for enough stock available to cover expected sales plus the category's safety margin. If that isn't possible, flag it for a person to decide.
6. If a product's stock count is older than its category allows, flag it for a person to decide, even when nothing is ordered.
7. Stock available plus the order must not exceed the ripe avocados we expect to sell.`;

// Each step of a run, in order. The thread sets each one's status from the
// run's progress; the phase in each label says which part of the plan brings
// a step that is not built yet.
export const ORDER_STEPS: ProcessStep[] = [
  {
    id: 'instructions',
    name: 'Instructions',
    status: 'complete',
    origin: 'manual',
  },
  { id: 'read', name: 'Read the sheet', status: 'attention' },
  {
    id: 'rules',
    name: 'Rules',
    label: 'From the instructions',
    status: 'pending',
  },
  {
    id: 'calculate',
    name: 'Calculate',
    label: 'From the rules',
    status: 'pending',
  },
  {
    id: 'propose',
    name: 'Propose',
    label: 'From the values',
    status: 'pending',
  },
  {
    id: 'apply',
    name: 'Apply',
    label: 'To the Orders tab',
    status: 'pending',
  },
];

// What each step not built yet will do, in place of its body.
export const COMING: Record<string, string> = {
  rules:
    'The rules found in the instructions, each turned into a check and approved on its own against worked examples.',
  calculate:
    'Expected demand, stock available before the start and what is required, worked out for every product.',
  propose:
    'What to set for every record, why, and how the accepted checks find it, for a person to approve, change or reject.',
  apply:
    'What the decided proposal writes to the sheet, cell by cell, before and after.',
};

export const brunchOrdersProcess: ProcessSummary = {
  id: BRUNCH_ORDERS_ID,
  name: 'Brunch orders',
  evaluation: 'rules',
  schedule: {
    enabled: false,
    cadence: 'weekly',
    day: 'Thursday',
    time: '08:45',
    timezone: 'Europe/London',
  },
  outputs: [
    {
      id: 'orders',
      label: 'Orders',
      api: 'Google Sheets, Orders tab',
      undo: 'Undo from the run while the written cells are untouched.',
      icon: 'supply',
      direction: 'output',
      mode: 'live_sandbox',
    },
  ],
  instructions: {
    version: 'v3',
    updatedAt: 'Written 30 Oct 2026',
    author: 'Project owner',
    note: 'Two rules for what a read of the sheet cannot show by itself: the supplier cutoff and the age of a stock count. The ripe avocado limit moves into the numbered rules.',
    promptedBy: null,
    changes: [
      'Orders must be placed before the supplier’s cutoff for this weekend.',
      'A stock count older than its category allows is flagged for a person.',
      'The ripe avocado limit is now a numbered rule: a draft missed it in the prose.',
      'Stock available is defined once, so every rule counts it the same way.',
    ],
    text: INSTRUCTIONS,
    previous: [
      {
        version: 'v2',
        updatedAt: 'Written 8 Oct 2026',
        author: 'Project owner',
        note: 'Plain words, and the kit described here now that the sheet holds data only.',
        promptedBy: null,
        changes: [
          'Rewritten in plain words, with only what matters.',
          'The kit is described here: the Kit tab is gone from the sheet.',
          'The rules say when to flag an order for a person.',
        ],
        text: INSTRUCTIONS_V2,
      },
      {
        version: 'v1',
        updatedAt: 'Written 8 Oct 2026',
        author: 'Project owner',
        note: 'The first version: the intent, the promotion, expected demand and four rules.',
        promptedBy: null,
        changes: [],
        text: INSTRUCTIONS_V1,
      },
    ],
  },
  steps: ORDER_STEPS,
  analysis: { summary: '', observations: [] },
  itemNoun: 'product',
  runs: [],
};

// Its steps: no rulebook to draft, so nothing to calculate from; the model
// proposes straight from the instructions and the sheet.
const DIRECT_ORDER_STEPS: ProcessStep[] = ORDER_STEPS.filter(
  (step) => step.id !== 'rules' && step.id !== 'calculate',
).map((step) =>
  step.id === 'propose' ? { ...step, label: 'From the instructions' } : step,
);

export const brunchOrdersDirectProcess: ProcessSummary = {
  ...brunchOrdersProcess,
  id: BRUNCH_ORDERS_DIRECT_ID,
  evaluation: 'model',
  instructions: {
    version: 'v1',
    updatedAt: 'Written 5 Nov 2026',
    author: 'Project owner',
    note: 'The first version, for a process with no rulebook: a model works every run out from these instructions.',
    promptedBy: null,
    changes: [],
    text: DIRECT_INSTRUCTIONS,
    previous: [],
  },
  steps: DIRECT_ORDER_STEPS,
};

// The release menu is not fed by proposals yet, so it says the plan is incomplete
// rather than empty.
export const brunchOrdersPlan: ReleasePlan = {
  id: BRUNCH_ORDERS_ID,
  revision: 'phase-1',
  title: 'Brunch orders',
  source: 'Brunch orders · in development',
  context: 'Built step by step; writes to the sheet only once approved.',
  evaluatedAt: '2026-10-08T12:00:00Z',
  mode: 'live',
  noun: { one: 'product', other: 'products' },
  reviewLabel: 'Review the orders',
  reasons: [],
  effects: [],
  status: { kind: 'incomplete', step: 1, of: 7 },
};

export const brunchOrdersDirectPlan: ReleasePlan = {
  ...brunchOrdersPlan,
  id: BRUNCH_ORDERS_DIRECT_ID,
};
