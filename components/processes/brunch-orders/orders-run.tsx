'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ArrowUpRight from 'blode-icons-react/icons/arrow-up-right';
import ChevronTriangleDown from 'blode-icons-react/icons/chevron-triangle-down-small-filled';
import TableFilled from 'blode-icons-react/icons/table-filled';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import {
  useRunSelection,
  type LiveRun,
  type RunSelection,
} from '@/components/app-shell/runs/run-selection';
import {
  RequestBubble,
  ResponseSection,
} from '@/components/app-shell/thread/thread-page';
import { ThreadStep } from '@/components/app-shell/thread/thread-step';
import {
  Lede,
  TrialControl,
  dateTime,
  useMutationTrial,
} from '@/components/engine/trial-parts';
import { Button } from '@/components/ui/button';
import {
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME,
  DataTable,
} from '@/components/ui/data-table';
import { ExternalLink } from '@/components/ui/external-link';
import { Fold } from '@/components/ui/fold';
import { Loader } from '@/components/ui/loader';
import { useTRPC } from '@/components/trpc/provider';
import { useLoader } from '@/components/ui/working-mark';
import { cx } from '@/lib/cx';
import type { ProcessStep, ProcessSummary } from '@/lib/shell/model';
import {
  COMING,
  ORDER_STEPS,
  SHEET_USE,
  SUBJECT,
} from '@/lib/processes/brunch-orders/process';
import { SOURCE_KINDS, sourceById, type SourceKind } from '@/lib/sources/model';

import { ApplyStep, type ApplyProgress } from '@/components/engine/apply-step';
import {
  CalculateStep,
  type CalculateProgress,
} from '@/components/engine/calculate-step';
import { DataDrawer, type DataTabs } from '@/components/engine/data-drawer';
import { ProposeStep } from '@/components/engine/propose/propose-step';
import type { ProposeProgress } from '@/components/engine/propose/types';
import {
  RulesStep,
  type RulesProgress,
} from '@/components/engine/rules/rules-step';

// A run's read as its card shows it: the read's id and summary.
export type RunRead = {
  id: string;
  readAt: string;
  source: string;
  title: string | null;
  url?: string;
  tabIds?: Record<string, number>;
  tabs: { name: string; rows: number }[];
  problems?: string[];
};

// What a read's summary gives the card (`read.keep`, `read.summary`).
type ReadSummary = {
  id: string;
  readAt: string;
  source: string;
  spreadsheet: {
    title: string | null;
    url?: string;
    tabIds?: Record<string, number>;
  };
  tabs: { name: string; rows: number }[];
  problems?: string[];
};
const runReadOf = (summary: ReadSummary): RunRead => ({
  id: summary.id,
  readAt: summary.readAt,
  source: summary.source,
  title: summary.spreadsheet.title,
  url: summary.spreadsheet.url,
  tabIds: summary.spreadsheet.tabIds,
  tabs: summary.tabs,
  problems: summary.problems,
});

// The read a run kept, by its id: its summary, never its values. A kept read
// never changes, so what came is kept.
export function useRunRead(readId: string | null) {
  const trpc = useTRPC();
  const asked = useQuery(
    trpc.read.summary.queryOptions(
      { id: readId ?? '' },
      { enabled: readId !== null, staleTime: Infinity },
    ),
  );
  return {
    read: asked.data ? runReadOf(asked.data) : undefined,
    error: asked.error?.message ?? null,
  };
}

// The tabs as list rows: ruled from where a name starts, lit
// whole under the pointer, the arrow arriving in the end padding
// (`.row-list`, `.list-row-arrow` in list-rows.css). Header and rows share its columns.
// A tab's rows as the drawer counts them: the header row is not one.
const dataRows = (rows: number) => Math.max(0, rows - 1);
const capitalised = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1);
const READ_TABLE = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3';
const READ_GRID = 'col-span-full grid grid-cols-subgrid items-center px-4';
const READ_ROW = cx(
  READ_GRID,
  'list-row group/row control-wash hover:bg-row-hover focus-visible:bg-row-hover text-dense w-full cursor-pointer py-2.5 text-left',
);

