'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
// Deep import, as in thread-step.tsx: the barrel is the whole library.
import ArrowDown from 'blode-icons-react/icons/arrow-down';
import type { ProcessStep } from '@/lib/process/model';
import { Button } from '@/components/ui/button';
import { motionTime } from '@/lib/motion-time';
import { useFollowRun } from './follow-run';
import {
  ThreadLookContext,
  ThreadStep,
  type FlagAction,
  type StepReference,
  type ThreadLook,
} from './thread-step';

/*
  How a run's thread moves, whatever process drew it: steps arrive one at a
  time, the reader is followed or offered the newest step, and each stage is
  announced as its steps are drawn. A process supplies its stage, its steps
  and the box under each; the timing is all here, so every process's run
  moves the same way.
*/

export type ThreadArrivals<S extends string> = {
  // The stage has moved on while the thread was on screen: arrivals ease in.
  watched: boolean;
  // The steps drawn so far, by id.
  drawn: string[];
  hurried: boolean;
  onBusy: (id: string, busy: boolean) => void;
  // The stage whose steps are all drawn: what to announce.
  announced: S;
};

/*
  One thing moves at a time. The steps a stage adds are drawn only once every
  step already drawn has finished changing -- a mark leaving for the finished
  one, a fold shutting. Steps report that from their effects, which run before
  this hook's, so a change that moved nothing draws its new steps on the next
  frame. The shipped look does not wait. Step ids must not depend on counts.
*/
export function useThreadArrivals<S extends string>(
  stage: S,
  stepIds: string[],
  look: ThreadLook,
): ThreadArrivals<S> {
  const [firstStage] = useState(stage);
  const watched = stage !== firstStage;
  const [drawn, setDrawn] = useState(stepIds);
  const busy = useRef(new Set<string>());
  const [settledAt, setSettledAt] = useState(0);
  const onBusy = (id: string, isBusy: boolean) => {
    if (isBusy) busy.current.add(id);
    else if (busy.current.delete(id) && busy.current.size === 0)
      setSettledAt((count) => count + 1);
  };
  const ids = stepIds.join(' ');
  // The stage is announced as its steps are drawn, not before them.
  const [announced, setAnnounced] = useState(stage);
  /*
    Catching up: a stage that moves on while the last change is still held
    means the run is outpacing the motion. The thread then stops waiting and
    draws the newest state at once, without arrivals, rather than falling
    further behind; the next ordinary change plays in full again.
  */
  const pending = useRef(false);
  const lastStage = useRef(stage);
  const [hurried, setHurried] = useState(false);
  useEffect(() => {
    if (lastStage.current !== stage) {
      lastStage.current = stage;
      if (pending.current && look === 'proposed') {
        busy.current.clear();
        pending.current = false;
        setHurried(true);
        setDrawn(ids.split(' '));
        setAnnounced(stage);
        return;
      }
      setHurried(false);
      pending.current = true;
    }
    if (busy.current.size > 0) return;
    pending.current = false;
    setDrawn((now) => (now.join(' ') === ids ? now : ids.split(' ')));
    setAnnounced(stage);
  }, [ids, settledAt, stage, look]);
  // In case a step never reports: one that leaves the page mid-change.
  useEffect(() => {
    const timer = setTimeout(() => {
      busy.current.clear();
      setDrawn(ids.split(' '));
      setAnnounced(stage);
    }, motionTime(5000));
    return () => clearTimeout(timer);
  }, [ids, stage]);
  return { watched, drawn, hurried, onBusy, announced };
}

