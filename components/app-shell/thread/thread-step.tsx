// A client component for the marker's sake: `Focusable` resolves its single
// child on the client, and a child handed to it from a server component
// arrives unresolved. It also holds whether the step is folded.
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MorphingText } from '@/components/ui/morphing-text';
// Deep imports, as in menu-parts.tsx: the barrel is the whole library.
import ArrowUpRight from 'blode-icons-react/icons/arrow-up-right';
import ChevronTriangleDown from 'blode-icons-react/icons/chevron-triangle-down-small-filled';
import ArrowsRepeatCircleFilled from 'blode-icons-react/icons/arrows-repeat-circle-filled';
import CircleCheckFilled from 'blode-icons-react/icons/circle-check-filled';
import CirclePersonFilled from 'blode-icons-react/icons/circle-person-filled';
import ClockFilled from 'blode-icons-react/icons/clock-filled';
import CircleXFilled from 'blode-icons-react/icons/circle-x-filled';
import ExclamationCircleFilled from 'blode-icons-react/icons/exclamation-circle-filled';
import { Glyph } from '@/components/ui/glyph';
import { Tooltip } from '@/components/ui/tooltip';
import { stepMarker, toneText } from '@/components/review/markers';
import {
  STEP_STATUS_LABELS,
  type ProcessStep,
  type RunTrigger,
} from '@/lib/process/model';
import { cx } from '@/lib/cx';

/*
  Two looks while they are compared on /workbench/run. `current` is the thread
  as it shipped; `proposed` is the quieter one. The `.thread` list names its
  look for the stylesheet; this names it for the markup that differs.
*/
export type ThreadLook = 'current' | 'proposed';
export const ThreadLookContext = createContext<ThreadLook>('proposed');

/*
  The proposed marks: every one a filled circle of one size, drawn from the
  icon set's own circle glyphs so the mark in each is centred as its designer
  meant it, and cut out of the fill. A running step uses three arcs that light
  in sequence around a dot, then turn together after they dim.
*/
const FILLED = {
  complete: CircleCheckFilled,
  attention: ExclamationCircleFilled,
  blocked: CircleXFilled,
} as const;

/*
  A step that finished on screen keeps its ring, leaving, until it has folded
  into the finished mark: the same element throughout, so its loop carries on
  into the leaving rather than restarting.
*/
/*
  The request did no work, so its mark says where the run came from instead:
  a person who asked, the schedule, or an earlier run. The same filled circle
  as the other marks, in the finished grey, so it reads as history.
*/
const ORIGIN = {
  manual: CirclePersonFilled,
  schedule: ClockFilled,
  rerun: ArrowsRepeatCircleFilled,
} satisfies Record<RunTrigger, typeof CircleCheckFilled>;

function ProposedMark({
  step,
  arrived,
  travelled,
  leaving,
  onLeft,
}: {
  step: ProcessStep;
  arrived: boolean;
  travelled: boolean;
  leaving: boolean;
  onLeft: () => void;
}) {
  const { status } = step;
  if (step.origin) {
    const Origin = ORIGIN[step.origin];
    return <Origin aria-hidden className="thread-icon" />;
  }
  if (status === 'pending')
    return <Glyph name={stepMarker.pending.glyph} size={10} />;
  if (status === 'running' || leaving)
    return (
      <SegmentedRing
        count={3}
        enter={arrived}
        travelled={travelled}
        leaving={leaving}
        into={status === 'running' ? undefined : FILLED[status]}
        onLeft={onLeft}
      />
    );
  const Icon = FILLED[status];
  return <Icon aria-hidden className="thread-icon" />;
}

// 20 units of viewBox for the 20px mark. pathLength writes the arc as a share
// of the ring, which the stylesheet breathes while the ring turns.
export function RunningRing() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className="thread-ring"
    >
      <circle className="thread-ring-track" cx="10" cy="10" r="9" />
      <circle
        className="thread-ring-arc"
        cx="10"
        cy="10"
        r="9"
        pathLength={100}
      />
      <circle className="thread-ring-dot" cx="10" cy="10" r="4.25" />
    </svg>
  );
}

const prefersReducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
  `enter` plays the arrival before the loop and stays set for the ring's life,
  since the loop's timing counts from it. `leaving` starts at once, from
  wherever the loop has got to: the arcs fold back into the dot, then the dot
  grows into the check, which is drawn here so the two move as one mark;
  `onLeft` fires once it has settled.
  The ring keeps the running colour while the mark beneath it changes status.