/*
  A Brunch orders run, step by step. It moves only when a person acts: the
  instructions it runs under, reading the sheet, then the rules. The later
  steps are listed with the phase that brings each one
  (docs/processes/brunch-orders/PLAN.md).
*/
export function OrdersRun({ process }: { process: ProcessSummary }) {
  const selection = useRunSelection();
  const live = selection?.live;
  if (!live || !selection) return null;
  // How far each step has got is held for this run alone.
  return (
    <OrdersThread
      key={live.run.id}
      process={process}
      live={live}
      selection={selection}
    />
  );
}

/*
  The run's read and pin are the server's (`runs.record`); how far the steps
  have got is not kept anywhere, but worked out again by each step as it
  opens, from what it summarises, and reported here for the headings.
*/
function OrdersThread({
  live,
  selection,
}: {
  process: ProcessSummary;
  live: LiveRun;
  selection: RunSelection;
}) {
  const sheet = useContext(ProcessSheetActions);
  const { kept, text } = live;
  const version = kept.instructions.version;
  const [revealingReadId, setRevealingReadId] = useState<string | null>(null);
  const [taken, setTaken] = useState<RunRead | null>(null);
  const [rules, setRules] = useState<RulesProgress>();
  const [calculated, setCalculated] = useState<CalculateProgress>();
  const [proposed, setProposed] = useState<ProposeProgress>();
  const [applied, setApplied] = useState<ApplyProgress>();
  // Counts each move back to Calculate, which starts it afresh.
  const [moves, setMoves] = useState(0);
  const saved = useRunRead(kept.readId);
  // The read just taken shows at once, and goes if the server will not keep
  // it as the run's; once kept, the server's summary is what is shown.
  const read = taken && taken.id !== kept.readId ? taken : saved.read;
  const readId = read?.id ?? kept.readId;
  // What this run has written and not undone.
  const wrote =
    applied?.status === 'verified' || applied?.status === 'mismatch';
  const rulesDone =
    rules !== undefined &&
    rules.intent &&
    rules.total > 0 &&
    rules.approved === rules.total;
  // Propose opens once Calculate has worked the values out, which the server
  // knows by the rulebook it pinned: the one a decision is kept under.
  const pinned = kept.rulebook;
  const canPropose = rulesDone && read !== undefined && pinned !== null;
  const decidedCount = proposed ? Object.keys(proposed.decisions).length : 0;
  const allDecided =
    proposed?.proposedAt != null &&
    proposed.total > 0 &&
    decidedCount === proposed.total;
  const status = (step: ProcessStep): ProcessStep['status'] =>
    step.id === 'instructions'
      ? 'complete'
      : step.id === 'read'
        ? readId
          ? 'complete'
          : 'attention'
        : step.id === 'rules'
          ? rulesDone
            ? 'complete'
            : readId
              ? 'attention'
              : 'pending'
          : step.id === 'calculate'
            ? !rulesDone
              ? 'pending'
              : calculated?.checked && calculated.agreed === calculated.total
                ? 'complete'
                : 'attention'
            : step.id === 'propose'
              ? !canPropose
                ? 'pending'
                : allDecided
                  ? 'complete'
                  : 'attention'
              : step.id === 'apply'
                ? !allDecided
                  ? 'pending'
                  : proposed.writes === 0 || applied?.status === 'verified'
                    ? 'complete'
                    : 'attention'
                : 'pending';
  // The furthest step a person can act on.
  const latest =
    !readId || revealingReadId === readId
      ? 'read'
      : !rulesDone
        ? 'rules'
        : !canPropose
          ? 'calculate'
          : !allDecided
            ? 'propose'
            : 'apply';
  // What each step has come to, in its heading, where it has a state yet.
  const label = (step: ProcessStep) =>
    step.id === 'rules' && rules?.total
      ? rules.approved === rules.total
        ? 'All rules accepted'
        : `${rules.approved} of ${rules.total} accepted`
      : step.id === 'calculate' && rulesDone
        ? !calculated?.checked
          ? 'Not cross-checked'
          : calculated.agreed === calculated.total
            ? `All ${calculated.total} match the model`
            : `${calculated.total - calculated.agreed} don’t match the model`
        : step.id === 'propose' && canPropose
          ? proposed?.running
            ? 'Proposing…'
            : !proposed?.proposedAt
              ? 'Not proposed'
              : allDecided
                ? 'All decided'
                : decidedCount
                  ? `${decidedCount} of ${proposed.total} decided`
                  : proposed.needYou
                    ? `${proposed.total} proposed · ${proposed.needYou} need you`
                    : `${proposed.total} proposed · all ready`
          : step.id === 'apply' && allDecided
            ? applied?.status === 'verified'
              ? 'Written and read back'
              : applied?.status === 'mismatch'
                ? 'Check the sheet'
                : applied?.status === 'pending'
                  ? 'Not confirmed yet'
                  : proposed.writes
                    ? `${proposed.writes} to write`
                    : 'Nothing to write'
            : step.label;
  const steps = ORDER_STEPS.map((step) => ({
    ...step,
    status: status(step),
    label: label(step),
  }));
  // Pinning the rulebook is not waited for by the screen, which shows what
  // Calculate has worked out; Propose opens once the server has the pin.
  const pin = (progress: CalculateProgress) => {
    setCalculated(progress);
    if (progress.fingerprint !== kept.rulebook)
      selection
        .record(kept.id, { rulebook: progress.fingerprint })
        .catch(() => undefined);
  };
  return (
    <>
      <ol className="thread">
        {steps.map((step) => (
          <ThreadStep
            key={step.id}
            step={step}
            latest={step.id === latest}
            headingAction={
              step.id === 'instructions' && sheet
                ? {
                    label: version,
                    onPress: sheet.showInstructions,
                  }
                : undefined
            }
          >
            {step.id === 'instructions' ? (
              <InstructionsText text={text} />
            ) : step.id === 'read' ? (
              <ResponseSection>
                <ReadStep
                  read={read}
                  loadingRead={readId !== null && read === undefined}
                  readError={saved.error}
                  revealing={revealingReadId === read?.id}
                  onRevealed={() => setRevealingReadId(null)}
                  onRead={(next) => {
                    setRevealingReadId(
                      matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? null
                        : next.id,
                    );
                    setTaken(next);
                    selection.record(kept.id, { readId: next.id }).catch(() => {
                      setTaken(null);
                      setRevealingReadId(null);
                    });
                  }}
                />
              </ResponseSection>
            ) : step.id === 'rules' ? (
              <ResponseSection>
                <RulesStep
                  text={text}
                  version={version}
                  readId={readId}
                  onProgress={setRules}
                />
              </ResponseSection>
            ) : step.id === 'calculate' && rulesDone && readId ? (
              <ResponseSection>
                <CalculateStep
                  key={moves}
                  text={text}
                  readId={readId}
                  calculatedOn={kept.rulebook}
                  onProgress={pin}
                />
              </ResponseSection>
            ) : step.id === 'propose' && canPropose ? (
              <ResponseSection>
                <ProposeStep
                  subject={SUBJECT}
                  text={text}
                  readId={read.id}
                  rulebook={pinned}
                  run={{ process: 'brunch-orders', runId: kept.id }}
                  onProgress={setProposed}
                  // Back to Calculate once the server has let go of the pin.
                  onMoveRules={() =>
                    void selection.record(kept.id, { rulebook: null }).then(
                      () => {
                        setCalculated(undefined);
                        setProposed(undefined);
                        setMoves((count) => count + 1);
                      },
                      () => undefined,
                    )
                  }
                />
              </ResponseSection>
            ) : step.id === 'apply' && allDecided && read && pinned ? (
              <ResponseSection>
                <ApplyStep
                  subject={SUBJECT}
                  run={{ process: 'brunch-orders', runId: kept.id }}
                  decisions={proposed.decisions}
                  onProgress={setApplied}
                />
              </ResponseSection>
            ) : (
              <p className="text-dense text-muted">{COMING[step.id]}</p>
            )}
          </ThreadStep>
        ))}
      </ol>
      {selection.recordError ? (
        <p role="alert" className="text-dense text-state-blocked mt-6">
          {selection.recordError}
        </p>
      ) : null}
      <div className="border-rule-faint mt-8 flex flex-wrap items-center gap-3 border-t pt-4">
        <DiscardRun
          selection={selection}
          id={kept.id}
          words={
            wrote
              ? 'Takes it off the list. What it wrote stays in the sheet.'
              : applied?.status === 'pending'
                ? 'Takes it off the list. Anything it wrote stays in the sheet.'
                : 'Takes it off the list. Nothing was written anywhere.'
          }
        />
      </div>
    </>
  );
}

