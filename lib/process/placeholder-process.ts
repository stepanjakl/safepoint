// Placeholder process chrome. Nothing here is produced by the engine yet: it
// describes the shape the surrounding application would supply, so the review
// can be seen in the context it will actually appear in.
//
// `instructionsVersion` on a run is not decoration. The review contract already
// binds a decision to an exact revision, and instructions are the other input
// that can move underneath a result -- a run evaluated under older instructions
// is not comparable to one evaluated under the current set, and the list says so.

import type { ProcessSchedule } from './schedule';
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

/*
  A run's own outcome, which is not the same question as a step's. A step ends;
  a run ends and then waits for a person. `awaiting_review` is the state this
  product exists for -- work is finished and nothing has been applied -- and it
  is deliberately the loudest thing the rail can show.

  `superseded` is the one that is easy to miss: a run whose plan was never
  approved before the next run replaced it. That is not a failure, and calling
  it one would be wrong; it is a decision nobody made in time.
*/
export type RunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'approved'
  | 'completed'
  | 'held'
  | 'failed'
  | 'superseded'
  | 'cancelled';

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_review: 'Awaiting review',
  approved: 'Approved',
  completed: 'Completed',
  held: 'Held',
  failed: 'Failed',
  superseded: 'Superseded',
  cancelled: 'Cancelled',
};

// Why the run happened at all. A glyph in the row, because "did someone ask
// for this, or did the schedule?" is the second question a reader has after
// "how did it go", and it was previously only recorded as a note on the
// request step -- where the rail could not show it.
export type RunTrigger = 'schedule' | 'manual' | 'rerun';

export const RUN_TRIGGER_LABELS: Record<RunTrigger, string> = {
  schedule: 'Started by the schedule',
  manual: 'Started by a person',
  rerun: 'Re-run of an earlier run',
};

/*
  What the run produced, in the review's own words and the review's own order:
  these are `DispositionCounts` from lib/review/plan-derivations, which is what
  the process menu's release preview already counts. The rail and the preview
  answer the same question about the same run, so a reader who has learned one
  has learned the other -- same names, same colours, same order, blocked first.

  `willApply` is not here: it is whatever is left of `items`, and the rail
  shows the total rather than the remainder. Each of the three is left off
  where it is zero -- a row that says "nothing blocked" spends its width saying
  nothing.
*/
export type RunCounts = {
  // Everything the run looked at, which is what the release is measured in.
  items: number;
  // A line policy stopped, which cannot go out until it is resolved.
  blocked?: number;
  // A line that clears policy but cannot go out until a person chooses.
  needsDecision?: number;
  // A line put aside for this run, evidence missing or out of scope.
  deferred?: number;
};

export type ProcessRun = {
  id: string;
  // When it started, as an instant rather than a rendered string: the rail
  // says "Today" and "Yesterday", which no fixed label can.
  startedAt: string;
  status: RunStatus;
  trigger: RunTrigger;
  counts: RunCounts;
  // Wall-clock, already formatted. Absent while the run is still going: a
  // duration is what it took, not how long it has been.
  duration?: string;
  // Where a running run has got to, against the process's steps.
  progress?: { at: number; of: number };
  // Who decided, once someone has.
  decidedBy?: string;
  instructionsVersion: string;
  current?: boolean;
};

// Instructions are prose, paragraphs separated by a blank line: that is how
// they are written and how a change to them is read.
export type InstructionsVersion = {
  version: string;
  updatedAt: string;
  author: string;
  // Why this version replaced the one before it.
  note: string | null;
  // The run or event that showed the previous version was wrong.
  promptedBy: string | null;
  // The change log: one line per change, in the words of whoever made it.
  changes: string[];
  text: string;
};

export type ProcessSummary = {
  // Stable across renames: the key a person's schedule change is saved under.
  id: string;
  name: string;
  schedule: ProcessSchedule;
  // The APIs this process may call once changes are approved. Mirrors the
  // destinations the effect planner already names, rather than inventing a
  // second vocabulary. Inputs are not here: they are derived from the evidence
  // files the run read.
  outputs: SystemLink[];
  instructions: InstructionsVersion & {
    // Earlier versions, oldest first. A run that ran under one says so, and
    // the setup drawer shows what changed from each to the next.
    previous: InstructionsVersion[];
  };
  // Ordered. The thread renders in this order and the page supplies each
  // step's box by id, so adding a step is a change here and nowhere else.
  steps: ProcessStep[];
  analysis: ProcessAnalysis;
  // What this process counts, for the places a tally has to be read aloud:
  // the rail draws glyphs and numbers, but a screen reader needs the noun.
  itemNoun: string;
  runs: ProcessRun[];
};

