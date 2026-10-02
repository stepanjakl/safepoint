'use client';

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
// Deep import, as in thread-step.tsx: the barrel is the whole library.
import ArrowDown from 'blode-icons-react/icons/arrow-down';
import type { ProcessAnalysis, RunTrigger } from '@/lib/process/model';
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
import { Button } from '@/components/ui/button';
import { useFollowRun } from './follow-run';
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
  type StepReference,
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

  // Once the stage has moved on while the thread is on screen, a step that
  // appears arrived in front of the reader, and eases in.
  const [firstStage] = useState(stage);
  const watched = stage !== firstStage;

  // The steps drawn so far: see the hold below. Ids do not depend on counts.
  const [drawn, setDrawn] = useState(() =>
    stepsAt(stage, facts, requestLabel, trigger).map((step) => step.id),
  );
  // Watched live, a running step's count ticks up once the step has
  // arrived, rather than standing at the stage's figure from the start.
  const counting = (running: boolean, id: string) =>
    !watched || !running ? 'rest' : drawn.includes(id) ? 'tick' : 'wait';
  const sourcesRead = useCountUp(
    progress.sourcesRead,
    counting(stage === 'reading', 'sources'),
  );
  const evaluated = useCountUp(
    progress.evaluated,
    counting(stage === 'evaluating', 'evaluation'),
  );
  const steps = stepsAt(stage, facts, requestLabel, trigger, {
    sourcesRead,
    evaluated,
  });

  /*
    One thing moves at a time. The steps a stage adds are drawn only once
    every step already drawn has finished changing -- a mark leaving for the
    finished one, a fold shutting. Steps report that from their effects,
    which run before this component's, so a change that moved nothing draws
    its new steps on the next frame. The shipped look does not wait.
  */
  const busy = useRef(new Set<string>());
  const [settledAt, setSettledAt] = useState(0);
  const onBusy = (id: string, isBusy: boolean) => {
    if (isBusy) busy.current.add(id);
    else if (busy.current.delete(id) && busy.current.size === 0)
      setSettledAt((count) => count + 1);
  };
  const ids = steps.map((step) => step.id).join(' ');
  // The stage is announced as its steps are drawn, not before them.
  const [announced, setAnnounced] = useState(stage);
  useEffect(() => {
    if (busy.current.size > 0) return;
    setDrawn((now) => (now.join(' ') === ids ? now : ids.split(' ')));
    setAnnounced(stage);
  }, [ids, settledAt, stage]);
  // In case a step never reports: one that leaves the page mid-change.
  useEffect(() => {
    const timer = setTimeout(() => {
      busy.current.clear();
      setDrawn(ids.split(' '));
      setAnnounced(stage);
    }, 5000);
    return () => clearTimeout(timer);
  }, [ids, stage]);
  const shown =
    look === 'proposed'
      ? steps.filter((step) => drawn.includes(step.id))
      : steps;
  const thread = useRef<HTMLOListElement>(null);
  const newest = shown.at(-1);
  const { behind, catchUp } = useFollowRun(thread, newest?.id);

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
        action: sheet
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
    <ThreadLookContext value={look}>
      <ol ref={thread} className="thread" data-look={look}>
        {shown.map((step) => (
          <ThreadStep
            key={step.id}
            step={step}
            // Of the stage, not of what is drawn: a finished step folds as it
            // finishes, though the next has yet to arrive.
            latest={step.id === steps.at(-1)?.id}
            enter={watched}
            onBusy={onBusy}
            flagAction={flagActions[step.id]}
            reference={step.id === 'request' ? reference : undefined}
          >
            {boxes[step.id]}
          </ThreadStep>
        ))}
      </ol>
      {/* For a reader scrolled away when a step arrived. No height of its
          own, so appearing moves nothing; the button rises out of it. */}
      {behind && newest ? (
        <div className="sticky bottom-4 flex h-0 items-end justify-center">
          <Button variant="primary" onPress={catchUp}>
            {newest.name}
            <ArrowDown aria-hidden size={14} strokeWidth={2.5} />
          </Button>
        </div>
      ) : null}
      {/* Mounted with the thread so it is in place before the first change
          it announces. A milestone per stage, never a running count. */}
      <p className="sr-only" role="status">
        {STAGE_ANNOUNCEMENTS[announced]}
      </p>
    </ThreadLookContext>
  );
}

// When a ticking count starts after its step is drawn, and how long it takes
// to reach the stage's figure. It starts once the step's body has unfolded
// (--thread-unfold-after in thread-step.css, plus the fold): a row added
// while the fold is still opening would jump it.
const COUNT_AFTER_MS = 1700;
const COUNT_SPAN_MS = 1500;

/*
  A count that ticks up to `target`, one at a time, once its step is drawn;
  holds where it stood while the step waits to arrive; and is simply
  `target` at rest. It ticks from wherever it stood, so a stage that moves on
  mid-count carries on from there.
*/
function useCountUp(target: number, mode: 'rest' | 'wait' | 'tick') {
  const [shown, setShown] = useState(target);
  const from = useRef(shown);
  useLayoutEffect(() => {
    from.current = shown;
  });
  useEffect(() => {
    if (mode === 'wait') return;
    const start = from.current;
    const steps = mode === 'tick' ? target - start : 0;
    const timers =
      steps > 0
        ? Array.from({ length: steps }, (_, index) =>
            setTimeout(
              () => setShown(start + index + 1),
              COUNT_AFTER_MS + (COUNT_SPAN_MS / steps) * index,
            ),
          )
        : [setTimeout(() => setShown(target))];
    return () => timers.forEach(clearTimeout);
  }, [target, mode]);
  return shown;
}
