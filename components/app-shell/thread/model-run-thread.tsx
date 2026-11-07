'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useContext, useId, useState, type ReactNode } from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import {
  Thread,
  useThreadArrivals,
} from '@/components/app-shell/thread/thread-arrivals';
import { ResponseSection } from '@/components/app-shell/thread/thread-page';
import type { ThreadLook } from '@/components/app-shell/thread/thread-step';
import { Button } from '@/components/ui/button';
import {
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME,
  DATA_TABLE_NAME_COLUMN,
  DATA_TABLE_NAME_UNDER,
  DATA_TABLE_RULE,
  DATA_TABLE_RULE_ON,
  DataTable,
} from '@/components/ui/data-table';
import { Fold } from '@/components/ui/fold';
import { MORPH_WORDS_MS, MorphingText } from '@/components/ui/morphing-text';
import { Pill } from '@/components/ui/pill';
import { cx } from '@/lib/cx';
import { DURATION_STATE } from '@/lib/motion';
import type {
  CellChange,
  Proposal,
  ProposalActivity,
  StreamedPart,
} from '@/lib/definitions/types';
import {
  describeEvent,
  modelRunAnnouncement,
  modelRunStepsAt,
  type ModelRunFacts,
  type ModelRunStage,
} from '@/lib/process/model-run';

import type { DataTabs } from '@/components/brunch-orders/data-drawer';
import {
  InstructionsText,
  SheetReadCard,
  type RunRead,
} from '@/components/brunch-orders/orders-run';
import {
  ProposalTable,
  type Decision,
  type ProposalField,
  type ProposeResponse,
} from '@/components/brunch-orders/propose-step';
import { cellUrl, SOURCE_KINDS, type SourceKind } from '@/lib/sources/model';
import ChainLink1Filled from 'blode-icons-react/icons/chain-link-1-filled';
import { SourceHead } from '@/components/app-shell/sources/source-head';
import { plural } from '@/components/brunch-orders/trial-parts';

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
  // The instructions the run answers to.
  instructions: { version: string; text: string };
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
  // The line under a finished run.
  end: string | null;
};

export type ModelRunActions = {
  onDecide: (changes: Record<string, Decision | null>, words: string) => void;
  onCheck: (
    key: string,
    values: Record<string, number>,
  ) => Promise<ProposeResponse | null>;
  // Again from the step that stopped.
  onRetry?: () => void;
  onWrite?: () => void;
  onUndo?: () => void;
  // A request under way, which the buttons wait for.
  busy?: boolean;
  announced?: string;
};

const NOTE = 'text-dense text-muted text-pretty';
const ALERT = 'text-dense text-state-blocked';