*/
export function SegmentedRing({
  count,
  enter = false,
  travelled = false,
  leaving = false,
  into: Into = CircleCheckFilled,
  onLeft,
}: {
  count: 3 | 4;
  enter?: boolean;
  // Arrived as a small dot along the line: it waits for the travel, and
  // grows from that dot rather than from nothing.
  travelled?: boolean;
  leaving?: boolean;
  // The finished mark it leaves into.
  into?: typeof CircleCheckFilled;
  onLeft?: () => void;
}) {
  const start = count === 3 ? -126 : -90;
  // Under reduced motion nothing animates, so no animation's end can say the
  // mark has settled: it has, at once.
  const latestOnLeft = useRef(onLeft);
  useLayoutEffect(() => {
    latestOnLeft.current = onLeft;
  });
  useEffect(() => {
    if (leaving && prefersReducedMotion()) latestOnLeft.current?.();
  }, [leaving]);

  return (
    <>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 20 20"
        className="thread-ring thread-segmented-ring"
        data-count={count}
        data-enter={enter || undefined}
        data-travelled={travelled || undefined}
        data-leaving={leaving || undefined}
      >
        <g className="thread-segmented-outer">
          {Array.from({ length: count }, (_, index) => (
            <g
              key={index}
              transform={`rotate(${start + (index * 360) / count} 10 10)`}
            >
              <circle
                className="thread-segmented-arc"
                cx="10"
                cy="10"
                r="9"
                pathLength={100}
                strokeDasharray={count === 4 ? '15 85' : '20 80'}
              />
            </g>
          ))}
        </g>
        <circle
          className="thread-ring-dot thread-segmented-dot"
          cx="10"
          cy="10"
          r="4.25"
        />
      </svg>
      {leaving && (
        <Into
          aria-hidden
          className="thread-icon"
          data-arriving
          onAnimationEnd={onLeft}
        />
      )}
    </>
  );
}

/*
  The marker. It is focusable because a hover-only reveal puts the status word
  out of reach of a keyboard.
*/
function Marker({
  step,
  arrived,
  travelled,
  settling,
  onSettled,
}: {
  step: ProcessStep;
  arrived: boolean;
  travelled: boolean;
  settling: boolean;
  onSettled: () => void;
}) {
  const look = useContext(ThreadLookContext);
  const marker = stepMarker[step.status];
  const status = step.origin ? 'Requested' : STEP_STATUS_LABELS[step.status];
  const progress = step.progress
    ? ` ${step.progress.at} of ${step.progress.of}.`
    : '';
  return (
    <Tooltip label={status} description={step.note} placement="right">
      <span
        className={cx(
          'thread-dot',
          // The proposed marks take their colours from the stylesheet, per
          // status and per whether the step is the latest.
          look === 'current' ? toneText[marker.tone] : undefined,
        )}
        data-status={step.status}
        // The proposed ring leaves on its own; the shipped mark settles here.
        data-settling={(look === 'current' && settling) || undefined}
        tabIndex={0}
        role="img"
        aria-label={`${step.name}. ${status}.${progress}${step.note ? ` ${step.note}` : ''}`}
      >
        {look === 'proposed' ? (
          <ProposedMark
            step={step}
            arrived={arrived}
            travelled={travelled}
            leaving={settling}
            onLeft={onSettled}
          />
        ) : (
          <Glyph name={marker.glyph} />
        )}
      </span>
    </Tooltip>
  );
}

// What a flag can do: open the thing it names.
export type FlagAction = { label: string; onPress: () => void };

// A neutral fact that opens what it names -- the instructions a run ran under.
export type StepReference = {
  label: string;
  // Absent where there is nowhere to open it: the pill is then only a fact.
  action?: FlagAction;
};

/*
  Open is earned: a step is unfolded while it is running, when it stopped the
  run, or when it is the step the run is waiting on. Everything behind it folds
  to its name and one fact, one press away, so the page only ever has one thing
  to read. A step that changes status takes the fold its new status earns; a
  fold the reader chose holds until then.
*/
function earnsOpen(step: ProcessStep, latest: boolean) {
  return (
    step.origin !== undefined ||
    step.status === 'running' ||
    step.status === 'blocked' ||
    latest
  );
}

