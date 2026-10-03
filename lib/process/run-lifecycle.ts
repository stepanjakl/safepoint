// A run as it moves: the stages it passes through, and the steps of its thread
// at each one. Placeholder, like placeholder-process.ts -- the engine does not
// report its progress yet -- but the stages are the batch phases of
// docs/EXPERIENCE-SPEC.md, so the thread can be designed against every one of
// them before anything produces them.

import type { ReviewedReplay } from '../promotion-release';
import type { ReleasePlan } from '../review/plan-contract';
import {
  evaluationCounts,
  needingAttention,
  type ReviewProgress,
} from '../review/plan-derivations';
import { RUN_TRIGGER_LABELS, type ProcessStep, type RunTrigger } from './model';
import { needsAttention, type SystemLink } from './system-links';

export const RUN_STAGES = [
  'waiting',
  'starting',
  'reading',
  'evaluating',
  'checking',
  'awaiting_review',
  'reviewing',
  'ready_to_commit',
  'committing',
  'intervention',
  'committed',
  'stopped',
] as const;

export type RunStage = (typeof RUN_STAGES)[number];

export const RUN_STAGE_LABELS: Record<RunStage, string> = {
  waiting: 'Waiting for a request',
  starting: 'Starting',
  reading: 'Reading sources',
  evaluating: 'Evaluating',
  checking: 'Policy check',
  awaiting_review: 'Awaiting review',
  reviewing: 'In review',
  ready_to_commit: 'Ready to commit',
  committing: 'Committing',
  intervention: 'Needs intervention',
  committed: 'Committed',
  stopped: 'Stopped',
};

// What the thread says about the run, derived once from the evidence the run
// read and the plan it produced, so a label and the box beneath it cannot
// disagree.
export type RunFacts = {
  sources: { total: number; needing: number };
  candidates: number;
  // Lines the agent would have released that deterministic policy held: the
  // step that shows the rules, not the model, decide.
  overruled: { id: string; subject: string; reason: string }[];
  destinations: number;
};

export function presentRunFacts(
  replay: ReviewedReplay,
  plan: ReleasePlan,
  inputs: SystemLink[],
  destinations: number,
): RunFacts {
  const effects = new Map(plan.effects.map((effect) => [effect.id, effect]));
  const reasons = new Map(plan.reasons.map((reason) => [reason.key, reason]));
  const overruled = replay.lines
    .filter(
      (line) =>
        line.agentAssessment.agentRecommendation === 'release' &&
        (line.outcome === 'held' || line.outcome === 'unverifiable'),
    )
    .flatMap((line) => {
      const effect = effects.get(line.sku);
      if (!effect) return [];
      const reason = effect.reasonKey ? reasons.get(effect.reasonKey) : null;
      return [
        {
          id: effect.id,
          subject: effect.subject,
          reason: reason?.label ?? 'Held by policy',
        },
      ];
    });
  return {
    sources: {
      total: inputs.length,
      needing: inputs.filter(needsAttention).length,
    },
    candidates: plan.effects.length,
    overruled,
    destinations,
  };
}

/*
  Where a running stage has got to. Fixed rather than timed: the workbench
  pins each stage, so a count that moved on its own would make two views of
  one stage disagree. A thread watched live ticks up to these; they are
  where each stage rests.
*/
export type StageProgress = { sourcesRead: number; evaluated: number };

export function stageProgress(stage: RunStage, facts: RunFacts): StageProgress {
  return {
    sourcesRead:
      stage === 'waiting' || stage === 'starting'
        ? 0
        : stage === 'reading'
          ? Math.ceil(facts.sources.total * 0.6)
          : facts.sources.total,
    evaluated:
      stage === 'waiting' || stage === 'starting' || stage === 'reading'
        ? 0
        : stage === 'evaluating' || stage === 'stopped'
          ? Math.round(facts.candidates * 0.52)
          : facts.candidates,
  };
}

const ORDER = RUN_STAGES.indexOf.bind(RUN_STAGES);
const reached = (stage: RunStage, from: RunStage) =>
  stage !== 'stopped' && ORDER(stage) >= ORDER(from);