/*
  The thread of a run the model works out alone: its instructions, the sheet
  it read, the model at work, the review and the approval, moving as the
  promotion's run moves (thread-arrivals.tsx). It only draws: the live page
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

  // The version opens the sheet's Instructions tab, as on the rulebook run.
  const sheet = useContext(ProcessSheetActions);
  const version = run.instructions.version;
  const openInstructions = () =>
    sheet?.currentVersion === version
      ? sheet.showInstructions()
      : sheet?.showVersion(version);

  const boxes: Record<string, ReactNode> = {
    request: <InstructionsText text={run.instructions.text} />,
    sources:
      stopped?.at === 'sources' ? (
        <Stopped reason={stopped.reason} again="Read again" {...actions} />
      ) : (
        <ResponseSection>
          <div className="grid gap-3">
            <SheetReadCard
              kind={run.sourceKind}
              read={stage === 'reading' ? null : run.read}
              open={readOpen}
              onOpenChange={setReadOpen}
              data={run.data}
            />
            {facts.unfit.length ? (
              <div role="alert" className="grid gap-1">
                <p className="text-dense">
                  The sheet does not fit what this process reads. Fix it and
                  start a new run:
                </p>
                <ul className="text-dense list-disc pl-5">
                  {facts.unfit.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </ResponseSection>
      ),
    evaluation:
      stopped?.at === 'evaluation' ? (
        <div className="grid gap-4">
          <ModelAt
            activity={run.activity}
            facts={facts}
            version={version}
            working={false}
          />
          <Stopped reason={stopped.reason} again="Propose again" {...actions} />
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
      end={arrivals.announced === 'committed' ? run.end : null}
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
function ModelAt({
  activity,
  facts,
  version,
  working,
}: {
  activity: ProposalActivity | null;
  facts: ModelRunFacts;
  version: string;
  working: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const lines = (activity?.events ?? []).flatMap((event) =>
    describeEvent(event, facts, version),
  );
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
  const arrive = {
    initial: reduceMotion ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: reduceMotion ? undefined : { opacity: 0 },
    transition: { duration: DURATION_STATE, ease: 'easeOut' },
  } as const;
  const stream = activity?.stream ?? [];
  return (
    <div className="grid gap-3">
      <ol aria-label="What happened" className="model-log">
        <AnimatePresence initial={false}>
          {lines.map((line, index) => (
            <motion.li
              key={`${index}-${line.at}`}
              className="model-log-item"
              data-problem={line.problem || undefined}
              data-by={line.by}
              {...arrive}
            >
              <span aria-hidden className="model-log-dot" />
              {line.details ? (
                <LineWithDetails text={line.text} details={line.details} />
              ) : (
                <span className="text-pretty">{line.text}</span>
              )}
              <time
                dateTime={line.at}
                className="value text-meta text-muted tabular-nums"
              >
                {clock(line.at)}
              </time>
            </motion.li>
          ))}
          {working && (!latest || waitingOn || activity?.writing) ? (
            <motion.li
              key="waiting"
              className="model-log-item"
              data-pending
              {...arrive}
            >
              <span aria-hidden className="model-log-dot" />
              <span className="text-dense text-muted">
                {activity?.writing ? (
                  <>
                    Writing the answer ·{' '}
                    <span className="value tabular-nums">
                      <MorphingText
                        text={`${Math.min(activity.writing, facts.records)} of ${facts.records}`}
                      />
                    </span>
                  </>
                ) : waitingOn ? (
                  `Waiting for ${waitingOn}…`
                ) : (
                  'Choosing a model…'
                )}
              </span>
            </motion.li>
          ) : null}
        </AnimatePresence>
      </ol>
      {working && activity?.thought ? (
        <figure className="bg-surface-inset rounded-control grid gap-1.5 p-3">
          <figcaption className="readout text-muted">Thinking</figcaption>
          <Thought text={activity.thought} />
        </figure>
      ) : null}
      {(tokens && tokens.input + tokens.output > 0) || stream.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {tokens && tokens.input + tokens.output > 0 ? (
            <>
              {/* Facts about the step, as its heading's facts are drawn. */}
              <Fact text={`${thousands(tokens.input)} tokens in`} />
              <Fact text={`${thousands(tokens.output)} out`} />
              {tokens.thinking ? (
                <Fact text={`${thousands(tokens.thinking)} thinking`} />
              ) : null}
              {activity?.stepMs ? (
                <Fact text={seconds(activity.stepMs)} />
              ) : null}
            </>
          ) : null}
          {stream.length ? (
            <Button
              size="xsmall"
              aria-expanded={raw}
              aria-controls={rawId}
              onPress={() => setRaw(!raw)}
            >
              {raw ? 'Hide' : 'Show'} raw model output
            </Button>
          ) : null}
        </div>
      ) : null}
      {stream.length ? (
        <Fold open={raw} id={rawId}>
          <ModelOutput stream={stream} arrive={arrive} />
        </Fold>
      ) : null}
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
  reason,
  again,
  onRetry,
  busy,
}: {
  reason: string;
  again: string;
  onRetry?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="grid justify-items-start gap-3">
      <p role="alert" className={ALERT}>
        {reason}
      </p>
      {onRetry ? (
        <Button size="medium" isDisabled={busy} onPress={onRetry}>
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
  const outputs = write.outputs.length;
  const where =
    outputs === 1
      ? (write.outputs[0]?.title ?? 'the output')
      : plural(outputs, 'output');

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="ready">{count('approve')} approved</Pill>
        {count('change') ? (
          <Pill tone="decision">{count('change')} changed</Pill>
        ) : null}
        {count('reject') ? (
          <Pill tone="neutral">{count('reject')} rejected</Pill>
        ) : null}
      </div>
      {write.problems.length ? (
        <ul role="alert" className={cx(ALERT, 'grid gap-1')}>
          {write.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
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
          ) : stage === 'committing' ? (
            <p role="status" className={NOTE}>
              Writing {n} to {where}…
            </p>
          ) : stage === 'intervention' && mismatch ? (
            <p role="alert" className={ALERT}>
              {mismatch}
            </p>
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
        <table className="text-dense w-full border-separate border-spacing-0">
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
          {[...tabs].map(([tab, cells], group) => (
            <tbody key={tab}>
              <tr>
                {/* A band across the card, ruled below: everything under it,
                    to the next band, is this tab's. */}
                <th
                  scope="colgroup"
                  colSpan={5}
                  className={cx(
                    'cell-group border-rule-faint border-b py-2.5 pr-5 pl-5 text-left',
                    group > 0 && 'border-t',
                  )}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{tab}</span>
                    <span className="cell-group-count">
                      <MorphingText
                        text={plural(cells.length, 'value')}
                        duration={MORPH_WORDS_MS}
                      />
                    </span>
                  </span>
                </th>
              </tr>
              {cells.map((cell, index) => {
                const changed = decisions[cell.key]?.kind === 'change';
                // Ruled between rows, as every table is; the tab's heading
                // takes the first row's.
                const rule = index > 0;
                // Each tab's last row has room below it, before the next
                // tab's band or the card's edge.
                const last = index === cells.length - 1;
                const rowY = last ? 'pt-2 pb-4' : 'py-2';
                return (
                  <tr key={`${cell.key}-${cell.field}-${cell.address}`}>
                    <th
                      scope="row"
                      className={cx(
                        'pr-3 pl-5 text-left font-normal whitespace-nowrap',
                        rowY,
                        rule && DATA_TABLE_RULE,
                      )}
                    >
                      <span className={DATA_TABLE_NAME}>{cell.key}</span>
                      {names[cell.key] ? (
                        <span className={DATA_TABLE_NAME_UNDER}>
                          {names[cell.key]}
                        </span>
                      ) : null}
                    </th>
                    <td
                      className={cx(
                        DATA_TABLE_NAME_COLUMN,
                        'text-muted-strong pr-3 font-medium',
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
