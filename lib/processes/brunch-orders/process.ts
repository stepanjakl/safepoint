import type { DefinitionProcess } from '@/lib/engine/types';
import type { ProcessSummary } from '@/lib/shell/model';
import type { ReleasePlan } from '@/lib/shell/plan-contract';

import { SUBJECT } from './data';
import { DIRECT_ORDER_STEPS, ORDER_STEPS } from './steps';

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

// What the definitions engine (lib/engine) works for.
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
