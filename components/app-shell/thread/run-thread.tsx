'use client';

import { useContext, useState, type ReactNode } from 'react';
import type { ProcessAnalysis, RunTrigger } from '@/lib/process/model';
import {
  byAttention,
  needsAttention,
  type SystemLink,
} from '@/lib/process/system-links';
import {
  reviewAt,
  RUN_TOOK,
  STAGE_ANNOUNCEMENTS,
  stageProgress,
  stepsAt,
  type RunFacts,
  type RunStage,
} from '@/lib/process/run-lifecycle';
import type { ReleasePlan } from '@/lib/review/plan-contract';
import { ReplayReview } from '@/components/review/replay-review';
import type { ReviewOpenRequest } from '@/components/review/review-experience';
import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { InitialAnalysis } from './initial-analysis';
import {
  CommitLog,
  EvaluationProgress,
  PolicyCheck,
  SourcesRead,
  StoppedNotice,
} from './run-steps';
import {
  countingFor,
  Thread,
  useCountUp,
  useThreadArrivals,
} from './thread-arrivals';
import { RequestBubble, ResponseSection } from './thread-page';
import type { FlagAction, StepReference, ThreadLook } from './thread-step';

/*
  The promotion's thread at one stage. The steps come from the lifecycle; the
  box for each comes from here, and how they move from thread-arrivals.tsx, so
  the home page and the workbench draw the same run the same way and differ
  only in which stage they ask for.
*/
export function RunThread({
  stage,
  facts,
  plan,
  inputs,
  outputs,
  analysis,
  request,
  requestLabel,
  initialItemId,
  trigger = 'schedule',
  instructionsVersion,
  look = 'proposed',
}: {
  stage: RunStage;
  facts: RunFacts;
  plan: ReleasePlan;
  inputs: SystemLink[];
  outputs: SystemLink[];
  analysis: ProcessAnalysis;
  request: ReactNode;
  requestLabel: string;
  initialItemId?: string;
  trigger?: RunTrigger;
  // The instructions the run ran under, named on its request.
  instructionsVersion?: string;
  look?: ThreadLook;
}) {
  const progress = stageProgress(stage, facts);
  const review = reviewAt(stage, plan);
  // Ids do not depend on counts, so the arrivals can be worked out first.
  const arrivals = useThreadArrivals(
    stage,
    stepsAt(stage, facts, requestLabel, trigger).map((step) => step.id),
    look,
  );
  // Watched live, a running step's count ticks up once the step has
  // arrived, rather than standing at the stage's figure from the start.
  const sourcesRead = useCountUp(
    progress.sourcesRead,
    countingFor(arrivals, stage === 'reading', 'sources'),
  );
  // Slower: the bar fills beside it, and it is the step a demo pauses on.
  const evaluated = useCountUp(
    progress.evaluated,
    countingFor(arrivals, stage === 'evaluating', 'evaluation'),
    EVALUATE_SPAN_MS,
  );
  const steps = stepsAt(stage, facts, requestLabel, trigger, {
    sourcesRead,
    evaluated,
  });

  /*
    A flag goes to what it names: the line policy overruled, the change a
    commit withheld, the input that was not current. Opening the review is a
    request the card's host answers; opening an input is the sheet's, and
    where there is no sheet -- the workbench -- that flag stays a label.
  */
  const sheet = useContext(ProcessSheetActions);
  const [reviewRequest, setReviewRequest] = useState<ReviewOpenRequest | null>(
    null,
  );
  const openReview = (filter: ReviewOpenRequest['filter'], itemId?: string) =>
    setReviewRequest((last) => ({
      key: (last?.key ?? 0) + 1,
      filter,
      itemId,
    }));
  const staleInput = [...inputs].sort(byAttention).find(needsAttention);
  const overruled = facts.overruled[0];
  const conflict =
    review.plan.status.kind === 'partially_applied'
      ? review.plan.status.failures[0]?.effectId
      : undefined;
  const flagActions: Record<string, FlagAction | undefined> = {
    sources:
      sheet && staleInput
        ? {
            label: `open ${staleInput.label}`,
            onPress: () => sheet.showInput(staleInput.id),
          }
        : undefined,
    policy: overruled
      ? {
          label: `open ${overruled.subject} in the review`,
          onPress: () => openReview('blocked', overruled.id),
        }
      : undefined,
    commit: conflict
      ? {
          label: 'open the withheld change in the review',
          onPress: () => openReview('all', conflict),
        }
      : undefined,
  };

  /*
    The instructions the run ran under, on its request: the one fact the rail
    beside it does not carry per run. It says so when they have since moved
    on, and opens that version's change log where there is a sheet to.
  */
  const now = sheet?.currentVersion;
  const reference: StepReference | undefined = instructionsVersion
    ? {
        label:
          now && now !== instructionsVersion
            ? `Instructions ${instructionsVersion} · now ${now}`
            : `Instructions ${instructionsVersion}`,
        action: sheet?.hasChanges(instructionsVersion)
          ? {
              label: `what changed in ${instructionsVersion}`,
              onPress: () => sheet.showVersion(instructionsVersion),
            }
          : undefined,
      }
    : undefined;

  const boxes: Record<string, ReactNode> = {
    request: <RequestBubble>{request}</RequestBubble>,
    sources: (
      <SourcesRead
        inputs={inputs}
        read={stage === 'reading' ? sourcesRead : undefined}
      />
    ),
    evaluation:
      stage === 'evaluating' ? (
        <EvaluationProgress plan={plan} evaluated={evaluated} />
      ) : stage === 'stopped' ? (
        <StoppedNotice
          evaluated={progress.evaluated}
          total={facts.candidates}
          mode={plan.mode}
        />
      ) : (
        <InitialAnalysis analysis={analysis} />
      ),
    policy: <PolicyCheck facts={facts} running={stage === 'checking'} />,
    review: (
      <ResponseSection>
        <ReplayReview
          plan={review.plan}
          progress={review.progress}
          initialItemId={initialItemId}
          openRequest={reviewRequest}
        />
      </ResponseSection>
    ),
    commit: <CommitLog outputs={outputs} stage={stage} mode={plan.mode} />,
  };

  return (
    <Thread
      arrivals={arrivals}
      steps={steps}
      boxes={boxes}
      look={look}
      announcement={STAGE_ANNOUNCEMENTS[arrivals.announced]}
      end={
        arrivals.announced === 'committed'
          ? `Run complete · ${RUN_TOOK} from the request`
          : null
      }
      flagActions={flagActions}
      references={{ request: reference }}
    />
  );
}

// The evaluation's count is slower: the bar fills beside it.
const EVALUATE_SPAN_MS = 4500;
