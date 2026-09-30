// A client component for the marker's sake: `Focusable` resolves its single
// child on the client, and a child handed to it from a server component
// arrives unresolved. It also holds whether the step is folded.
'use client';

import {
  createContext,
  useContext,
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
import CircleCheckFilled from 'blode-icons-react/icons/circle-check-filled';
import CircleXFilled from 'blode-icons-react/icons/circle-x-filled';
import ExclamationCircleFilled from 'blode-icons-react/icons/exclamation-circle-filled';
import { Glyph } from '@/components/ui/glyph';
import { Tooltip } from '@/components/ui/tooltip';
import { stepMarker, toneText } from '@/components/review/markers';
import { STEP_STATUS_LABELS, type ProcessStep } from '@/lib/process/model';
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

function ProposedMark({ step }: { step: ProcessStep }) {
  if (step.status === 'running') return <SegmentedRing count={3} />;
  if (step.status === 'pending')
    return <Glyph name={stepMarker.pending.glyph} size={10} />;
  const Icon = FILLED[step.status];
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

export function SegmentedRing({ count }: { count: 3 | 4 }) {
  const start = count === 3 ? -126 : -90;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className="thread-ring thread-segmented-ring"
      data-count={count}
    >
      <g className="thread-segmented-outer">
        {Array.from({ length: count }, (_, index) => (
          <circle
            key={index}
            className="thread-segmented-arc"
            cx="10"
            cy="10"
            r="9"
            pathLength={100}
            strokeDasharray={count === 4 ? '15 85' : '20 80'}
            transform={`rotate(${start + (index * 360) / count} 10 10)`}
          />
        ))}
      </g>
      <circle
        className="thread-ring-dot thread-segmented-dot"
        cx="10"
        cy="10"
        r="4.25"
      />
    </svg>
  );
}

/*
  The marker. It is focusable because a hover-only reveal puts the status word
  out of reach of a keyboard.
*/
function Marker({ step, settling }: { step: ProcessStep; settling: boolean }) {
  const look = useContext(ThreadLookContext);
  const marker = stepMarker[step.status];
  const status = STEP_STATUS_LABELS[step.status];
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
        data-settling={settling || undefined}
        tabIndex={0}
        role="img"
        aria-label={`${step.name}. ${status}.${progress}${step.note ? ` ${step.note}` : ''}`}
      >
        {look === 'proposed' ? (
          <ProposedMark step={step} />
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
  return step.status === 'running' || step.status === 'blocked' || latest;
}

export function ThreadStep({
  step,
  latest = false,
  enter = false,
  flagAction,
  reference,
  children,
}: {
  step: ProcessStep;
  latest?: boolean;
  // Arrived while the reader watched, rather than with the page: it eases in.
  enter?: boolean;
  flagAction?: FlagAction;
  reference?: StepReference;
  children: ReactNode;
}) {
  const bodyId = useId();
  const foldRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // The fold opens at one speed, so its duration follows the body's height.
  // Only the measurement lives here; the stylesheet turns it into time.
  useLayoutEffect(() => {
    const fold = foldRef.current;
    const body = bodyRef.current;
    if (!fold || !body) return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize ?? body.offsetHeight;
      fold.style.setProperty(
        '--thread-fold-height',
        String(Math.round(height)),
      );
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, []);
  const earned = earnsOpen(step, latest);
  const [open, setOpen] = useState(earned);
  const [settled, setSettled] = useState(earned);
  if (settled !== earned) {
    setSettled(earned);
    setOpen(earned);
  }
  // Whether the step finished while on screen: its marker settles once. Read
  // at the change, so a step that loads finished never plays it.
  const [status, setStatus] = useState(step.status);
  const [settling, setSettling] = useState(false);
  if (status !== step.status) {
    setSettling(status === 'running');
    setStatus(step.status);
  }
  // Fixed at mount: a step that was already here keeps still when later ones
  // arrive.
  const [entering] = useState(enter);
  // The duration gives way to its clock times under the pointer or the focus.
  const [reveal, setReveal] = useState(false);

  const showWindow = reveal && step.window !== undefined;

  return (
    <li
      className="thread-step"
      data-status={step.status}
      data-latest={latest || undefined}
      data-open={open || undefined}
      data-entering={entering || undefined}
      onPointerEnter={() => setReveal(true)}
      onPointerLeave={() => setReveal(false)}
    >
      <span className="thread-marker">
        <Marker step={step} settling={settling} />
      </span>
      {/* One row: the toggle stretches across it, so the whole row answers
          the pointer, and a flag sits above the stretch as its own control. */}
      <div className="thread-step-row">
        <button
          type="button"
          className="thread-step-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          onFocus={() => setReveal(true)}
          onBlur={() => setReveal(false)}
        >
          {step.name}
        </button>
        {step.label || step.flag || reference ? (
          <span className="thread-step-facts">
            {step.label ? (
              <span className="thread-step-fact">
                <MorphingText text={step.label} />
              </span>
            ) : null}
            {/* Its own pill, in the step's tone: the part of the fact that is
                the problem, divided from the part that is not -- and, where
                there is somewhere to take the reader, the way there. */}
            {step.flag ? (
              flagAction ? (
                <button
                  type="button"
                  className="thread-step-flag"
                  onClick={flagAction.onPress}
                >
                  {step.flag}
                  <ArrowUpRight
                    aria-hidden
                    size={12}
                    strokeWidth={2.5}
                    className="flex-none"
                  />
                  <span className="sr-only"> — {flagAction.label}</span>
                </button>
              ) : (
                <span className="thread-step-flag">{step.flag}</span>
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
        {step.duration ? (
          <span className="thread-step-time">
            {/* Both readings share one cell and cross-fade vertically, so the
                column keeps its width and nothing slides sideways. */}
            <span
              className="thread-step-time-face"
              data-shown={!showWindow || undefined}
              aria-hidden="true"
            >
              {step.duration}
            </span>
            {step.window ? (
              <span
                className="thread-step-time-face"
                data-shown={showWindow || undefined}
                aria-hidden="true"
              >
                {step.window.from} – {step.window.to}
              </span>
            ) : null}
            <span className="sr-only">
              Took {step.duration}
              {step.window
                ? `, from ${step.window.from} to ${step.window.to}`
                : ''}
              .
            </span>
          </span>
        ) : null}
        <ChevronTriangleDown aria-hidden className="thread-step-chevron" />
      </div>
      <div id={bodyId} ref={foldRef} className="thread-step-fold" inert={!open}>
        <div className="thread-step-clip">
          <div ref={bodyRef} className="thread-step-body">
            {children}
          </div>
        </div>
      </div>
    </li>
  );
}
