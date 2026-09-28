'use client';

import { useContext, useState, type ReactNode } from 'react';
import type { ProcessAnalysis } from '@/lib/process/model';
import {
  byAttention,
  needsAttention,
  type SystemLink,
} from '@/lib/process/system-links';
import {
  reviewAt,
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
import { RequestBubble, ResponseSection } from './thread-page';
import {
  ThreadLookContext,
  ThreadStep,
  type FlagAction,
  type ThreadLook,
} from './thread-step';

/*
  A run's thread at one stage. The steps come from the lifecycle; the box for
  each comes from here, so the home page and the workbench draw the same run
  the same way and differ only in which stage they ask for.
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
  look?: ThreadLook;
}) {
  const steps = stepsAt(stage, facts, requestLabel);
  const progress = stageProgress(stage, facts);
  const review = reviewAt(stage, plan);

  // Once the stage has moved on while the thread is on screen, a step that
  // appears arrived in front of the reader, and eases in.
  const [firstStage] = useState(stage);
  const watched = stage !== firstStage;

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

  const boxes: Record<string, ReactNode> = {
    request: <RequestBubble>{request}</RequestBubble>,
    sources: (
      <SourcesRead
        inputs={inputs}
        read={stage === 'reading' ? progress.sourcesRead : undefined}
      />
    ),
    evaluation:
      stage === 'evaluating' ? (
        <EvaluationProgress plan={plan} evaluated={progress.evaluated} />
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
      <ResponseSection
        caption={`Recorded on ${plan.evaluatedAt} · Fictional data`}
      >
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
    <ThreadLookContext value={look}>
      <ol className="thread" data-look={look}>
        {steps.map((step, index) => (
          <ThreadStep
            key={step.id}
            step={step}
            latest={index === steps.length - 1}
            enter={watched}
            flagAction={flagActions[step.id]}
          >
            {boxes[step.id]}
          </ThreadStep>
        ))}
      </ol>
      {/* Mounted with the thread so it is in place before the first change
          it announces. A milestone per stage, never a running count. */}
      <p className="sr-only" role="status">
        {STAGE_ANNOUNCEMENTS[stage]}
      </p>
    </ThreadLookContext>
  );
}
