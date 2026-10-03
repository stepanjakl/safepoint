// The process model: a process, its runs, the steps of a run's thread, and the
// labels each status is read aloud as. Only the two processes that fill it are
// placeholders (placeholder-process.ts); this is the shape the engine will
// supply.
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
  // A short fact that earns its place beside the name: how many, against
  // what. Never a restatement of the status, which the dot carries.
  label?: string;
  // The part of the fact that is the problem -- "1 not current" -- drawn in
  // the step's own tone after the label. Absent when nothing is wrong.
  flag?: string;
  // What the step took, once it has finished. A running step has none: a
  // duration is what it took, not how long it has been.
  duration?: string;
  // When it ran, as clock times, for the reader who needs the instants the
  // duration was measured between. Present with `duration`.
  window?: { from: string; to: string };
  // Where a running step has got to. Absent when the step cannot say, and
  // its marker then turns rather than fills.
  progress?: { at: number; of: number };
  status: StepStatus;
  // Extra detail for the marker's tooltip, where the status word alone is not
  // enough to say why the step ended as it did.
  note?: string;
  // Set on the step that hands the run its request: who raised it. It did no
  // work, so it shows where the run came from rather than a status, and stays
  // open as the context every later step answers.
  origin?: RunTrigger;
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
  // step's box by id. Absent where the thread is derived from the run's stage
  // instead (run-lifecycle.ts).
  steps?: ProcessStep[];
  analysis: ProcessAnalysis;
  // What this process counts, for the places a tally has to be read aloud:
  // the rail draws glyphs and numbers, but a screen reader needs the noun.
  itemNoun: string;
  runs: ProcessRun[];
};
