'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import {
  Thread,
  useThreadArrivals,
} from '@/components/app-shell/thread/thread-arrivals';
import { ResponseSection } from '@/components/app-shell/thread/thread-page';
import type { ThreadLook } from '@/components/app-shell/thread/thread-step';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import {
  DATA_TABLE_BODY,
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME_COLUMN,
  DATA_TABLE_NAME_UNDER,
  DATA_TABLE_SECONDARY_NAME,
  DATA_TABLE_RULE,
  DATA_TABLE_RULE_ON,
  DataTable,
} from '@/components/ui/data-table';
import { Fold } from '@/components/ui/fold';
import { MORPH_WORDS_MS, MorphingText } from '@/components/ui/morphing-text';
import { Pill } from '@/components/ui/pill';
import { useHeightSwap } from '@/components/ui/height-swap';
import { SmoothHeight } from '@/components/ui/smooth-height';
import { cx } from '@/lib/ui/cx';
import {
  DURATION_STATE,
  DURATION_TAB_LEAVE,
  EASE_OUT_EMPHASIZED,
  EASE_OUT_QUAD,
} from '@/lib/ui/motion';
import { motionTime } from '@/lib/ui/motion-time';
import type {
  Application,
  CellChange,
  Proposal,
  ProposalActivity,
  StreamedPart,
} from '@/lib/engine/types';
import {
  describeEvent,
  modelRunAnnouncement,
  modelRunStepsAt,
  type ModelRunFacts,
  type ModelRunStage,
} from '@/lib/shell/model-run';

import {
  WriteControls,
  writePreviewNote,
  type HeldWriteCheck,
} from '@/components/engine/write-controls';
import type { DataTabs } from '@/components/engine/data-drawer';
import { SheetReadCard, type RunRead } from '@/components/engine/read-step';
import { Reveal } from '@/components/ui/reveal';
import { useScreenSettled } from '@/components/ui/screen-settled';
import { useRunDebug } from '@/components/engine/run-parts';
import type { ModelPlan } from '@/lib/models';
import {
  InstructionsText,
  RunModelLabel,
  RunNote,
} from '@/components/engine/run-parts';
import { ProposalTable } from '@/components/engine/propose/proposal-table';
import type {
  Decision,
  ProposalField,
  CheckReply,
} from '@/components/engine/propose/types';
import {
  cellUrl,
  SOURCE_KINDS,
  sourceTermsOf,
  type SourceKind,
} from '@/lib/sources/model';
import BoltFilled from 'blode-icons-react/icons/bolt-filled';
import ChainLink1Filled from 'blode-icons-react/icons/chain-link-1-filled';
import ChevronLeft from 'blode-icons-react/icons/chevron-left';
import ChevronRight from 'blode-icons-react/icons/chevron-right';
import {
  SourceHead,
  SourceOpenLink,
} from '@/components/app-shell/sources/source-head';
import { plural } from '@/components/engine/trial-parts';

// One source a run writes to, and the cells it changes there, in any of its
// resources (a sheet's tabs): each change names its own.
export type OutputWrite = {
  id: string;
  // The kind of source written to, which says what it is called.
  kind: SourceKind;
  // The source's own title, as its read gave it.
  title: string;
  // What names each record: the first heading of the table.
  key: string;
  url?: string;
  // Each resource's id, by name, so a cell can open where it is.
  resourceIds?: Record<string, number>;
  changes: CellChange[];
};

// A run the model works out alone, at one stage, as the person meets it.
export type ModelRunView = {
  stage: ModelRunStage;
  facts: ModelRunFacts;
  // What each record's proposal sets, as the process declares it.
  fields: ProposalField[];
  // The instructions the run answers to, and any one-off note saved with it.
  instructions: {
    version: string;
    text: string;
    note?: string | null;
    modelPlan?: ModelPlan | null;
  };
  // The kind of source read, which says what it and its parts are called.
  sourceKind: SourceKind;
  read: RunRead | null;
  // The read's values, where they are at hand rather than fetched by its id.
  data?: DataTabs;
  // The model at work, and what it did once it has answered.
  activity: ProposalActivity | null;
  review: {
    proposal: Proposal;
    names: Record<string, string>;
    decisions: Record<string, Decision>;
  } | null;
  write: {
    // Each place the decisions are written, in turn.
    outputs: OutputWrite[];
    problems: string[];
    error?: string | null;
    held?: HeldWriteCheck[];
    applicationStatus?: Application['status'];
    preview?: { tab?: string; tabExists: boolean };
    noChanges?: boolean;
    // When the write was read back, once it was.
    writtenAt: string | null;
  } | null;
};

