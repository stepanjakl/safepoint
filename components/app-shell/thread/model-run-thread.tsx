'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useContext, useEffect, useId, useState, type ReactNode } from 'react';

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
import { Pill, SEVERITY } from '@/components/ui/pill';
import { cx } from '@/lib/ui/cx';
import { DURATION_STATE } from '@/lib/ui/motion';
import { motionTime } from '@/lib/ui/motion-time';
import type {
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

import type { DataTabs } from '@/components/engine/data-drawer';
import { SheetReadCard, type RunRead } from '@/components/engine/read-step';
import { useRunDebug } from '@/components/engine/run-parts';
import { InstructionsText, RunNote } from '@/components/engine/run-parts';
import { ProposalTable } from '@/components/engine/propose/proposal-table';
import type {
  Decision,
  ProposalField,
  CheckReply,
} from '@/components/engine/propose/types';
import { cellUrl, SOURCE_KINDS, type SourceKind } from '@/lib/sources/model';
import ChainLink1Filled from 'blode-icons-react/icons/chain-link-1-filled';
import { SourceHead } from '@/components/app-shell/sources/source-head';
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
  instructions: { version: string; text: string; note?: string | null };
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
    // When the write was read back, once it was.
    writtenAt: string | null;
  } | null;
};

export type ModelRunActions = {
  onDecide: (changes: Record<string, Decision | null>, words: string) => void;
  onCheck: (
    key: string,
    values: Record<string, number>,
  ) => Promise<CheckReply | null>;
  // Again from the step that stopped.
  onRetry?: () => void;
  onWrite?: () => void;
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
}: {
  run: ModelRunView;
  actions: ModelRunActions;
  look?: ThreadLook;
  // For a demo: every step stays open as it finishes.
  keepOpen?: boolean;
}) {
  const { stage, facts } = run;
  const steps = modelRunStepsAt(stage, facts);
  const arrivals = useThreadArrivals(
    stage,
    steps.map((step) => step.id),
    look,
  );
  const stopped = stage === 'stopped' ? facts.stopped : null;
  const [readOpen, setReadOpen] = useState(true);
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
  const version = run.instructions.version;
  const openInstructions = () =>
    sheet?.currentVersion === version
      ? sheet.showInstructions()
      : sheet?.showVersion(version);

  const boxes: Record<string, ReactNode> = {
    request: run.instructions.note ? (
      <div className="grid gap-3">
        <RunNote text={run.instructions.note} />
        <InstructionsText text={run.instructions.text} />
      </div>
    ) : (
      <InstructionsText text={run.instructions.text} />
    ),
    sources:
      stopped?.at === 'sources' ? (
        <Stopped
          title="Could not read the sheet"
          reason={stopped.reason}
          again="Read again"
          {...actions}
        />
      ) : (
        <ResponseSection>
          <div className="grid gap-3">
            {facts.unfit.length ? (
              <AlertBox title="The sheet does not fit what this process reads. Fix it and start a new run:">
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
              open={readOpen}
              onOpenChange={setReadOpen}
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
          onCheck={actions.onCheck}
          icons
        />
      </ResponseSection>
    ) : null,
    commit: run.write ? (
      <ResponseSection>
        <Approval
          stage={stage}
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
      announcement={modelRunAnnouncement(arrivals.announced)}
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
  const allLines = (activity?.events ?? []).flatMap((event) =>
    describeEvent(event, facts, version),
  );
  const [shownCount, setShownCount] = useState(allLines.length);
  const [prevTotal, setPrevTotal] = useState(allLines.length);
  if (prevTotal !== allLines.length) {
    setPrevTotal(allLines.length);
    if (reduceMotion || allLines.length <= shownCount) {
      setShownCount(allLines.length);
    } else if (allLines.length > shownCount) {
      setShownCount(shownCount + 1);
    }
  }
  useEffect(() => {
    if (reduceMotion || shownCount >= allLines.length) return;
    const timer = setTimeout(
      () => setShownCount((count) => Math.min(allLines.length, count + 1)),
      motionTime(720) / rate,
    );
    return () => clearTimeout(timer);
  }, [reduceMotion, shownCount, allLines.length, rate]);

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

  // Hold the last thought text while Folding shut so it does not vanish mid-collapse.
  const [lastThought, setLastThought] = useState<string | null>(
    activity?.thought ?? null,
  );
  if (activity?.thought && activity.thought !== lastThought) {
    setLastThought(activity.thought);
  }
  const thoughtOpen = Boolean(working && activity?.thought);

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
    <div className="grid gap-3">
      <ol aria-label="What happened" className="model-log">
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
      <Fold open={thoughtOpen}>
        {lastThought ? (
          <figure className="bg-surface-inset rounded-control grid gap-1.5 p-3">
            <figcaption className="readout text-muted">Thinking</figcaption>
            <Thought text={lastThought} />
          </figure>
        ) : null}
      </Fold>
      <Fold open={Boolean(tokens && tokens.input + tokens.output > 0)}>
        {tokens && tokens.input + tokens.output > 0 ? (
          <div className="model-log-meta flex flex-wrap items-center gap-2">
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

// A thought summary, its bold title as a title: **Title**, then the text.
function Thought({ text }: { text: string }) {
  const match = /^…?\*\*(.+?)\*\*\s*([^]*)$/.exec(text);
  return (
    <p className="text-dense text-muted-strong text-pretty whitespace-pre-line">
      {match ? (
        <>
          <span className="text-primary font-medium">{match[1]}</span>
          {match[2] ? `\n${match[2]}` : ''}
        </>
      ) : (
        text
      )}
    </p>
  );
}

function Stopped({
  title,
  reason,
  again,
  onRetry,
  busy,
}: {
  title: string;
  reason: string;
  again: string;
  onRetry?: () => void;
  busy?: boolean;
}) {
  return (
    <div
      role="alert"
      data-severity={SEVERITY.blocked}
      className="thread-stopped bg-severity-fill border-severity-pill-ring rounded-shell grid justify-items-start gap-3 border px-4.5 py-3.5 text-pretty"
    >
      <div className="grid gap-1">
        <p className="text-dense text-severity-strong font-medium">{title}</p>
        <p className="text-dense text-severity-ink break-words">{reason}</p>
      </div>
      {onRetry ? (
        <Button size="small" isDisabled={busy} onPress={onRetry}>
          {again}
        </Button>
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
  field: string;
  write: NonNullable<ModelRunView['write']>;
  names: Record<string, string>;
  decisions: Record<string, Decision>;
  mismatch: string | null;
  onWrite?: () => void;
  onUndo?: () => void;
  busy?: boolean;
}) {
  const count = (kind: Decision['kind']) =>
    Object.values(decisions).filter((d) => d.kind === kind).length;
  const written = stage === 'committed' || stage === 'intervention';
  const cells = write.outputs.reduce(
    (total, output) => total + output.changes.length,
    0,
  );
  const n = plural(cells, 'value');

  return (
    <div className="grid gap-4">
      {/* What went wrong first, before what it concerns. */}
      {stage === 'intervention' && mismatch ? (
        <AlertBox>{mismatch}</AlertBox>
      ) : null}
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
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={stage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION_STATE, ease: 'easeOut' }}
        >
          {stage === 'ready_to_commit' && cells ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="medium"
                isDisabled={busy || write.problems.length > 0 || !onWrite}
                onPress={onWrite}
              >
                Approve and write {n}
              </Button>
            </div>
          ) : stage === 'committed' ? (
            <div className="flex flex-wrap items-center gap-3">
              <Pill tone="ready">
                Written and read back
                {write.writtenAt ? ` · ${clock(write.writtenAt)}` : ''}
              </Pill>
              <Button
                size="medium"
                isDisabled={busy || !onUndo}
                onPress={onUndo}
              >
                Undo the write
              </Button>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
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
      <SourceHead kind={output.kind} title={output.title} titleId={titleId} />
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
                      {output.url ? (
                        <a
                          href={cellUrl(
                            output.kind,
                            output.url,
                            output.resourceIds?.[cell.tab],
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