export const promotionProcess: ProcessSummary = {
  id: 'promotion-release',
  name: 'Promotion release',
  schedule: {
    enabled: true,
    cadence: 'weekly',
    day: 'Thursday',
    time: '09:00',
    timezone: 'Europe/London',
  },
  outputs: [
    // Modes and undo copy from the effect planner's destination table; see
    // EFFECT_DESTINATIONS in lib/review-presentation/present-review.ts.
    {
      id: 'pricebook',
      label: 'Pricebook',
      api: 'Google Sheets API · promotion pricebook',
      undo: 'Restores automatically if the row has not changed again.',
      icon: 'pricebook',
      direction: 'output',
      mode: 'live_sandbox',
    },
    {
      id: 'storefront',
      label: 'Storefront',
      api: 'Storefront sandbox API',
      undo: 'Restores automatically before a later promotion replaces it.',
      icon: 'storefront',
      direction: 'output',
      mode: 'live_sandbox',
    },
    {
      id: 'labels',
      label: 'Label queue',
      api: 'Google Sheets API · label queue',
      undo: 'Can be removed until label production begins at 06:00.',
      icon: 'labels',
      direction: 'output',
      mode: 'live_sandbox',
    },
    {
      id: 'portal',
      label: 'Supplier portal',
      api: 'Supplier order API',
      undo: 'Simulation only. No external change would need recovery.',
      icon: 'portal',
      direction: 'output',
      mode: 'simulated',
    },
  ],
  /*
    Three versions, each written in answer to a run that went wrong. The dates
    agree with the runs below: the runs of 14 and 21 Aug ran under v3, and v4
    was published between the run of 21 Aug and the next one.
  */
  instructions: {
    version: 'v4',
    updatedAt: 'Updated 24 Aug 2026',
    author: 'Maya, Promotion operations',
    note: 'The 21 Aug run priced two lines on week-old supply data and reported nothing blocked. Stale or unavailable evidence now holds a line instead of pricing it, and unverified supplier funding no longer props up a margin.',
    promptedBy: 'Run of Thu 21 Aug · 26 items · 2 lines priced on stale supply',
    changes: [
      "Top-up quantities never exceed the supplier's confirmed allocation.",
      'A candidate whose evidence is unavailable or older than the policy window is held, not priced.',
      'A held line names the evidence that was missing or stale.',
      'Unverified supplier funding no longer counts towards the margin.',
    ],
    text: `Evaluate every shortlisted candidate against the recorded promotion brief and the current pricebook. Treat the brief as the source of truth for which candidates are in scope, and the pricebook for regular prices and cost.

Propose a promotional price, a top-up quantity and a promotion window for each candidate that clears policy. Round top-up quantities to the supplier's order multiple, and never above the supplier's confirmed allocation.

Hold any candidate whose projected margin falls below the floor, and any candidate whose supporting evidence is unavailable or older than the policy window. Say which evidence was missing or stale, so a reviewer can chase it rather than rediscover it.

Where supplier funding is unverified, price as if it were not offered and note the difference.

Never apply a change. Produce a release plan for a person to review.`,
    previous: [
      {
        version: 'v2',
        updatedAt: 'Updated 27 Jul 2026',
        author: 'Maya, Promotion operations',
        note: 'Replaces the spreadsheet checklist the team worked through by hand before each weekly release, so the agent does the first pass and a person reviews it.',
        promptedBy: null,
        changes: [
          'Candidates are evaluated against the current pricebook.',
          'Every candidate that clears policy gets a price, a top-up and a promotion window.',
          'Candidates below the margin floor are held.',
          'Nothing is applied: the output is a plan for a person to review.',
        ],
        text: `Evaluate every shortlisted candidate against the current pricebook.

Propose a promotional price, a top-up quantity and a promotion window for each candidate that clears policy.

Hold any candidate whose projected margin falls below the floor.

Never apply a change. Produce a release plan for a person to review.`,
      },
      {
        version: 'v3',
        updatedAt: 'Updated 10 Aug 2026',
        author: 'Maya, Promotion operations',
        note: 'The 7 Aug run priced two candidates that had already been withdrawn from the brief, and proposed top-ups in single units the supplier could not accept.',
        promptedBy: 'Run of Thu 7 Aug · 25 items · 2 withdrawn lines priced',
        changes: [
          'Candidates in scope come from the recorded promotion brief, not from the shortlist alone.',
          'Regular price and cost are read from the pricebook, never from the brief.',
          "Top-up quantities round to the supplier's order multiple.",
        ],
        text: `Evaluate every shortlisted candidate against the recorded promotion brief and the current pricebook. Treat the brief as the source of truth for which candidates are in scope, and the pricebook for regular prices and cost.

Propose a promotional price, a top-up quantity and a promotion window for each candidate that clears policy. Round top-up quantities to the supplier's order multiple.

Hold any candidate whose projected margin falls below the floor.

Never apply a change. Produce a release plan for a person to review.`,
      },
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
  itemNoun: 'item',
  /*
    Newest first, which is also the order the rail reads: the run a person came
    for is the one at the top. The current run's counts are the recorded plan's
    own -- `evaluationCounts` over its effects -- and a test holds them to it,
    because the rail and the review describe the same run and a reader who sees
    them disagree has no way to tell which is lying. The run of 21 Aug is superseded rather than
    applied -- it is the run that prompted v4, and its plan was never approved.
  */
  runs: [
    {
      id: 'run-104',
      startedAt: '2026-09-04T09:00:00+01:00',
      status: 'awaiting_review',
      trigger: 'schedule',
      counts: { items: 27, blocked: 4, needsDecision: 6 },
      duration: '2m 14s',
      instructionsVersion: 'v4',
      current: true,
    },
    {
      id: 'run-103',
      startedAt: '2026-08-28T09:00:00+01:00',
      status: 'completed',
      trigger: 'schedule',
      counts: { items: 26 },
      duration: '1m 58s',
      decidedBy: 'Maya',
      instructionsVersion: 'v4',
    },
    {
      id: 'run-102',
      startedAt: '2026-08-21T09:00:00+01:00',
      status: 'superseded',
      trigger: 'schedule',
      counts: { items: 26, needsDecision: 2 },
      duration: '2m 02s',
      instructionsVersion: 'v3',
    },
    {
      id: 'run-101',
      startedAt: '2026-08-14T09:00:00+01:00',
      status: 'completed',
      trigger: 'manual',
      counts: { items: 24 },
      duration: '1m 47s',
      decidedBy: 'Maya',
      instructionsVersion: 'v3',
    },
  ],
};

export const supportProcess: ProcessSummary = {
  id: 'support-handoff',
  name: 'Support handoff',
  schedule: {
    enabled: true,
    cadence: 'daily',
    day: 'Monday',
    time: '09:00',
    timezone: 'Europe/London',
  },
  outputs: [
    // Nothing in the support example reaches a real system.
    {
      id: 'queue',
      label: 'Support queue',
      api: 'Support queue API',
      undo: 'Simulation only. No case would move.',
      icon: 'queue',
      direction: 'output',
      mode: 'simulated',
    },
    {
      id: 'identity',
      label: 'Identity records',
      api: 'Identity records API',
      undo: 'Preview only. Nothing would change.',
      icon: 'identity',
      direction: 'output',
      mode: 'preview_only',
    },
    {
      id: 'billing',
      label: 'Billing',
      api: 'Billing API',
      undo: 'Preview only. Nothing would change.',
      icon: 'billing',
      direction: 'output',
      mode: 'preview_only',
    },
  ],
  // v2 was published after the run of 5 Sep, the last under v1.
  instructions: {
    version: 'v2',
    updatedAt: 'Updated 5 Sep 2026',
    author: 'Sam, Support operations',
    note: 'Replies are drafted only where identity is already verified, and refunds above the agent limit are held for approval.',
    promptedBy:
      'Run of Sat 5 Sep · 3 cases · reply drafted for an unverified identity',
    changes: [
      'Customer replies are drafted only where a verified identity record exists.',
      'Refunds above the agent limit are held for approval.',
    ],
    text: `Review the overnight support queue and propose a receiving team for each open case.

Draft a customer reply only where the case already carries a verified identity record.

Hold any case whose identity evidence is missing, and any refund above the agent limit.

Never move a case or send a message. Produce a handoff plan for a person to review.`,
    previous: [
      {
        version: 'v1',
        updatedAt: 'Updated 24 Aug 2026',
        author: 'Sam, Support operations',
        note: 'First version: a morning pass over the overnight queue before the day team takes over.',
        promptedBy: null,
        changes: [
          'Each open case gets a proposed receiving team.',
          'A customer reply is drafted for each case.',
          'Nothing is moved or sent: the output is a plan for a person to review.',
        ],
        text: `Review the overnight support queue and propose a receiving team for each open case.

Draft a customer reply for each case.

Hold any case whose identity evidence is missing.

Never move a case or send a message. Produce a handoff plan for a person to review.`,
      },
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
  itemNoun: 'case',
  runs: [
    {
      id: 'run-42',
      startedAt: '2026-09-07T09:00:00+01:00',
      status: 'awaiting_review',
      trigger: 'schedule',
      counts: { items: 4, blocked: 1, needsDecision: 1, deferred: 1 },
      duration: '48s',
      instructionsVersion: 'v2',
      current: true,
    },
    {
      id: 'run-41',
      startedAt: '2026-09-06T09:00:00+01:00',
      status: 'completed',
      trigger: 'schedule',
      counts: { items: 6 },
      duration: '1m 06s',
      decidedBy: 'Sam',
      instructionsVersion: 'v2',
    },
    {
      id: 'run-40',
      startedAt: '2026-09-05T09:00:00+01:00',
      status: 'superseded',
      trigger: 'schedule',
      counts: { items: 3, deferred: 1 },
      duration: '52s',
      instructionsVersion: 'v1',
    },
  ],
};
