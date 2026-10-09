'use client';

import ArrowUpRight from 'blode-icons-react/icons/arrow-up-right';
import ChevronTriangleDown from 'blode-icons-react/icons/chevron-triangle-down-small-filled';
import ChainLink1Filled from 'blode-icons-react/icons/chain-link-1-filled';
import TableFilled from 'blode-icons-react/icons/table-filled';
import { useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { useRunSelection } from '@/components/app-shell/runs/run-selection';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import {
  RequestBubble,
  ResponseSection,
} from '@/components/app-shell/thread/thread-page';
import { ThreadStep } from '@/components/app-shell/thread/thread-step';
import {
  Lede,
  TrialControl,
  dateTime,
  useTrial,
} from '@/components/sheet-process/trial-parts';
import { Button } from '@/components/ui/button';
import { cx } from '@/lib/cx';
import type { ProcessStep, ProcessSummary } from '@/lib/process/model';
import { COMING, ORDER_STEPS } from '@/lib/processes/brunch-orders/process';

import { DataDrawer } from './data-drawer';
import { RulesStep, type RulesProgress } from './rules-step';

// How far a run has got, as the browser keeps it: the read's id and summary.
type RunRead = {
  id: string;
  readAt: string;
  source: string;
  title: string | null;
  url?: string;
  tabIds?: Record<string, number>;
  tabs: { name: string; rows: number }[];
  problems?: string[];
};

type ReadResponse =
  | {
      kind: 'kept';
      id: string;
      readAt: string;
      source: string;
      spreadsheet: {
        title: string | null;
        url: string;
        tabIds?: Record<string, number>;
      };
      tabs: { name: string; rows: number }[];
      // Where the sheet does not fit what this process reads.
      problems: string[];
    }
  | { kind: 'error'; message: string };

// The tabs as the release card's rows: ruled from where a name starts, lit
// whole under the pointer, the arrow arriving in the end padding
// (`.release-list`, `.release-row-arrow` in release-card.css). Header and rows share its columns.
// A tab's rows as the drawer counts them: the header row is not one.
const dataRows = (rows: number) => Math.max(0, rows - 1);
const READ_TABLE = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3';
const READ_GRID = 'col-span-full grid grid-cols-subgrid items-center px-4';
const READ_ROW = cx(
  READ_GRID,
  'release-row group/row control-wash hover:bg-surface-hover focus-visible:bg-surface-hover text-dense w-full cursor-pointer py-2.5 text-left',
);

/*
  A Brunch orders run, step by step. It moves only when a person acts: the
  instructions it runs under, reading the sheet, then the rules. The later
  steps are listed with the phase that brings each one
  (docs/processes/brunch-orders/PLAN.md).
*/
export function OrdersRun({ process }: { process: ProcessSummary }) {
  const selection = useRunSelection();
  const sheet = useContext(ProcessSheetActions);
  const [revealingReadId, setRevealingReadId] = useState<string | null>(null);
  const live = selection?.live;
  if (!live || !selection) return null;
  const read = live.data.read as RunRead | undefined;
  const rules = live.data.rules as RulesProgress | undefined;
  const rulesDone =
    rules !== undefined &&
    rules.intent &&
    rules.total > 0 &&
    rules.approved === rules.total;
  const status = (step: ProcessStep): ProcessStep['status'] =>
    step.id === 'instructions'
      ? 'complete'
      : step.id === 'read'
        ? read
          ? 'complete'
          : 'attention'
        : step.id === 'rules'
          ? rulesDone
            ? 'complete'
            : read
              ? 'attention'
              : 'pending'
          : 'pending';
  // The furthest step a person can act on.
  const latest =
    !read || revealingReadId === read.id
      ? 'read'
      : !rulesDone
        ? 'rules'
        : 'calculate';
  const steps = ORDER_STEPS.map((step) => ({ ...step, status: status(step) }));
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
                    label: live.run.instructionsVersion,
                    onPress: sheet.showInstructions,
                  }
                : undefined
            }
          >
            {step.id === 'instructions' ? (
              <Instructions
                process={process}
                version={live.run.instructionsVersion}
              />
            ) : step.id === 'read' ? (
              <ResponseSection>
                <ReadStep
                  read={read}
                  revealing={revealingReadId === read?.id}
                  onRevealed={() => setRevealingReadId(null)}
                  onRead={(next) => {
                    setRevealingReadId(
                      matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? null
                        : next.id,
                    );
                    selection.updateLive(live.run.id, { read: next });
                  }}
                />
              </ResponseSection>
            ) : step.id === 'rules' ? (
              <ResponseSection>
                <RunRules
                  process={process}
                  version={live.run.instructionsVersion}
                  readId={read?.id ?? null}
                  onProgress={(progress) =>
                    selection.updateLive(live.run.id, { rules: progress })
                  }
                />
              </ResponseSection>
            ) : (
              <p className="text-dense text-muted">{COMING[step.id]}</p>
            )}
          </ThreadStep>
        ))}
      </ol>
      <div className="border-rule-faint mt-8 flex items-center gap-3 border-t pt-4">
        <Button onPress={() => selection.removeLive(live.run.id)}>
          Discard this run
        </Button>
        <span className="text-meta text-muted">
          Removes it from this browser. Nothing was written anywhere.
        </span>
      </div>
    </>
  );
}