/*
  Discarding is waited for: the run leaves the list once the server has said
  it is discarded, and a press while it is being said does nothing. The button
  stays where it is (never disabled) so focus is not lost, and its words say
  what it is doing.
*/
export function DiscardRun({
  selection,
  id,
  words,
}: {
  selection: RunSelection;
  id: string;
  words?: string;
}) {
  return (
    <>
      <Button
        aria-disabled={selection.discarding || undefined}
        onPress={() => {
          if (selection.discarding) return;
          // The button goes with the run: focus stays in the runs list, where
          // the next run is a keypress away, as it would on any other row.
          void selection.discard(id).then((done) => {
            // Once the list has dropped the run, two frames on.
            if (done)
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>('.sheet-row, #main')
                    ?.focus({ preventScroll: true }),
                ),
              );
          });
        }}
      >
        {selection.discarding ? 'Discarding…' : 'Discard this run'}
      </Button>
      {words ? <span className="text-meta text-muted">{words}</span> : null}
      {selection.discardError ? (
        <p role="alert" className="text-dense text-state-blocked">
          {selection.discardError}
        </p>
      ) : null}
    </>
  );
}

// Instructions as a request: each section's first line is its title.
export function InstructionsText({ text }: { text: string }) {
  return (
    <RequestBubble>
      <div className="grid gap-3">
        {text.split(/\n\s*\n/).map((section, i) => {
          // A section's first line is its title, when it has more.
          const [first, ...rest] = section.split('\n');
          return rest.length ? (
            <div key={i} className="grid gap-1">
              <p className="font-semibold">{first}</p>
              <p className="whitespace-pre-line">{rest.join('\n')}</p>
            </div>
          ) : (
            <p key={i}>{section}</p>
          );
        })}
      </div>
    </RequestBubble>
  );
}

