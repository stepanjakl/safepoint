// Placeholder process chrome. Nothing here is produced by the engine yet: it
// describes the shape the surrounding application would supply, so the review
// can be seen in the context it will actually appear in.
//
// `instructionsVersion` on a run is not decoration. The review contract already
// binds a decision to an exact revision, and instructions are the other input
// that can move underneath a result -- a run evaluated under older instructions
// is not comparable to one evaluated under the current set, and the list says so.

import type { SystemLink } from './system-links';

export type ProcessRun = {
  id: string;
  label: string;
  summary: string;
  instructionsVersion: string;
  current?: boolean;
};

export type ProcessSummary = {
  name: string;
  trigger: string;
  // Where this process would write. Mirrors the destinations the effect planner
  // already names, rather than inventing a second vocabulary. Sources are not
  // here: they are derived from the evidence the run actually cited.
  destinations: SystemLink[];
  instructions: {
    version: string;
    updatedAt: string;
    body: string[];
  };
  runs: ProcessRun[];
};

export const promotionProcess: ProcessSummary = {
  name: 'Promotion release',
  trigger: 'Weekly · Thursday 09:00 · Europe/London',
  destinations: [
    {
      id: 'pricebook',
      label: 'Pricebook',
      icon: 'pricebook',
      direction: 'writes',
    },
    {
      id: 'storefront',
      label: 'Storefront',
      icon: 'storefront',
      direction: 'writes',
    },
    { id: 'labels', label: 'Label queue', icon: 'labels', direction: 'writes' },
    {
      id: 'portal',
      label: 'Supplier portal',
      icon: 'portal',
      direction: 'writes',
    },
  ],
  instructions: {
    version: 'v4',
    updatedAt: 'Updated 2 Sep 2026',
    body: [
      'Evaluate every shortlisted candidate against the recorded promotion brief and the current pricebook.',
      'Propose a promotional price, a top-up quantity and a promotion window for each candidate that clears policy.',
      'Hold any candidate whose projected margin falls below the floor, and any candidate whose supporting evidence is unavailable or out of date.',
      'Never apply a change. Produce a release plan for a person to review.',
    ],
  },
  runs: [
    {
      id: 'run-104',
      label: 'Thu 4 Sep · 09:00',
      summary: '27 items · 4 blocked',
      instructionsVersion: 'v4',
      current: true,
    },
    {
      id: 'run-103',
      label: 'Thu 28 Aug · 09:00',
      summary: '26 items · 2 blocked',
      instructionsVersion: 'v4',
    },
    {
      id: 'run-102',
      label: 'Thu 21 Aug · 09:00',
      summary: '26 items · nothing blocked',
      instructionsVersion: 'v3',
    },
    {
      id: 'run-101',
      label: 'Thu 14 Aug · 09:00',
      summary: '24 items · 1 blocked',
      instructionsVersion: 'v3',
    },
  ],
};

export const supportProcess: ProcessSummary = {
  name: 'Support handoff',
  trigger: 'Daily · 09:00 · Europe/London',
  destinations: [
    { id: 'queue', label: 'Support queue', icon: 'queue', direction: 'writes' },
    {
      id: 'identity',
      label: 'Identity records',
      icon: 'identity',
      direction: 'writes',
    },
    { id: 'billing', label: 'Billing', icon: 'billing', direction: 'writes' },
  ],
  instructions: {
    version: 'v2',
    updatedAt: 'Updated 1 Sep 2026',
    body: [
      'Review the overnight support queue and propose a receiving team for each open case.',
      'Draft a customer reply only where the case already carries a verified identity record.',
      'Hold any case whose identity evidence is missing, and any refund above the agent limit.',
      'Never move a case or send a message. Produce a handoff plan for a person to review.',
    ],
  },
  runs: [
    {
      id: 'run-42',
      label: 'Mon 7 Sep · 09:00',
      summary: '4 cases · 1 blocked',
      instructionsVersion: 'v2',
      current: true,
    },
    {
      id: 'run-41',
      label: 'Sun 6 Sep · 09:00',
      summary: '6 cases · nothing blocked',
      instructionsVersion: 'v2',
    },
    {
      id: 'run-40',
      label: 'Sat 5 Sep · 09:00',
      summary: '3 cases · 1 blocked',
      instructionsVersion: 'v1',
    },
  ],
};