// The rules of the instructions this run answers to: the text is what they
// are kept by, so a run under another version finds its own.
function RunRules({
  process,
  version,
  readId,
  onProgress,
}: {
  process: ProcessSummary;
  version: string;
  readId: string | null;
  onProgress: (progress: RulesProgress) => void;
}) {
  const { versions } = useInstructions(process.id, process.instructions);
  const text = versions.find((v) => v.version === version)?.text;
  return text ? (
    <RulesStep
      text={text}
      version={version}
      readId={readId}
      onProgress={onProgress}
    />
  ) : (
    <p className="text-dense text-muted">
      Instructions {version} are not in this browser any more.
    </p>
  );
}

// The instructions the run started under, as its request: the run answers to
// exactly this version, whatever is published after it.
function Instructions({
  process,
  version,
}: {
  process: ProcessSummary;
  version: string;
}) {
  const { versions } = useInstructions(process.id, process.instructions);
  const text = versions.find((v) => v.version === version)?.text;
  return (
    <RequestBubble>
      {text ? (
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
      ) : (
        <p>Instructions {version} are not in this browser any more.</p>
      )}
    </RequestBubble>
  );
}

// Reads the sheet's data tabs once for this run, then waits: the data can be
// looked at in the drawer, and every later step will use this read.
function ReadStep({
  read,
  onRead,
  revealing,
  onRevealed,
}: {
  read: RunRead | undefined;
  onRead: (read: RunRead) => void;
  revealing: boolean;
  onRevealed: () => void;
}) {
  const reading = useTrial<ReadResponse>('/api/dev/brunch-orders/read');
  const [source, setSource] = useState<'captured' | 'live'>('captured');
  const name = useId();
  const failed =
    reading.state.kind === 'done' && reading.state.body.kind === 'error'
      ? reading.state.body.message
      : null;
  const googleSheets = read?.url?.startsWith(
    'https://docs.google.com/spreadsheets/',
  );
  const sourceName = read?.title || read?.url;
  // Shut until asked for, except for the read just taken, which opens to show it.
  const [open, setOpen] = useState(false);
  const cardId = useId();
  const hasRead = read !== undefined;
  // The card's height paces its fold, as a step's body paces the step's.
  const foldRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const fold = foldRef.current;
    const card = cardRef.current;
    if (!fold || !card) return;
    const observer = new ResizeObserver(() =>
      fold.style.setProperty('--thread-fold-height', String(card.offsetHeight)),
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [hasRead]);
  return (
    <div className="grid gap-4">
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
          idle={read ? 'This run’s read is below.' : 'Waiting for you to read.'}
          state={reading.state}
          onRun={() =>
            void reading.run({ action: 'read', source }).then((response) => {
              if (response?.kind !== 'kept') return;
              setOpen(true);
              onRead({
                id: response.id,
                readAt: response.readAt,
                source: response.source,
                title: response.spreadsheet.title,
                url: response.spreadsheet.url,
                tabIds: response.spreadsheet.tabIds,
                tabs: response.tabs,
                problems: response.problems,
              });
            })
          }
          summary={failed ?? (read ? `${read.tabs.length} tabs` : null)}
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
      {read ? (
        <div className="brunch-read" data-open={open || undefined}>
          <button
            type="button"
            className="brunch-read-head group/head"
            aria-expanded={open}
            aria-controls={cardId}
            onClick={() => setOpen(!open)}
          >
            <TableFilled aria-hidden className="brunch-read-icon" />
            <span className="brunch-read-name">
              {googleSheets ? 'Google Sheets' : 'Sheet'}
            </span>
            <span className="thread-step-fact brunch-read-count">
              {read.tabs.length} tabs
            </span>
            <span
              data-severity={3}
              className="thread-step-fact brunch-read-done bg-severity-pill text-severity-ink group-hover/head:bg-severity-pill-hover group-focus-visible/head:bg-severity-pill-hover"
            >
              Read · {dateTime(read.readAt)}
            </span>
            <ChevronTriangleDown aria-hidden className="brunch-read-chevron" />
          </button>
          <div
            id={cardId}
            ref={foldRef}
            className="brunch-read-fold thread-fold"
            inert={!open}
          >
            <div className="brunch-read-clip">
              <article
                ref={cardRef}
                aria-label="Sheet read"
                data-revealing={revealing || undefined}
                className="brunch-read-card border-rule-faint bg-surface-primary rounded-shell overflow-clip border"
              >
                <DataDrawer readId={read.id}>
                  {(view) => (
                    <>
                      <div className={READ_TABLE}>
                        <div
                          aria-hidden
                          className={cx(
                            READ_GRID,
                            'brunch-read-enter text-meta text-muted border-rule-faint border-b py-3 font-medium',
                          )}
                        >
                          <span>Tab</span>
                          <span className="justify-self-end">Rows</span>
                        </div>
                        <ul
                          aria-label="Data tabs read"
                          className="release-list brunch-read-rows col-span-full grid grid-cols-subgrid"
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
                                aria-label={`${tab.name}, ${tab.rows ? `${dataRows(tab.rows)} rows` : 'not in the sheet'}. View its data.`}
                                onClick={() => view(tab.name)}
                              >
                                <span className="release-row-subject truncate">
                                  {tab.name}
                                </span>
                                {tab.rows ? (
                                  <span className="release-row-pill release-row-trail justify-self-end">
                                    <span>{dataRows(tab.rows)}</span>
                                  </span>
                                ) : (
                                  <span className="release-row-trail text-meta text-muted justify-self-end">
                                    Not in the sheet
                                  </span>
                                )}
                                <span
                                  aria-hidden="true"
                                  className="release-row-arrow"
                                >
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
                          if (event.target === event.currentTarget)
                            onRevealed();
                        }}
                      >
                        <Button pill onPress={() => view()}>
                          View data
                          <ArrowUpRight
                            aria-hidden
                            size={14}
                            strokeWidth={2}
                            className="text-muted flex-none"
                          />
                        </Button>
                        {read.url ? (
                          <a
                            href={read.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={sourceName ?? undefined}
                            className="brunch-read-external text-meta inline-flex items-center gap-1.5 font-medium"
                          >
                            Open in{' '}
                            {googleSheets ? 'Google Sheets' : 'the sheet'}
                            <ChainLink1Filled
                              aria-hidden
                              size={14}
                              className="flex-none"
                            />
                            <span className="sr-only">
                              {' '}
                              (opens in a new tab)
                            </span>
                          </a>
                        ) : null}
                      </footer>
                    </>
                  )}
                </DataDrawer>
              </article>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