// What each finished step took, and between which clock times. Placeholder,
// fixed for the same reason the progress counts are: every view of one stage
// has to agree.
const TIMING = {
  sources: { duration: '4s', window: { from: '09:00:02', to: '09:00:06' } },
  evaluation: {
    duration: '1m 48s',
    window: { from: '09:00:06', to: '09:01:54' },
  },
  stopped: { duration: '52s', window: { from: '09:00:06', to: '09:00:58' } },
  policy: { duration: '2s', window: { from: '09:01:54', to: '09:01:56' } },
  review: { duration: '1h 12m', window: { from: '09:02:14', to: '10:14:31' } },
  commit: { duration: '38s', window: { from: '11:42:05', to: '11:42:43' } },
};

// How long a committed run took, from its request to its verified commit
// (09:00 to the commit's 11:42:43). Placeholder, fixed like TIMING.
export const RUN_TOOK = '2h 42m';

const plural = (count: number, one: string, other: string) =>
  `${count} ${count === 1 ? one : other}`;

/*
  The steps that have started, in order. A step that has not started is not
  drawn at all: the thread only ever grows downward, and a line that ends at
  the last marker is how the page says the run is waiting there.
*/
export function stepsAt(
  stage: RunStage,
  facts: RunFacts,
  requestLabel: string,
  trigger: RunTrigger = 'schedule',
  // A live view's counts, as they tick toward the stage's own.
  progress: StageProgress = stageProgress(stage, facts),
): ProcessStep[] {
  // Before the request is in there is no run to draw.
  if (stage === 'waiting') return [];
  const { total, needing } = facts.sources;
  const steps: ProcessStep[] = [
    {
      id: 'request',
      name: 'Request',
      label: requestLabel,
      status: 'complete',
      origin: trigger,
      note:
        trigger === 'schedule'
          ? 'Raised by the weekly schedule, not by a person.'
          : `${RUN_TRIGGER_LABELS[trigger]}.`,
    },
  ];
  // Requested and about to begin: nothing has started, so only the request.
  if (stage === 'starting') return steps;

  steps.push(
    stage === 'reading'
      ? {
          id: 'sources',
          name: 'Reading sources',
          label: `${progress.sourcesRead} of ${total}`,
          status: 'running',
          progress: { at: progress.sourcesRead, of: total },
        }
      : {
          id: 'sources',
          name: 'Sources',
          label: `${total} read`,
          flag: needing ? `${needing} not current` : undefined,
          status: needing ? 'attention' : 'complete',
          ...TIMING.sources,
          note: needing
            ? 'Candidates that relied on them are held rather than priced.'
            : undefined,
        },
  );
  if (stage === 'reading') return steps;

  if (stage === 'evaluating' || stage === 'stopped') {
    const stopped = stage === 'stopped';
    steps.push({
      id: 'evaluation',
      name: 'Evaluating candidates',
      label: `${progress.evaluated} of ${facts.candidates}`,
      flag: stopped ? 'Stopped' : undefined,
      status: stopped ? 'blocked' : 'running',
      ...(stopped ? TIMING.stopped : {}),
      progress: stopped
        ? undefined
        : { at: progress.evaluated, of: facts.candidates },
      note: stopped
        ? 'The supply position could not be read, so no plan was produced.'
        : undefined,
    });
    return steps;
  }
  steps.push({
    id: 'evaluation',
    name: 'Evaluation',
    label: plural(facts.candidates, 'candidate', 'candidates'),
    status: 'complete',
    ...TIMING.evaluation,
  });

  const overruled = facts.overruled.length;
  steps.push(
    stage === 'checking'
      ? {
          id: 'policy',
          name: 'Checking policy',
          label: `${facts.candidates} proposals`,
          status: 'running',
        }
      : {
          id: 'policy',
          name: 'Policy check',
          label: `${facts.candidates} checked`,
          flag: overruled ? `${overruled} overruled` : undefined,
          status: overruled ? 'attention' : 'complete',
          ...TIMING.policy,
          note: overruled
            ? 'Policy held lines the agent recommended releasing.'
            : undefined,
        },
  );
  if (stage === 'checking') return steps;

  const decided = reached(stage, 'committing');
  steps.push({
    id: 'review',
    name: 'Release review',
    label: decided
      ? 'Approved by Maya'
      : stage === 'ready_to_commit'
        ? 'Ready to commit'
        : stage === 'reviewing'
          ? 'In review'
          : 'Awaiting a reviewer',
    status: decided ? 'complete' : 'attention',
    ...(decided ? TIMING.review : {}),
    note: decided
      ? undefined
      : 'Nothing is applied until a person approves it.',
  });
  if (!decided) return steps;

  const destinations = plural(
    facts.destinations,
    'destination',
    'destinations',
  );
  steps.push({
    id: 'commit',
    name: stage === 'committing' ? 'Committing' : 'Commit',
    label: stage === 'committed' ? `${destinations} verified` : destinations,
    flag: stage === 'intervention' ? '1 conflict withheld' : undefined,
    status:
      stage === 'committed'
        ? 'complete'
        : stage === 'intervention'
          ? 'blocked'
          : 'running',
    ...(stage === 'committing' ? {} : TIMING.commit),
    progress:
      stage === 'committing' ? { at: 1, of: facts.destinations } : undefined,
    note:
      stage === 'intervention'
        ? 'A value changed after review, so that change was not applied.'
        : undefined,
  });
  return steps;
}