export type ModelRunActions = {
  onDecide: (changes: Record<string, Decision | null>, words: string) => void;
  onConfirmDecisions?: () => void;
  onCheck: (
    key: string,
    values: Record<string, number>,
  ) => Promise<CheckReply | null>;
  // Again from the step that stopped.
  onRetry?: () => void;
  // Switch to a local mock run with sample data when a live step fails.
  onStartMock?: () => void;
  onWrite?: (acknowledged: string[]) => void;
  onUndo?: () => void;
  // A request under way, which the buttons wait for.
  busy?: boolean;
  announced?: string;
};

/*
  The thread of a run the model works out alone: its instructions, the sheet
  it read, the model at work, the review and the approval, moving as every
  run moves (thread-arrivals.tsx). It only draws: the live page
  and the workbench say what stage the run is at and what each button does.
*/
export function ModelRunThread({
  run,
  actions,
  look = 'proposed',
  keepOpen = false,
  enterFirst = false,
}: {
  run: ModelRunView;
  actions: ModelRunActions;
  look?: ThreadLook;
  // For a demo: every step stays open as it finishes.
  keepOpen?: boolean;
  // Play the first step's entrance animation (for a freshly started run).
  enterFirst?: boolean;
}) {
  const { stage, facts } = run;
  const steps = modelRunStepsAt(stage, facts);
  const arrivals = useThreadArrivals(
    stage,
    steps.map((step) => step.id),
    look,
    enterFirst,
  );
  const stopped = stage === 'stopped' ? facts.stopped : null;
  const shownRead = stage === 'reading' ? null : run.read;
  const [revealingRead, setRevealingRead] = useState(false);
  const [prevReadId, setPrevReadId] = useState<string | null>(
    shownRead?.id ?? null,
  );
  const nextReadId = shownRead?.id ?? null;
  if (prevReadId !== nextReadId) {
    setPrevReadId(nextReadId);
    setRevealingRead(
      nextReadId !== null &&
        arrivals.watched &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }

  // The version opens the sheet's Instructions tab, as on the rulebook run.
  const sheet = useContext(ProcessSheetActions);
  const sourceNoun = SOURCE_KINDS[run.sourceKind].noun;
  const version = run.instructions.version;
  const openInstructions = () =>
    sheet?.currentVersion === version
      ? sheet.showInstructions()
      : sheet?.showVersion(version);

  const boxes: Record<string, ReactNode> = {
    request:
      run.instructions.note || run.instructions.modelPlan ? (
        <div className="grid gap-3">
          {run.instructions.modelPlan ? (
            <RunModelLabel plan={run.instructions.modelPlan} />
          ) : null}
          {run.instructions.note ? (
            <RunNote text={run.instructions.note} />
          ) : null}
          <InstructionsText text={run.instructions.text} />
        </div>
      ) : (
        <InstructionsText text={run.instructions.text} />
      ),
    sources:
      stopped?.at === 'sources' ? (
        <Stopped
          title={`Could not read the ${sourceNoun}`}
          reason={stopped.reason}
          again="Read again"
          {...actions}
        />
      ) : (
        <ResponseSection>
          <div className="grid gap-3">
            {facts.unfit.length ? (
              <AlertBox
                title={`The ${sourceNoun} does not fit what this process reads. Fix it and start a new run:`}
              >
                <ul className="list-disc pl-5">
                  {facts.unfit.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </AlertBox>
            ) : null}
            <SheetReadCard
              kind={run.sourceKind}
              read={shownRead}
              revealing={revealingRead}
              onRevealed={() => setRevealingRead(false)}
              data={run.data}
            />
          </div>
        </ResponseSection>
      ),
    evaluation:
      stopped?.at === 'evaluation' ? (
        <div className="grid gap-4">
          <Stopped
            title="Could not finish the proposal"
            reason={stopped.reason}
            again="Propose again"
            {...actions}
          />
          <ModelAt
            activity={run.activity}
            facts={facts}
            version={version}
            working={false}
          />
        </div>
      ) : (
        <ModelAt
          activity={run.activity}
          facts={facts}
          version={version}
          working={stage === 'evaluating'}
        />
      ),
    review: run.review ? (
      <ResponseSection>
        <ProposalTable
          fields={run.fields}
          proposal={run.review.proposal}
          names={run.review.names}
          calculated={{ calculations: [], rows: {} }}
          decisions={run.review.decisions}
          readId={run.read?.id ?? ''}
          announced={actions.announced ?? ''}
          onDecide={actions.onDecide}
          onConfirm={actions.onConfirmDecisions}
          onCheck={actions.onCheck}
          icons
        />
      </ResponseSection>
    ) : null,
    commit: run.write ? (
      <ResponseSection>
        <Approval
          stage={stage}
          sourceKind={run.sourceKind}
          field={facts.subject.field}
          write={run.write}
          names={run.review?.names ?? {}}
          decisions={run.review?.decisions ?? {}}
          mismatch={facts.mismatch}
          {...actions}
        />
      </ResponseSection>
    ) : null,
  };

  return (
    <Thread
      arrivals={arrivals}
      steps={steps}
      boxes={boxes}
      look={look}
      announcement={
        arrivals.announced === 'ready_to_commit' && run.write?.noChanges
          ? 'Everything decided. Nothing to write.'
          : arrivals.announced === 'ready_to_commit' &&
              run.write?.applicationStatus === 'pending'
            ? 'Awaiting confirmation of the write.'
            : modelRunAnnouncement(arrivals.announced)
      }
      keepOpen={keepOpen}
      headingActions={{
        request: { label: version, onPress: openInstructions },
      }}
    />
  );
}

/*
  The model at work, as a timeline read top to bottom: what was sent and to
  which model, the wait, what came back and what the app's checks made of it.
  Every line is an engine event worded in the process's own nouns
  (describeEvent). The exact stream is one press away beneath it.
*/
export function ModelAt({
  activity,
  facts,
  version,
  working,
  debug,
  rate = 1,
}: {
  activity: ProposalActivity | null;
  facts: ModelRunFacts;
  version: string;
  working: boolean;
  debug?: boolean;
  rate?: number;
}) {
  const runDebug = useRunDebug();
  const showDebug = debug ?? runDebug;
  const reduceMotion = useReducedMotion();
  const allLines = (activity?.events ?? []).flatMap((event) => {
    const eventLines = describeEvent(event, facts, version);
    return eventLines.map((line, index) => ({
      ...line,
      completesAnswer:
        event.kind === 'answered' && index === eventLines.length - 1,
    }));
  });
  const [shownCount, setShownCount] = useState(allLines.length);
  const [prevTotal, setPrevTotal] = useState(allLines.length);
  if (prevTotal !== allLines.length) {
    setPrevTotal(allLines.length);
    if (reduceMotion || !working || allLines.length <= shownCount) {
      setShownCount(allLines.length);
    } else if (allLines.length > shownCount) {
      setShownCount(shownCount + 1);
    }
  } else if (!working && shownCount < allLines.length) {
    setShownCount(allLines.length);
  }
  useEffect(() => {
    if (reduceMotion || !working || shownCount >= allLines.length) return;
    const timer = setTimeout(
      () => setShownCount((count) => Math.min(allLines.length, count + 1)),
      motionTime(720) / rate,
    );
    return () => clearTimeout(timer);
  }, [reduceMotion, working, shownCount, allLines.length, rate]);

  const lines = allLines.slice(0, shownCount);
  const draining = shownCount < allLines.length;
  const firstAt = lines[0]?.at;
  const tokens = activity?.tokens;
  // What the run waits on: the answer to a request, or to a send-back. An
  // answer the app took leaves nothing to wait for.
  const latest = activity?.events.at(-1);
  const waitingOn =
    !working || !latest
      ? null
      : latest.kind === 'asked'
        ? 'the answer'
        : latest.kind === 'answered' && latest.problems.length
          ? 'the corrected answer'
          : latest.kind === 'tried'
            ? 'the answer'
            : null;
  const [raw, setRaw] = useState(false);
  const rawId = useId();
  const showWaiting = Boolean(
    draining || (working && (!latest || waitingOn || activity?.writing)),
  );
  const [everWaited, setEverWaited] = useState(showWaiting);
  if (showWaiting && !everWaited) setEverWaited(true);

  const [initialKeys] = useState(
    () =>
      new Set([
        ...lines.map((line, index) => `${index}-${line.at}`),
        ...(showWaiting ? ['waiting'] : []),
      ]),
  );

  // Extract every reasoning section from the kept stream (so finished runs
  // reloaded from the server still show all thinking steps even after
  // `activity.thought` is cleared), and fall back to accumulating live
  // `activity.thought` values when the stream carries no reasoning parts.
  const streamThoughts = thoughtsFromActivity(activity);
  const [liveThoughts, setLiveThoughts] = useState<string[]>(() =>
    activity?.thought ? [activity.thought] : [],
  );
  const [viewedThought, setViewedThought] = useState<number | null>(null);
  const [thoughtDir, setThoughtDir] = useState<1 | -1>(1);
  if (
    activity &&
    activity.events.length === 0 &&
    !activity.thought &&
    liveThoughts.length > 0
  ) {
    setLiveThoughts([]);
    setViewedThought(null);
    setThoughtDir(1);
  } else if (activity?.thought && liveThoughts.at(-1) !== activity.thought) {
    setLiveThoughts([...liveThoughts, activity.thought]);
    if (viewedThought === null) setThoughtDir(1);
  }
  const thoughts = streamThoughts.length > 0 ? streamThoughts : liveThoughts;
  const activeThoughtIndex =
    viewedThought === null
      ? Math.max(0, thoughts.length - 1)
      : Math.min(viewedThought, Math.max(0, thoughts.length - 1));
  const activeThought = thoughts[activeThoughtIndex] ?? null;
  const parsedThought = activeThought ? thoughtParts(activeThought) : null;
  const logRef = useRef<HTMLOListElement>(null);
  const screenSettled = useScreenSettled();
  const [thoughtRevealed, setThoughtRevealed] = useState(
    () => !working && Boolean(activeThought),
  );
  const thoughtReady =
    Boolean(activeThought) &&
    (!working || lines.some((line) => line.completesAnswer));
  const thoughtOpen = thoughtReady && (reduceMotion || thoughtRevealed);

  useEffect(() => {
    const log = logRef.current;
    if (!log || !thoughtReady || thoughtOpen || !screenSettled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The log's transitions include the staggered answer text and the waiting
    // row's collapse. The pending pulse can run indefinitely.
    const waitForLog = () => {
      if (cancelled) return;
      const transitions = log
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation instanceof CSSTransition &&
            (animation.pending || animation.playState === 'running'),
        );
      if (transitions.length) {
        void Promise.allSettled(
          transitions.map((animation) => animation.finished),
        ).then(waitForLog);
      } else {
        timer = setTimeout(
          () => setThoughtRevealed(true),
          motionTime(150) / rate,
        );
      }
    };
    const frame = requestAnimationFrame(waitForLog);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [thoughtReady, thoughtOpen, screenSettled, shownCount, showWaiting, rate]);

  const liveStatusText = activity?.writing
    ? 'Writing the answer'
    : waitingOn
      ? `Waiting for ${waitingOn}…`
      : 'Choosing a model…';
  // Hold the last active waiting label while draining or collapsing out.
  const [statusText, setStatusText] = useState(liveStatusText);
  if (showWaiting && !draining && liveStatusText !== statusText) {
    setStatusText(liveStatusText);
  }

  const progressPct = activity?.writing
    ? Math.min(100, Math.round((activity.writing / facts.records) * 100))
    : 0;

  const arrive = {
    initial: reduceMotion ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: reduceMotion ? undefined : { opacity: 0 },
    transition: { duration: DURATION_STATE, ease: 'easeOut' as const },
  };
  const stream = activity?.stream ?? [];
  return (
    <div className="grid">
      <ol ref={logRef} aria-label="What happened" className="model-log">
        {lines.map((line, index) => {
          const key = `${index}-${line.at}`;
          const elapsed = elapsedSince(line.at, firstAt);
          return (
            <li
              key={key}
              className="model-log-item"
              data-entering={!initialKeys.has(key) || undefined}
              data-latest={
                (!showWaiting && index === lines.length - 1) || undefined
              }
              data-problem={line.problem || undefined}
              data-by={line.by}
            >
              <div className="model-log-clip">
                <div className="model-log-row">
                  <span aria-hidden className="model-log-dot" />
                  <span className="model-log-body">
                    {line.details ? (
                      <LineWithDetails
                        text={line.text}
                        details={line.details}
                      />
                    ) : (
                      <span className="text-pretty">{line.text}</span>
                    )}
                  </span>
                  {elapsed ? (
                    <time dateTime={line.at} className="model-log-time">
                      {elapsed}
                    </time>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {everWaited ? (
          <li
            key="waiting"
            className="model-log-item"
            data-entering={!initialKeys.has('waiting') || undefined}
            data-pending={showWaiting || undefined}
            data-collapsed={!showWaiting || undefined}
            aria-hidden={!showWaiting || undefined}
          >
            <div className="model-log-clip">
              <div className="model-log-row">
                <span aria-hidden className="model-log-dot" />
                <span className="model-log-body flex flex-wrap items-center gap-x-2 gap-y-1">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={statusText}
                      className="model-log-active"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0 }}
                      transition={{
                        duration: reduceMotion ? 0 : DURATION_STATE,
                        ease: 'easeOut',
                      }}
                    >
                      {statusText}
                    </motion.span>
                  </AnimatePresence>
                  {activity?.writing ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-micro text-muted tabular-nums">
                        <MorphingText
                          text={`${Math.min(activity.writing, facts.records)} of ${facts.records}`}
                        />
                      </span>
                      <span aria-hidden className="model-log-track">
                        <span
                          className="model-log-fill"
                          style={{ width: `${progressPct}%` }}
                        />
                      </span>
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </li>
        ) : null}
      </ol>
      <Reveal show={Boolean(thoughtOpen)}>
        {parsedThought ? (
          <div className="pt-3">
            <AlertBox
              tone="neutral"
              title={
                parsedThought.title || thoughts.length > 1 ? (
                  <ThoughtSlide
                    slideKey={activeThoughtIndex}
                    direction={thoughtDir}
                    reduceMotion={Boolean(reduceMotion)}
                    className="model-thought-title"
                    textClassName="text-meta font-medium text-pretty"
                    text={parsedThought.title ?? ''}
                  />
                ) : undefined
              }
              trailing={
                thoughts.length > 1 ? (
                  <div
                    role="group"
                    aria-label="Thinking steps"
                    className="inline-flex items-center gap-1"
                  >
                    <span className="text-micro text-muted px-1 tabular-nums">
                      <span className="text-primary font-semibold">
                        <MorphingText text={String(activeThoughtIndex + 1)} />
                      </span>
                      {' / '}
                      <MorphingText text={String(thoughts.length)} />
                    </span>
                    <Button
                      size="xsmall"
                      shape="round"
                      className="size-6 px-0"
                      aria-label="Previous thinking step"
                      isDisabled={activeThoughtIndex <= 0}
                      onPress={() => {
                        setThoughtDir(-1);
                        setViewedThought(Math.max(0, activeThoughtIndex - 1));
                      }}
                    >
                      <ChevronLeft
                        aria-hidden
                        size={15}
                        strokeWidth={2.2}
                        className="flex-none"
                      />
                    </Button>
                    <Button
                      size="xsmall"
                      shape="round"
                      className="size-6 px-0"
                      aria-label="Next thinking step"
                      isDisabled={activeThoughtIndex >= thoughts.length - 1}
                      onPress={() => {
                        const next = activeThoughtIndex + 1;
                        setThoughtDir(1);
                        setViewedThought(
                          next >= thoughts.length - 1 ? null : next,
                        );
                      }}
                    >
                      <ChevronRight
                        aria-hidden
                        size={15}
                        strokeWidth={2.2}
                        className="flex-none"
                      />
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {parsedThought.body ? (
                <ThoughtSlide
                  slideKey={activeThoughtIndex}
                  direction={thoughtDir}
                  reduceMotion={Boolean(reduceMotion)}
                  className="model-thought-body"
                  textClassName="text-meta leading-relaxed text-pretty whitespace-pre-line"
                  text={parsedThought.body}
                />
              ) : null}
            </AlertBox>
          </div>
        ) : null}
      </Reveal>
      <Fold open={Boolean(tokens && tokens.input + tokens.output > 0)}>
        {tokens && tokens.input + tokens.output > 0 ? (
          <div className="model-log-meta flex flex-wrap items-center gap-2 pt-3.5">
            {/* Facts about the step, as its heading's facts are drawn. */}
            <Fact text={`${thousands(tokens.input)} tokens in`} />
            <Fact text={`${thousands(tokens.output)} out`} />
            {tokens.thinking ? (
              <Fact text={`${thousands(tokens.thinking)} thinking`} />
            ) : null}
            {activity?.stepMs ? <Fact text={seconds(activity.stepMs)} /> : null}
          </div>
        ) : null}
      </Fold>
      <Fold open={showDebug && stream.length > 0}>
        {showDebug && stream.length > 0 ? (
          <div className="pt-3">
            <section
              aria-label="Debug"
              className="trial-setup rounded-shell grid gap-3 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="readout text-muted">Debug</span>
                <Button
                  size="xsmall"
                  aria-expanded={raw}
                  aria-controls={rawId}
                  onPress={() => setRaw(!raw)}
                >
                  {raw ? 'Hide' : 'Show'} raw model output
                </Button>
              </div>
              <Fold open={raw} id={rawId}>
                <ModelOutput stream={stream} arrive={arrive} />
              </Fold>
            </section>
          </div>
        ) : null}
      </Fold>
    </div>
  );
}

// A fact in a step's body, drawn as the facts in its heading are.
function Fact({ text }: { text: string }) {
  return (
    <span className="thread-step-fact">
      <MorphingText text={text} duration={MORPH_WORDS_MS} />
    </span>
  );
}

// A grouped line, with each thing behind it one press away.
function LineWithDetails({
  text,
  details,
}: {
  text: string;
  details: string[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="grid justify-items-start gap-1.5">
      <span className="text-pretty">{text}</span>
      <Button
        size="xsmall"
        shape="round"
        aria-expanded={open}
        aria-controls={id}
        onPress={() => setOpen(!open)}
      >
        {open ? 'Hide' : 'Show'} each ({details.length})
      </Button>
      <Fold open={open} id={id} className="w-full">
        <ul className="text-meta text-muted grid gap-0.5 pt-0.5">
          {details.map((detail, index) => (
            <li key={index} className="text-pretty">
              {detail}
            </li>
          ))}
        </ul>
      </Fold>
    </span>
  );
}

/*
  Exactly what came back while the model worked, part by part as the AI SDK
  streamed it: each part's type, when it arrived, and every field as it was
  kept. The tool's answer is the app's own, sent back to the model, and is
  marked so.
*/
function ModelOutput({
  stream,
  arrive,
}: {
  stream: StreamedPart[];
  arrive: Record<string, unknown>;
}) {
  return (
    <section aria-label="Model output" className="grid gap-2">
      <p className="readout text-muted">
        Model output · {plural(stream.length, 'part')}
      </p>
      <ol className="grid gap-2">
        <AnimatePresence initial={false}>
          {stream.map(({ at, from, part }, index) => {
            const { type, ...fields } = part;
            const shown = Object.keys(fields).length
              ? JSON.stringify(fields, null, 2)
              : null;
            return (
              <motion.li key={index} className="grid gap-1" {...arrive}>
                <p className="text-meta flex flex-wrap items-baseline gap-x-2">
                  <span className="value font-medium">{type}</span>
                  {from === 'app' ? (
                    <span className="text-muted">sent back by the app</span>
                  ) : null}
                  <time
                    dateTime={at}
                    className="value text-muted ms-auto tabular-nums"
                  >
                    {clockMs(at)}
                  </time>
                </p>
                {shown ? (
                  <pre
                    tabIndex={0}
                    aria-label={`${type}, as it came`}
                    className="bg-surface-inset rounded-control value text-meta max-h-64 overflow-auto p-3 break-all whitespace-pre-wrap"
                  >
                    {shown}
                  </pre>
                ) : null}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </section>
  );
}

// Extracts every **Title** reasoning section kept in the model's stream.
function thoughtsFromActivity(activity: ProposalActivity | null): string[] {
  if (!activity?.stream?.length) return [];
  const sections: string[] = [];
  for (const entry of activity.stream) {
    if (
      (entry.part.type === 'reasoning-start' ||
        entry.part.type === 'reasoning-delta' ||
        entry.part.type === 'reasoning') &&
      typeof entry.part.text === 'string'
    ) {
      for (const raw of entry.part.text.split(/\n(?=\*\*)/)) {
        const trimmed = raw.trim();
        if (trimmed) sections.push(trimmed);
      }
    }
  }
  return sections;
}

// A thought summary split into its bold title (**Title**) and body text.
function thoughtParts(text: string): { title: string | null; body: string } {
  const match = /^…?\*\*(.+?)\*\*\s*([^]*)$/.exec(text);
  if (!match) return { title: null, body: text };
  return { title: match[1] ?? null, body: match[2] ?? '' };
}

function thoughtSlideVariants(reduceMotion: boolean) {
  return {
    enter: (dir: number) =>
      reduceMotion
        ? { opacity: 1, x: 0 }
        : { opacity: 0, x: dir * 18, transition: { duration: 0 } },
    center: {
      opacity: 1,
      x: 0,
      transition: {
        duration: reduceMotion ? 0 : DURATION_STATE,
        ease: EASE_OUT_EMPHASIZED,
      },
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: reduceMotion ? 0 : dir * -18,
      transition: {
        duration: reduceMotion ? 0 : DURATION_TAB_LEAVE,
        ease: EASE_OUT_QUAD,
      },
    }),
  };
}

// Exits cleanly before entering (no overlap/ghosting) and uses SmoothHeight so
// the box itself eases smoothly between thoughts of different lengths without
// fighting ThreadStep or clipping content below it.
function ThoughtSlide({
  slideKey,
  direction,
  reduceMotion,
  className,
  textClassName,
  text,
}: {
  slideKey: number;
  direction: 1 | -1;
  reduceMotion: boolean;
  className: string;
  textClassName: string;
  text: string;
}) {
  const { version, hold, ready, measure, onSettled } = useHeightSwap(
    slideKey,
    reduceMotion,
  );
  return (
    <SmoothHeight className={className} hold={hold} onSettled={onSettled}>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.p
          key={version}
          ref={measure}
          custom={direction}
          inert={!ready}
          className={textClassName}
          variants={thoughtSlideVariants(reduceMotion)}
          initial="enter"
          animate={ready ? 'center' : 'enter'}
          exit="exit"
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </SmoothHeight>
  );
}

function Stopped({
  title,
  reason,
  again,
  onRetry,
  onStartMock,
  busy,
}: {
  title: string;
  reason: string;
  again: string;
  onRetry?: () => void;
  onStartMock?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <AlertBox
        title={title}
        className="thread-stopped"
        action={
          onRetry ? (
            <Button size="small" isDisabled={busy} onPress={onRetry}>
              {again}
            </Button>
          ) : null
        }
      >
        {reason}
      </AlertBox>
      {onStartMock ? (
        <AlertBox
          tone="accent"
          className="thread-stopped"
          title={
            <span className="flex items-center gap-1.5">
              <BoltFilled
                aria-hidden
                size={14}
                className="alert-box-ink flex-none"
              />
              Try a mock run instead
            </span>
          }
          action={
            <Button size="small" variant="primary" onPress={onStartMock}>
              Start mock run
            </Button>
          }
        >
          Walk through the full flow with sample data — no live connection
          needed.
        </AlertBox>
      ) : null}
    </div>
  );
}

/*
  What the decisions write, and where: a card for each source written to,
  headed as every source card is, and in it each cell -- its tab and address,
  what it holds now and what it will hold. One approval writes them all; once
  written and read back, the write can be undone while the cells are
  unchanged.
*/
function Approval({
  stage,
  sourceKind,
  field,
  write,
  names,
  decisions,
  mismatch,
  onWrite,
  onUndo,
  busy,
}: {
  stage: ModelRunStage;
  sourceKind: SourceKind;
  field: string;
  write: NonNullable<ModelRunView['write']>;
  names: Record<string, string>;
  decisions: Record<string, Decision>;
  mismatch: string | null;
  onWrite?: (acknowledged: string[]) => void;
  onUndo?: () => void;
  busy?: boolean;
}) {
  const count = (kind: Decision['kind']) =>
    Object.values(decisions).filter((d) => d.kind === kind).length;
  const written = stage === 'committed' || stage === 'intervention';
  const rows = write.outputs.reduce(
    (total, output) =>
      total + new Set(output.changes.map((change) => change.key)).size,
    0,
  );
  const { noun, resource } = sourceTermsOf(sourceKind);
  const status =
    write.applicationStatus ??
    (stage === 'committed'
      ? 'verified'
      : stage === 'intervention'
        ? 'mismatch'
        : undefined);
  const preview = write.preview;

  return (
    <div className="grid gap-4">
      {/* What went wrong first, before what it concerns. */}
      {stage === 'intervention' && mismatch ? (
        <AlertBox>{mismatch}</AlertBox>
      ) : null}
      {write.error ? <AlertBox>{write.error}</AlertBox> : null}
      {write.problems.length ? (
        <AlertBox>
          <ul className="grid gap-1">
            {write.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </AlertBox>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="ready">{count('approve')} approved</Pill>
        {count('change') ? (
          <Pill tone="decision">{count('change')} changed</Pill>
        ) : null}
        {count('reject') ? (
          <Pill tone="neutral">{count('reject')} rejected</Pill>
        ) : null}
      </div>
      {write.outputs.map((output) => (
        <OutputCells
          key={output.id}
          output={output}
          field={field}
          names={names}
          decisions={decisions}
          written={written}
        />
      ))}
      {write.noChanges && !status ? (
        <p className="text-dense">Nothing to write.</p>
      ) : null}
      <div>
        <WriteControls
          outcome={
            status
              ? {
                  noun,
                  status,
                  at: status === 'verified' ? write.writtenAt : null,
                }
              : undefined
          }
          rows={rows}
          note={
            preview &&
            writePreviewNote({ ...preview, rows, resource: resource.singular })
          }
          held={write.held}
          canWrite={
            (stage === 'ready_to_commit' || stage === 'committing') &&
            rows > 0 &&
            status !== 'pending' &&
            write.problems.length === 0
          }
          canUndo={written}
          busy={busy}
          onWrite={onWrite}
          onUndo={onUndo}
        />
      </div>
    </div>
  );
}

/*
  One file's values, its tabs in turn: the file names the card, each tab
  heads its own group of rows, and each row's cell is a link to that cell.
  Before and after share one width at the right, so a column of figures
  reads down.
*/
function OutputCells({
  output,
  field,
  names,
  decisions,
  written,
}: {
  output: OutputWrite;
  // What each cell holds, in the process's word: order.
  field: string;
  names: Record<string, string>;
  decisions: Record<string, Decision>;
  written: boolean;
}) {
  const source = SOURCE_KINDS[output.kind];
  const titleId = useId();
  const tabs = new Map<string, ReturnType<typeof cellParts>[]>();
  for (const change of output.changes) {
    const cell = cellParts(change);
    tabs.set(cell.tab, [...(tabs.get(cell.tab) ?? []), cell]);
  }
  const figure = 'w-20 text-right tabular-nums';
  return (
    <DataTable as="article" aria-labelledby={titleId}>
      <SourceHead kind={output.kind} title={output.title} titleId={titleId}>
        {output.url ? (
          <SourceOpenLink
            kind={output.kind}
            href={output.url}
            title={output.title}
            quiet
          />
        ) : null}
      </SourceHead>
      <div className="min-w-0 overflow-x-auto">
        <table className={cx('output-cells', DATA_TABLE_BODY)}>
          <caption className="sr-only">
            {written
              ? `What was written to ${output.title}, by tab and cell`
              : `What approving writes to ${output.title}, by tab and cell`}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className={cx(DATA_TABLE_HEAD, 'pr-3 pl-5 text-left')}
              >
                {output.key}
              </th>
              <th
                scope="col"
                className={cx(DATA_TABLE_HEAD, DATA_TABLE_NAME_COLUMN, 'pr-3')}
              >
                <span className="sr-only">Name</span>
              </th>
              {/* Wide enough for an open cell pill: it widens in place. */}
              <th
                scope="col"
                className={cx(DATA_TABLE_HEAD, 'w-24 px-3 text-left')}
              >
                Cell
              </th>
              <th scope="col" className={cx(DATA_TABLE_HEAD, 'px-3', figure)}>
                Before
              </th>
              <th
                scope="col"
                className={cx(DATA_TABLE_HEAD, 'pr-5 pl-3', figure)}
              >
                After
              </th>
            </tr>
          </thead>
          {[...tabs].map(([tab, cells]) => (
            <tbody key={tab}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={5}
                  className="pt-5 pb-2 pl-5 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{tab}</span>
                    <Fact text={plural(cells.length, 'value')} />
                    <span
                      aria-hidden
                      className="border-raised-ring border-b-section min-w-0 flex-1"
                    />
                  </span>
                </th>
              </tr>
              {cells.map((cell, index) => {
                const changed = decisions[cell.key]?.kind === 'change';
                const resourceId = output.resourceIds?.[tab];
                const rule = index > 0;
                // Each tab's last row has room below it, before the next
                // tab's heading or the card's edge.
                const last = index === cells.length - 1;
                const rowY = last ? 'pt-2.5 pb-3' : 'py-2.5';
                return (
                  <tr key={`${cell.key}-${cell.field}-${cell.address}`}>
                    <th
                      scope="row"
                      className={cx(
                        'pr-3 pl-(--row-rule-inset) text-left font-normal whitespace-nowrap',
                        rowY,
                        rule && DATA_TABLE_RULE,
                      )}
                    >
                      <span className="font-label">{cell.key}</span>
                      {names[cell.key] ? (
                        <span className={DATA_TABLE_NAME_UNDER}>
                          {names[cell.key]}
                        </span>
                      ) : null}
                    </th>
                    <td
                      className={cx(
                        DATA_TABLE_NAME_COLUMN,
                        DATA_TABLE_SECONDARY_NAME,
                        'pr-3',
                        rowY,
                        rule && DATA_TABLE_RULE_ON,
                      )}
                    >
                      {names[cell.key] ?? null}
                      {changed ? (
                        <span className="text-meta text-muted font-normal">
                          {' · changed'}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={cx('px-3', rowY, rule && DATA_TABLE_RULE_ON)}
                    >
                      {output.url &&
                      (output.kind !== 'google-sheets' ||
                        resourceId !== undefined) ? (
                        <a
                          href={cellUrl(
                            output.kind,
                            output.url,
                            resourceId,
                            cell.address,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cell-link value text-meta"
                        >
                          {cell.address}
                          <ChainLink1Filled
                            aria-hidden
                            className="cell-link-icon"
                          />
                          <span className="sr-only">
                            {`, ${tab} in ${output.title}, ${source.name} (opens in a new tab)`}
                          </span>
                        </a>
                      ) : (
                        <span className="value text-meta">{cell.address}</span>
                      )}
                    </td>
                    <td
                      className={cx(
                        'value text-muted px-3',
                        rowY,
                        figure,
                        rule && DATA_TABLE_RULE_ON,
                      )}
                    >
                      {cell.before === null || cell.before === '' ? (
                        <>
                          <span aria-hidden>—</span>
                          <span className="sr-only">Empty</span>
                        </>
                      ) : (
                        String(cell.before)
                      )}
                    </td>
                    <td
                      className={cx(
                        'value pr-5 pl-3 font-semibold',
                        rowY,
                        figure,
                        rule && DATA_TABLE_RULE_ON,
                      )}
                    >
                      {cell.after}
                      <span className="sr-only"> {field}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </DataTable>
  );
}

// A change with its cell split: Orders!B4 as the tab Orders and B4.
const cellParts = (change: CellChange) => {
  const at = change.cell.lastIndexOf('!');
  return {
    ...change,
    tab: at < 0 ? '' : change.cell.slice(0, at),
    address: change.cell.slice(at + 1),
  };
};

const elapsedSince = (iso: string, startIso: string | undefined) => {
  if (!startIso) return '';
  const delta = Math.max(0, Date.parse(iso) - Date.parse(startIso));
  const secs = Math.round(delta / 1000);
  return secs === 0 ? '0s' : `+${secs}s`;
};

const clock = (at: string) =>
  new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const seconds = (ms: number) =>
  ms < 60_000
    ? `${Math.max(1, Math.round(ms / 1000))}s`
    : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;

// To the millisecond: parts of one answer arrive within a few of each other.
const clockMs = (at: string) =>
  `${clock(at)}.${String(new Date(at).getMilliseconds()).padStart(3, '0')}`;

const thousands = (count: number) =>
  count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
