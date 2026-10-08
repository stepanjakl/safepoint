import type { ProcessSummary } from '@/lib/process/model';
import type { ReleasePlan } from '@/lib/review/plan-contract';
import type { MayChange } from '@/lib/rulebook/schema';

/*
  Brunch weekend, built in the open (docs/SHEET-PROCESS-PLAN.md). Development
  only until the plan says otherwise. Its one run is the build itself: each
  step of the eventual process is shown, the ones under trial with their trial,
  the rest pending with a line on what they will do.
*/

export const BRUNCH_PROCESS_ID = 'avocado-toast';
export const BRUNCH_HREF = '/examples/avocado-toast';

// What a proposal may change: the agent's write authority, set here by the
// process owner and never read from the sheet. Drafting maps each onto the
// sheet's data; a rulebook that adds or drops one is refused.
export const BRUNCH_MAY_CHANGE: MayChange[] = [
  {
    name: 'order_units',
    applies_to: 'each product',
    type: 'whole_number',
    starts_as: '0',
    meaning: 'Units to order as a final top-up for the weekend.',
  },
  {
    name: 'offer_price',
    applies_to: 'each product with an offer',
    type: 'money',
    starts_as: 'the offer price in the brief',
    meaning: 'The promotional shelf price.',
  },
  {
    name: 'kit_price',
    applies_to: 'the kit',
    type: 'money',
    starts_as: 'the kit price in the brief',
    meaning: 'The price of the Avo toast kit.',
  },
  {
    name: 'kit_limit',
    applies_to: 'the kit',
    type: 'whole_number',
    starts_as: 'the number of kits expected to sell',
    meaning: 'How many kits to put out over the weekend.',
  },
];

export const brunchProcess: ProcessSummary = {
  id: BRUNCH_PROCESS_ID,
  name: 'Brunch weekend',
  schedule: {
    enabled: false,
    cadence: 'weekly',
    day: 'Thursday',
    time: '08:45',
    timezone: 'Europe/London',
  },
  outputs: [
    {
      id: 'proposed-orders',
      label: 'Proposed orders',
      api: 'Google Sheets, Proposed orders tab (Phase 5)',
      undo: 'Preview only. Nothing is written yet.',
      icon: 'supply',
      direction: 'output',
      mode: 'preview_only',
    },
    {
      id: 'offer-prices',
      label: 'Offer prices',
      api: 'Google Sheets, Offers tab (Phase 5)',
      undo: 'Preview only. Nothing is written yet.',
      icon: 'pricebook',
      direction: 'output',
      mode: 'preview_only',
    },
  ],
  instructions: {
    version: 'v0',
    updatedAt: 'Drafted 3 Oct 2026',
    author: 'Project owner',
    note: 'Draft. The process is being built step by step; each step shows its own trial.',
    promptedBy: null,
    changes: [],
    text: `Plan the store's Brunch weekend: an avocado toast kit and a few single-item offers.

Read the store's sheet: products, stock, sales, deliveries, the promotion, its parameters and its rules.

Propose orders and prices for every product and for the kit. Explain uncertainty and cite the cells you relied on.

Never change the sheet. Produce a plan for a person to review.`,
    previous: [],
  },
  steps: [
    {
      id: 'request',
      name: 'Request',
      label: 'Brunch weekend · built in the open',
      status: 'complete',
      origin: 'manual',
    },
    {
      id: 'read',
      name: 'Read the sheet',
      label: 'Composio · one read per run',
      status: 'attention',
      note: 'Press "Read the sheet"; every later step uses this read.',
    },
    {
      id: 'rules',
      name: 'Rulebook',
      label: 'The approved version in force',
      status: 'attention',
      note: 'Drafted, tested and approved in the Rulebook tab.',
    },
    {
      id: 'calculate',
      name: 'Calculate',
      label: 'Facts for every item',
      status: 'attention',
      note: 'Press "Calculate" after reading the sheet.',
    },
    { id: 'propose', name: 'Propose', label: 'Phase 4', status: 'pending' },
    {
      id: 'check',
      name: 'Check',
      label: 'Rules and the owner’s checks',
      status: 'attention',
      note: 'Shows what Calculate found, item by item.',
    },
    { id: 'review', name: 'Review', label: 'Phase 2', status: 'pending' },
    { id: 'apply', name: 'Apply', label: 'Phase 5', status: 'pending' },
  ],
  analysis: {
    summary: 'Nothing has been analysed yet: the run is the build itself.',
    observations: [],
  },
  itemNoun: 'item',
  runs: [
    {
      id: 'build',
      startedAt: '2026-10-03T19:00:00Z',
      status: 'running',
      trigger: 'manual',
      counts: { items: 0 },
      instructionsVersion: 'v0',
      current: true,
    },
  ],
};

// No items exist until Phase 1, so the plan is honestly incomplete: the menu
// shows that rather than "no items".
export const brunchPlan: ReleasePlan = {
  id: BRUNCH_PROCESS_ID,
  revision: 'build-0',
  title: 'Brunch weekend',
  source: 'Brunch weekend · in development',
  context: 'Built step by step; nothing is evaluated yet.',
  evaluatedAt: '2026-10-03T19:00:00Z',
  mode: 'live',
  noun: { one: 'item', other: 'items' },
  reviewLabel: 'Review the plan',
  reasons: [],
  effects: [],
  status: { kind: 'incomplete', step: 2, of: 8 },
};

// What each pending step will do, shown in place of a box until it exists.
export const PENDING_STEPS: Record<string, string> = {
  propose:
    'The agent proposes orders and prices for every item, cites the cells it relied on and says what it is unsure about.',
  review: 'Approve, edit within a shown safe range, or reject each item.',
  apply:
    'Writes approved changes back to the sheet with a check before and after, and undo.',
};