// Reads the sheet's data tabs once for this run, then waits: the data can be
// looked at in the drawer, and every later step will use this read.
// Automatic, it reads the live sheet as soon as it is drawn, with no setup.
export function ReadStep({
  read,
  loadingRead = false,
  readError = null,
  onRead,
  revealing,
  onRevealed,
  automatic = false,
}: {
  read: RunRead | undefined;
  // The run has a read and its summary is on the way: nothing is read again.
  loadingRead?: boolean;
  // Why the run's read could not be shown, where the server would not say.
  readError?: string | null;
  onRead: (read: RunRead) => void;
  revealing: boolean;
  onRevealed: () => void;
  automatic?: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const keep = useMutation(trpc.read.keep.mutationOptions());
  const reading = useMutationTrial(keep.mutateAsync);
  const [source, setSource] = useState<'captured' | 'live'>('captured');
  const name = useId();
  // What the server said when it would not read; a request that never got
  // an answer is the trial's own failure.
  const failed =
    reading.state.kind === 'done' && keep.error ? keep.error.message : null;
  // Shut until asked for, except for the read just taken, which opens to show it.
  const [open, setOpen] = useState(false);
  const readFrom = (from: 'captured' | 'live') =>
    void reading.run({ source: from }).then((response) => {
      if (!response) return;
      setOpen(true);
      // The card's own summary is what keeping answered.
      queryClient.setQueryData(
        trpc.read.summary.queryKey({ id: response.id }),
        response,
      );
      onRead(runReadOf(response));
    });
  // Once per run: a remount (Strict Mode's included) keeps the ref.
  const asked = useRef(false);
  useEffect(() => {
    if (!automatic || read || loadingRead || readError || asked.current) return;
    asked.current = true;
    readFrom('live');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatic, read, loadingRead, readError]);
  const unreadable =
    reading.state.kind === 'failed'
      ? reading.state.message
      : (failed ?? readError);
  return (
    <div className="grid gap-4">
      {automatic ? (
        <>
          {read ? null : unreadable ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-dense text-state-blocked">
                {unreadable}
              </p>
              <Button size="medium" onPress={() => readFrom('live')}>
                Read again
              </Button>
            </div>
          ) : (
            <p role="status" className="text-dense text-muted">
              {loadingRead ? 'Loading this run’s read…' : 'Reading the sheet…'}
            </p>
          )}
          {read?.problems?.length ? (
            <div role="alert" className="grid gap-1">
              <p className="text-dense">
                The sheet does not fit what this process reads, so nothing is
                proposed on it. Fix the sheet and start a new run:
              </p>
              <ul className="text-dense list-disc pl-5">
                {read.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <section
          aria-label="Read setup"
          className="brunch-trial rounded-shell grid gap-4 p-4"
        >
          <Lede>
            Reads the sheet&rsquo;s data tabs once. Every later step of this run
            uses this read. Nothing is written to the sheet.
          </Lede>
          <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <legend className="text-meta text-muted mb-1">Read from</legend>
            <label className="text-dense flex items-center gap-1.5">
              <input
                type="radio"
                name={`${name}-source`}
                checked={source === 'captured'}
                onChange={() => setSource('captured')}
              />
              The captured read (no network)
            </label>
            <label className="text-dense flex items-center gap-1.5">
              <input
                type="radio"
                name={`${name}-source`}
                checked={source === 'live'}
                onChange={() => setSource('live')}
              />
              The live sheet, through Composio
            </label>
          </fieldset>
          <TrialControl
            label="Read the sheet"
            runningLabel="Reading…"
            variant={read ? 'secondary' : 'primary'}
            idle={
              read
                ? 'This run’s read is below.'
                : loadingRead
                  ? 'Loading this run’s read…'
                  : 'Waiting for you to read.'
            }
            state={reading.state}
            onRun={() => readFrom(source)}
            summary={
              failed ?? readError ?? (read ? `${read.tabs.length} tabs` : null)
            }
          />
          {read ? (
            <p className="text-meta text-muted break-words">{read.source}</p>
          ) : null}
          {read?.problems?.length ? (
            <div role="alert" className="grid gap-1">
              <p className="text-dense">
                The sheet does not fit what this process reads, so no rules are
                drafted on it. Fix the sheet and read it again:
              </p>
              <ul className="text-dense list-disc pl-5">
                {read.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}
      {read ? (
        <SheetReadCard
          kind={sourceById(SHEET_USE.source)?.kind ?? 'google-sheets'}
          read={read}
          open={open}
          onOpenChange={setOpen}
          revealing={revealing}
          onRevealed={onRevealed}
        />
      ) : null}
    </div>
  );
}

/*
  The run's read of a source as a card: its resources (a sheet's tabs) and
  their rows, folded open for the read just taken, with the data one press
  away. Without a read yet, only its head, saying it is being read. What the
  source and its parts are called comes from its kind (lib/sources).
*/
export function SheetReadCard({
  kind,
  read,
  open,
  onOpenChange,
  revealing = false,
  onRevealed = () => undefined,
  data,
}: {
  kind: SourceKind;
  read: RunRead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revealing?: boolean;
  onRevealed?: () => void;
  // The tabs' values, where they are at hand rather than fetched by id.
  data?: DataTabs;
}) {
  const cardId = useId();
  const source = SOURCE_KINDS[kind];
  const { singular, plural } = source.resource;
  const reading = useLoader(!read);
  if (!read)
    return (
      <div className="brunch-read">
        <div className="brunch-read-head" data-reading>
          <TableFilled aria-hidden className="brunch-read-icon" />
          <span className="brunch-read-name">{source.name}</span>
          {reading.phase ? (
            <Loader
              phase={reading.phase}
              label="Reading…"
              className="text-meta"
            />
          ) : null}
        </div>
      </div>
    );
  const sourceName = read.title || read.url;
  const setOpen = onOpenChange;
  return (
    <div className="brunch-read" data-open={open || undefined}>
      <button
        type="button"
        className="brunch-read-head group/head"
        aria-expanded={open}
        aria-controls={cardId}
        onClick={() => setOpen(!open)}
      >
        <TableFilled aria-hidden className="brunch-read-icon" />
        <span className="brunch-read-name">{source.name}</span>
        <span className="thread-step-fact brunch-read-count">
          {read.tabs.length} {read.tabs.length === 1 ? singular : plural}
        </span>
        <span
          data-severity={3}
          className="thread-step-fact brunch-read-done bg-severity-pill text-severity-pill-ink group-hover/head:bg-severity-pill-hover group-hover/head:text-severity-pill-strong group-focus-visible/head:bg-severity-pill-hover group-focus-visible/head:text-severity-pill-strong"
        >
          Read · {dateTime(read.readAt)}
        </span>
        <ChevronTriangleDown aria-hidden className="brunch-read-chevron" />
      </button>
      <Fold open={open} id={cardId} className="pt-2">
        <DataTable
          as="article"
          aria-label="Sheet read"
          data-revealing={revealing || undefined}
          className="brunch-read-card"
        >
          <DataDrawer readId={read.id} preloaded={data}>
            {(view) => (
              <>
                <div className={READ_TABLE}>
                  <div
                    aria-hidden
                    className={cx(
                      READ_GRID,
                      DATA_TABLE_HEAD,
                      'brunch-read-enter',
                    )}
                  >
                    <span>{capitalised(singular)}</span>
                    <span className="justify-self-end">Rows</span>
                  </div>
                  <ul
                    aria-label="Data tabs read"
                    className="row-list brunch-read-rows col-span-full grid grid-cols-subgrid"
                  >
                    {read.tabs.map((tab, index) => (
                      <li
                        key={tab.name}
                        className="brunch-read-enter col-span-full grid grid-cols-subgrid"
                        style={
                          {
                            '--brunch-read-index': index + 1,
                          } as CSSProperties
                        }
                      >
                        <button
                          type="button"
                          className={READ_ROW}
                          aria-label={`${tab.name}, ${tab.rows ? `${dataRows(tab.rows)} rows` : `not in the ${source.noun}`}. View its data.`}
                          onClick={() => view(tab.name)}
                        >
                          <span
                            className={cx(
                              'list-row-subject truncate',
                              DATA_TABLE_NAME,
                            )}
                          >
                            {tab.name}
                          </span>
                          {tab.rows ? (
                            <span className="list-row-pill list-row-trail justify-self-end">
                              <span>{dataRows(tab.rows)}</span>
                            </span>
                          ) : (
                            <span className="list-row-trail text-meta text-muted justify-self-end">
                              Not in the {source.noun}
                            </span>
                          )}
                          <span aria-hidden="true" className="list-row-arrow">
                            <ArrowUpRight size={14} strokeWidth={2} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <footer
                  className="brunch-read-enter flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                  style={
                    {
                      '--brunch-read-index': read.tabs.length + 1,
                    } as CSSProperties
                  }
                  onAnimationEnd={(event) => {
                    if (event.target === event.currentTarget) onRevealed();
                  }}
                >
                  <Button size="medium" onPress={() => view()}>
                    View data
                    <ArrowUpRight
                      aria-hidden
                      size={14}
                      strokeWidth={2}
                      className="text-muted flex-none"
                    />
                  </Button>
                  {read.url ? (
                    <ExternalLink
                      href={read.url}
                      title={sourceName ?? undefined}
                    >
                      {source.open}
                    </ExternalLink>
                  ) : null}
                </footer>
              </>
            )}
          </DataDrawer>
        </DataTable>
      </Fold>
    </div>
  );
}