/*
  How long a step watched starting has been running, counting up beside it
  where a finished step says what it took: a real signal for work of no known
  length. Only where it started on screen, which is when its start is known.
  Hidden from assistive technology, which hears milestones, not a ticking count.
*/
function Elapsed({ reveal }: { reveal: boolean }) {
  const [seconds, setSeconds] = useState(0);
  // The clock time it started, as a finished step shows its window.
  const [since, setSince] = useState<string>();
  useEffect(() => {
    const start = performance.now();
    const at = new Date().toLocaleTimeString('en-GB');
    const first = setTimeout(() => setSince(at));
    const timer = setInterval(
      () => setSeconds(Math.floor((performance.now() - start) / 1000)),
      1000,
    );
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const minutes = Math.floor(seconds / 60);
  return (
    <>
      {/* Each number morphs on its own, with its unit after it: torph rolls
          a digit only when it stands as a number, not fused to a letter. */}
      <span
        className="thread-step-time-face"
        data-shown={!reveal || !since || undefined}
        aria-hidden="true"
      >
        {minutes ? (
          <>
            <MorphingText text={String(minutes)} />m{' '}
          </>
        ) : null}
        <MorphingText text={String(minutes ? seconds % 60 : seconds)} />s
      </span>
      {since ? (
        <span
          className="thread-step-time-face"
          data-shown={reveal || undefined}
          aria-hidden="true"
        >
          since {since}
        </span>
      ) : null}
    </>
  );
}

export function ThreadStep({
  step,
  latest = false,
  current = latest,
  enter = false,
  flagAction,
  reference,
  onBusy,
  children,
}: {
  step: ProcessStep;
  latest?: boolean;
  // The newest step drawn, whose name stays bright: unlike `latest`, it moves
  // on only when the next step has actually arrived. A thread that does not
  // hold steps back can leave it to `latest`.
  current?: boolean;
  // Arrived while the reader watched, rather than with the page: it eases in.
  enter?: boolean;
  // Whether the step is still moving after a change on screen -- its mark
  // leaving, its fold shutting -- so the thread can hold what comes next.
  onBusy?: (id: string, busy: boolean) => void;
  flagAction?: FlagAction;
  reference?: StepReference;
  children: ReactNode;
}) {
  const bodyId = useId();
  const stepRef = useRef<HTMLLIElement>(null);
  const foldRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // The fold's duration follows the body's height, within the CSS limits.
  // Only the measurement lives here; the stylesheet turns it into time.
  useLayoutEffect(() => {
    const fold = foldRef.current;
    const body = bodyRef.current;
    if (!fold || !body) return;
    let last: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize ?? body.offsetHeight;
      fold.style.setProperty(
        '--thread-fold-height',
        String(Math.round(height)),
      );
      // An open body whose content changes eases to its new height, at the
      // fold's pace, rather than jumping. A fold opening or shutting already
      // moves on its own, and the content is not what changed then.
      const from = last;
      last = height;
      const clip = body.parentElement;
      const step = fold.parentElement;
      if (
        from === undefined ||
        Math.abs(height - from) < 1 ||
        !clip ||
        step?.dataset.open === undefined ||
        step.dataset.entering !== undefined ||
        fold.getAnimations().length > 0 ||
        prefersReducedMotion()
      )
        return;
      // Mid-ease, it carries on from where it has got to.
      const easing = clip.getAnimations();
      const start = easing.length ? clip.getBoundingClientRect().height : from;
      easing.forEach((animation) => animation.cancel());
      const style = getComputedStyle(fold);
      const pace = parseFloat(style.getPropertyValue('--thread-fold-pace'));
      const min = parseFloat(style.getPropertyValue('--thread-fold-min'));
      const max = parseFloat(style.getPropertyValue('--thread-fold-max'));
      clip.animate(
        { height: [`${start}px`, `${height}px`] },
        {
          duration: Math.min(
            max,
            Math.max(min || 0, Math.abs(height - start) * (pace || 0)),
          ),
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        },
      );
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, []);
  const earned = earnsOpen(step, latest);
  const [open, setOpen] = useState(earned);
  const [settled, setSettled] = useState(earned);
  // Opened by the reader rather than by the run: it stays open as the run
  // moves on. One they shut opens again only when the step earns it anew.
  const [kept, setKept] = useState(false);
  // Shutting on screen, until the fold's own transition ends.
  const [closing, setClosing] = useState(false);
  // This pass's fold, for the body below: a set state is only read next pass.
  let opening = open;
  if (settled !== earned) {
    setSettled(earned);
    if (earned || !kept) {
      if (open && !earned && !prefersReducedMotion()) setClosing(true);
      setOpen(earned);
      opening = earned;
    }
  }
  // A fold that shuts keeps the box it showed open, so it closes over what
  // the reader saw rather than first growing into the finished box.
  const [heldBody, setHeldBody] = useState(children);
  if (opening && heldBody !== children) setHeldBody(children);
  const body = opening ? children : heldBody;
  // Whether the step finished while on screen: its marker settles once. Read
  // at the change, so a step that loads finished never plays it.
  const [status, setStatus] = useState(step.status);
  const [settling, setSettling] = useState(false);
  // Whether its running ring plays the arrival: it started while watched.
  const [arrived, setArrived] = useState(enter && step.status === 'running');
  // Fixed for the ring's life, since its loop is timed from it: the ring
  // arrived along the line rather than in place.
  const [travelled] = useState(enter && step.status === 'running');
  let settlingNow = settling;
  if (status !== step.status) {
    settlingNow = status === 'running';
    setSettling(settlingNow);
    if (step.status === 'running') setArrived(true);
    setStatus(step.status);
  }
  // Only the proposed ring leaves on screen and reports when it has; the
  // shipped mark settles in place with nothing to wait for.
  const proposed = useContext(ThreadLookContext) === 'proposed';
  // The row goes on saying what the step was doing until its mark has become
  // the finished one, and changes with it: one thing at a time.
  const [heldRow, setHeldRow] = useState(step);
  const holdingRow = settlingNow && proposed;
  if (!holdingRow && heldRow !== step) setHeldRow(step);
  const row = holdingRow ? heldRow : step;
  // A flag comes and goes rather than popping: one that appears after the
  // step was drawn fades in, and one that is withdrawn stays, fading, until
  // it has gone. Under reduced motion nothing fades, so it simply goes.
  const [flag, setFlag] = useState<{
    text: string;
    motion?: 'in' | 'out';
  } | null>(row.flag ? { text: row.flag } : null);
  if (row.flag) {
    if (flag?.text !== row.flag || flag.motion === 'out')
      setFlag({ text: row.flag, motion: 'in' });
  } else if (flag && flag.motion !== 'out') {
    setFlag(prefersReducedMotion() ? null : { ...flag, motion: 'out' });
  }
  // Set at mount and cleared once the arrival has played, so a step that was
  // already here keeps still, and a later fold opens without the wait.
  const [entering, setEntering] = useState(enter);
  // Its mark arrives along the line from the step before: how far that is.
  useLayoutEffect(() => {
    const item = stepRef.current;
    const before = item?.previousElementSibling;
    if (!entering || !item || !before) return;
    const gap = parseFloat(getComputedStyle(item.parentElement!).rowGap) || 0;
    item.style.setProperty(
      '--thread-travel',
      `${before.getBoundingClientRect().height + gap}px`,
    );
  }, [entering]);

  const leaving = settling && proposed;
  // Once its mark has landed, the line into it fills; the next step waits for
  // that too, so it sets off down a line that has finished drawing. Read from
  // the fill's own transition on the step above, not timed here.
  const [filling, setFilling] = useState(false);
  useEffect(() => {
    const above = stepRef.current?.previousElementSibling;
    if (!filling || !above) return;
    const filled = (event: Event) => {
      const { pseudoElement, propertyName } = event as TransitionEvent;
      if (pseudoElement === '::before' && propertyName === '--thread-fill')
        setFilling(false);
    };
    above.addEventListener('transitionend', filled);
    return () => above.removeEventListener('transitionend', filled);
  }, [filling]);
  const busy = leaving || closing || filling;
  // It trailed a line while it worked: the next step's line grows from it.
  const trailed = travelled || arrived;
  // Not to be folded while it is the request or still working: it stays open,
  // with no control and no hover, until its finished mark has landed.
  const fixed =
    step.origin !== undefined || step.status === 'running' || leaving;
  // One pass across the name once the finished mark has landed.
  const [flourish, setFlourish] = useState(false);
  const latestOnBusy = useRef(onBusy);
  useLayoutEffect(() => {
    latestOnBusy.current = onBusy;
  });
  useEffect(() => {
    latestOnBusy.current?.(step.id, busy);
  }, [busy, step.id]);
  useEffect(() => () => latestOnBusy.current?.(step.id, false), [step.id]);
  // The duration gives way to its clock times under the pointer or the focus.
  const [reveal, setReveal] = useState(false);

  const showWindow = reveal && row.window !== undefined;

  return (
    <li
      ref={stepRef}
      className="thread-step"
      data-status={step.status}
      data-latest={latest || undefined}
      data-current={current || undefined}
      data-open={open || undefined}
      data-entering={entering || undefined}
      // The line into this step stays dotted until its mark has left.
      data-settling={leaving || undefined}
      data-flourish={flourish || undefined}
      data-filling={filling || undefined}
      data-trailed={trailed || undefined}
      data-fixed={fixed || undefined}
      // How its ring's loop is timed, which the name's shimmer follows.
      data-mark={travelled ? 'travelled' : arrived ? 'arrived' : undefined}
      onAnimationEnd={(event) => {
        if (event.animationName === 'thread-row-in') setEntering(false);
        if (event.animationName === 'thread-name-done') setFlourish(false);
      }}
      onPointerEnter={() => setReveal(true)}
      onPointerLeave={() => setReveal(false)}
    >
      <span className="thread-marker">
        <Marker
          step={step}
          arrived={arrived}
          settling={settling}
          travelled={travelled}
          onSettled={() => {
            setSettling(false);
            if (prefersReducedMotion()) return;
            setFlourish(true);
            if (stepRef.current?.previousElementSibling) setFilling(true);
          }}
        />
      </span>
      {/* One row: the toggle stretches across it, so the whole row answers
          the pointer, and a flag sits above the stretch as its own control. */}
      <div className="thread-step-row">
        {/* A step that cannot fold names itself with a label, not a
            control: the request, and a step still at work. */}
        {fixed ? (
          <span className="thread-step-toggle">{row.name}</span>
        ) : (
          <button
            type="button"
            className="thread-step-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => {
              setKept(!open);
              setOpen(!open);
            }}
            onFocus={() => setReveal(true)}
            onBlur={() => setReveal(false)}
          >
            {row.name}
          </button>
        )}
        {row.label || flag || reference ? (
          <span className="thread-step-facts">
            {row.label ? (
              <span className="thread-step-fact">
                <MorphingText text={row.label} duration={360} />
              </span>
            ) : null}
            {/* Its own pill, in the step's tone: the part of the fact that is
                the problem, divided from the part that is not -- and, where
                there is somewhere to take the reader, the way there. */}
            {flag ? (
              flagAction && flag.motion !== 'out' ? (
                <button
                  type="button"
                  className="thread-step-flag"
                  data-motion={flag.motion}
                  onClick={flagAction.onPress}
                >
                  {flag.text}
                  <ArrowUpRight
                    aria-hidden
                    size={12}
                    strokeWidth={2.5}
                    className="flex-none"
                  />
                  <span className="sr-only"> — {flagAction.label}</span>
                </button>
              ) : (
                <span
                  className="thread-step-flag"
                  data-motion={flag.motion}
                  onAnimationEnd={(event) => {
                    if (event.animationName === 'thread-fact-out')
                      setFlag(null);
                  }}
                >
                  {flag.text}
                </span>
              )
            ) : null}
            {reference ? (
              reference.action ? (
                <button
                  type="button"
                  className="thread-step-link"
                  onClick={reference.action.onPress}
                >
                  {reference.label}
                  <ArrowUpRight
                    aria-hidden
                    size={12}
                    strokeWidth={2.5}
                    className="flex-none"
                  />
                  <span className="sr-only"> — {reference.action.label}</span>
                </button>
              ) : (
                <span className="thread-step-fact">{reference.label}</span>
              )
            ) : null}
          </span>
        ) : null}
        {row.status === 'running' && arrived ? (
          <span className="thread-step-time" data-elapsed>
            <Elapsed reveal={reveal} />
          </span>
        ) : row.duration ? (
          <span className="thread-step-time">
            {/* Both readings share one cell and cross-fade vertically, so the
                column keeps its width and nothing slides sideways. */}
            <span
              className="thread-step-time-face"
              data-shown={!showWindow || undefined}
              aria-hidden="true"
            >
              {row.duration}
            </span>
            {row.window ? (
              <span
                className="thread-step-time-face"
                data-shown={showWindow || undefined}
                aria-hidden="true"
              >
                {row.window.from} – {row.window.to}
              </span>
            ) : null}
            <span className="sr-only">
              Took {row.duration}
              {row.window
                ? `, from ${row.window.from} to ${row.window.to}`
                : ''}
              .
            </span>
          </span>
        ) : null}
        {fixed ? null : (
          <ChevronTriangleDown aria-hidden className="thread-step-chevron" />
        )}
      </div>
      <div
        id={bodyId}
        ref={foldRef}
        className="thread-step-fold"
        inert={!open}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === 'grid-template-rows'
          )
            setClosing(false);
        }}
      >
        <div className="thread-step-clip">
          <div ref={bodyRef} className="thread-step-body">
            {body}
          </div>
        </div>
      </div>
    </li>
  );
}