// The thread a run draws at one stage, held back by its arrivals.
export function Thread<S extends string>({
  arrivals,
  steps,
  boxes,
  look,
  announcement,
  end = null,
  flagActions = {},
  references = {},
  headingActions = {},
  keepOpen = false,
}: {
  // Every step stays open as it finishes (ThreadStep's keepOpen).
  keepOpen?: boolean;
  arrivals: ThreadArrivals<S>;
  steps: ProcessStep[];
  boxes: Record<string, ReactNode>;
  look: ThreadLook;
  // One polite line for the announced stage: a milestone, never a count.
  announcement: string;
  // The run's end, once its last step has settled.
  end?: string | null;
  flagActions?: Record<string, FlagAction | undefined>;
  references?: Record<string, StepReference | undefined>;
  headingActions?: Record<
    string,
    { label: string; onPress: () => void } | undefined
  >;
}) {
  const { watched, drawn, hurried, onBusy } = arrivals;
  const shown =
    look === 'proposed'
      ? steps.filter((step) => drawn.includes(step.id))
      : steps;
  const thread = useRef<HTMLOListElement>(null);
  const newest = shown.at(-1);
  const { behind, catchUp } = useFollowRun(thread, newest?.id);
  const paused = useRestWhenUnseen(thread);

  return (
    <ThreadLookContext value={look}>
      <ol
        ref={thread}
        className="thread"
        data-look={look}
        data-paused={paused || undefined}
      >
        {shown.map((step) => (
          <ThreadStep
            key={step.id}
            step={step}
            // Of the stage, not of what is drawn: a finished step folds as it
            // finishes, though the next has yet to arrive.
            latest={step.id === steps.at(-1)?.id}
            current={step.id === newest?.id}
            enter={watched && !hurried}
            onBusy={onBusy}
            flagAction={flagActions[step.id]}
            reference={references[step.id]}
            headingAction={headingActions[step.id]}
            keepOpen={keepOpen}
          >
            {boxes[step.id]}
          </ThreadStep>
        ))}
      </ol>
      {/* The run's end, once its last step has settled: a quiet line under
          the thread, easing in only where the reader watched it finish. */}
      {end ? (
        <p className="thread-end" data-arrived={watched || undefined}>
          {end}
        </p>
      ) : null}
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
        {announcement}
      </p>
    </ThreadLookContext>
  );
}

/*
  Whether the thread is out of sight -- scrolled away or in a hidden tab --
  when its looping marks and shimmer can rest rather than repaint unseen.
*/
function useRestWhenUnseen(list: RefObject<HTMLOListElement | null>) {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    const thread = list.current;
    if (!thread) return;
    let inView = true;
    const update = () => setUnseen(!inView || document.hidden);
    const seen = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      update();
    });
    seen.observe(thread);
    document.addEventListener('visibilitychange', update);
    return () => {
      seen.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [list]);
  return unseen;
}

// When a ticking count starts after its step is drawn, and how long it takes
// to reach its figure. It starts once the step's body has unfolded
// (--thread-unfold-after in thread-step.css, plus the fold): a row added
// while the fold is still opening would jump it.
const COUNT_AFTER_MS = 1700;
const COUNT_SPAN_MS = 1500;
// The quickest a count may change: longer than its label's morph (360ms in
// ThreadStep), so each change finishes before the next starts. A larger jump
// moves in fewer, even steps rather than flickering through every number.
const COUNT_STEP_MS = 420;

// How a count behaves: at rest, waiting for its step to arrive, or ticking.
export function countingFor(
  arrivals: Pick<ThreadArrivals<string>, 'watched' | 'drawn'>,
  running: boolean,
  id: string,
): 'rest' | 'wait' | 'tick' {
  return !arrivals.watched || !running
    ? 'rest'
    : arrivals.drawn.includes(id)
      ? 'tick'
      : 'wait';
}

/*
  A count that ticks up to `target`, in even steps, once its step is drawn;
  holds where it stood while the step waits to arrive; and is simply
  `target` at rest. It ticks from wherever it stood, so a stage that moves on
  mid-count carries on from there.
*/
export function useCountUp(
  target: number,
  mode: 'rest' | 'wait' | 'tick',
  span = COUNT_SPAN_MS,
) {
  const [shown, setShown] = useState(target);
  const from = useRef(shown);
  useLayoutEffect(() => {
    from.current = shown;
  });
  useEffect(() => {
    if (mode === 'wait') return;
    const start = from.current;
    const distance = mode === 'tick' ? target - start : 0;
    const steps = Math.min(
      distance,
      Math.max(1, Math.floor(span / COUNT_STEP_MS)),
    );
    const timers =
      distance > 0
        ? Array.from({ length: steps }, (_, index) =>
            setTimeout(
              () =>
                setShown(start + Math.round((distance * (index + 1)) / steps)),
              motionTime(COUNT_AFTER_MS + (span / steps) * index),
            ),
          )
        : [setTimeout(() => setShown(target))];
    return () => timers.forEach(clearTimeout);
  }, [target, mode, span]);
  return shown;
}
