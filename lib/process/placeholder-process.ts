// Placeholder process chrome. Nothing here is produced by the engine yet: it
// describes the shape the surrounding application would supply, so the review
// can be seen in the context it will actually appear in.
//
// `instructionsVersion` on a run is not decoration. The review contract already
// binds a decision to an exact revision, and instructions are the other input
// that can move underneath a result -- a run evaluated under older instructions
// is not comparable to one evaluated under the current set, and the list says so.

import type { SystemLink } from './system-links';

// A step in the run's thread. The thread is the process made visible: the
// request that started it, what it worked out, and what it produced. Status is
// the step's own outcome, not the plan's -- a step can complete and still hand
// back something that needs attention.
export type StepStatus =
  'complete' | 'attention' | 'blocked' | 'running' | 'pending';

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  complete: 'Complete',
  attention: 'Needs attention',
  blocked: 'Blocked',
  running: 'Running',
  pending: 'Not started',
};

export type ProcessStep = {
  id: string;
  name: string;
  // A short fact that earns its place beside the name: how long, how many,
  // against what. Never a restatement of the status, which the dot carries.
  label?: string;
  status: StepStatus;
  // Extra detail for the marker's tooltip, where the status word alone is not
  // enough to say why the step ended as it did.
  note?: string;
};

// What the run worked out before it proposed anything. Placeholder: the engine
// does not publish its analysis yet, and the shape here is the one the thread
// would render if it did.
export type ProcessAnalysis = {
  summary: string;
  observations: string[];
};

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
  // Ordered. The thread renders in this order and the page supplies each
  // step's box by id, so adding a step is a change here and nowhere else.
  steps: ProcessStep[];
  analysis: ProcessAnalysis;
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
  steps: [
    {
      id: 'request',
      name: 'Request',
      label: 'Thu 4 Sep · 09:00',
      status: 'complete',
      note: 'Raised by the weekly schedule, not by a person.',
    },
    {
      id: 'analysis',
      name: 'Initial analysis',
      label: '27 candidates · 9 sources',
      status: 'attention',
      note: 'Two sources were stale at read time and one was partly unavailable.',
    },
    {
      id: 'review',
      name: 'Release review',
      label: 'Awaiting a reviewer',
      status: 'attention',
      note: 'Nothing is applied until a person approves it.',
    },
  ],
  analysis: {
    summary:
      'Read the shortlist against the current pricebook and the recorded brief, then priced every candidate that clears policy. Four candidates could not be priced at all, and six need a decision that is not mine to make.',
    observations: [
      'Demand forecast and supply position agree on 21 of 27 candidates.',
      'Supplier funding covers the margin shortfall on 3 candidates; the rest fall back to the floor.',
      'Two evidence packs were older than the policy window, so their candidates are held rather than priced.',
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
  steps: [
    {
      id: 'request',
      name: 'Request',
      label: 'Mon 7 Sep · 09:00',
      status: 'complete',
    },
    {
      id: 'analysis',
      name: 'Initial analysis',
      label: '4 cases · 3 sources',
      status: 'complete',
    },
    {
      id: 'review',
      name: 'Handoff review',
      label: 'Awaiting a reviewer',
      status: 'attention',
      note: 'One case is held until its identity evidence is verified.',
    },
  ],
  analysis: {
    summary:
      'Read the overnight queue and matched each case to a receiving team. Drafted replies only where a verified identity record already existed.',
    observations: [
      'Three of four cases carry a verified identity record.',
      'One refund sits above the agent limit and is held for approval.',
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