const COMMITTED_AT = 'Thu 4 Sep · 11:42';

/*
  The release card at a stage: how far the reviewer has got, and, once the
  commit has run, the receipt it left on the plan. Everything that clears
  policy is taken as approved and everything blocked or deferred as held; the
  second change applied is the one a person edited after review.
*/
export function reviewAt(
  stage: RunStage,
  plan: ReleasePlan,
): { plan: ReleasePlan; progress?: ReviewProgress } {
  const counts = evaluationCounts(plan.effects);
  const approvedIds = plan.effects
    .filter(
      (effect) =>
        effect.disposition === 'will_apply' ||
        effect.disposition === 'needs_decision',
    )
    .map((effect) => effect.id);
  const held = plan.effects.length - approvedIds.length;

  switch (stage) {
    case 'reviewing':
      return {
        plan,
        progress: {
          phase: 'reviewing',
          decided: Math.floor(needingAttention(counts) * 0.4),
        },
      };
    case 'ready_to_commit':
      return {
        plan,
        progress: { phase: 'ready', approved: approvedIds.length, held },
      };
    case 'committing':
      return { plan, progress: { phase: 'committing' } };
    case 'intervention': {
      const [conflict, ...applied] = approvedIds;
      if (!conflict) return { plan };
      return {
        plan: {
          ...plan,
          status: {
            kind: 'partially_applied',
            at: COMMITTED_AT,
            appliedIds: applied,
            failures: [
              {
                effectId: conflict,
                reason: 'Changed on the storefront after review, so withheld.',
              },
            ],
          },
        },
      };
    }
    case 'committed':
      return {
        plan: {
          ...plan,
          status: {
            kind: 'applied',
            at: COMMITTED_AT,
            appliedIds: approvedIds,
            undoAvailableUntil: null,
          },
        },
      };
    default:
      return { plan };
  }
}

// One polite line per stage, for the status region the thread keeps mounted:
// a milestone, never a running count.
export const STAGE_ANNOUNCEMENTS: Record<RunStage, string> = {
  waiting: 'Waiting for a request.',
  starting: 'Run requested. Starting.',
  reading: 'Reading sources.',
  evaluating: 'Sources read. Evaluating candidates.',
  checking: 'Candidates evaluated. Checking policy.',
  awaiting_review: 'Release plan ready for review.',
  reviewing: 'Review in progress.',
  ready_to_commit: 'All required decisions made. Ready to commit.',
  committing: 'Committing approved changes.',
  intervention: 'Commit paused. One conflict needs a decision.',
  committed: 'Approved changes committed and verified.',
  stopped: 'Run stopped before a plan was produced.',
};
