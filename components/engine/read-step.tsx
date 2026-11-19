'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ArrowUpRight from 'blode-icons-react/icons/arrow-up-right';
import ChevronTriangleDown from 'blode-icons-react/icons/chevron-triangle-down-small-filled';
import TableFilled from 'blode-icons-react/icons/table-filled';
import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { DataDrawer, type DataTabs } from '@/components/engine/data-drawer';
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
import { Pill } from '@/components/ui/pill';
import { useTRPC } from '@/components/trpc/provider';
import { cx } from '@/lib/ui/cx';
import { SOURCE_KINDS, type SourceKind } from '@/lib/sources/model';

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
export const runReadOf = (summary: ReadSummary): RunRead => ({
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

// Reads the source's data once for this run, then waits: the data can be
// looked at in the drawer, and every later step will use this read.
// Automatic, it reads the live source as soon as it is drawn, with no setup.
export function ReadStep({
  kind,
  read,
  loadingRead = false,
  readError = null,
  onRead,
  revealing,
  onRevealed,
  automatic = false,
  mock = false,
}: {
  // The kind of source the run reads from, which names its parts.
  kind: SourceKind;
  read: RunRead | undefined;
  // The run has a read and its summary is on the way: nothing is read again.
  loadingRead?: boolean;
  // Why the run's read could not be shown, where the server would not say.
  readError?: string | null;
  onRead: (read: RunRead) => void;
  revealing: boolean;
  onRevealed: () => void;
  automatic?: boolean;
  mock?: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { noun, resource } = SOURCE_KINDS[kind];
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
  const readFrom = (from: 'captured' | 'live') => {
    if (mock) {
      setOpen(true);
      onRead(
        read ?? {
          id: 'mock',
          readAt: new Date().toISOString(),
          source: 'Mock read',
          title: null,
          tabs: [],
        },
      );
      return;
    }
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
  };
  // Once per run: a remount (Strict Mode's included) keeps the ref.
  const asked = useRef(false);
  useEffect(() => {
    if (!automatic || mock || read || loadingRead || readError || asked.current)
      return;
    asked.current = true;
    readFrom('live');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatic, mock, read, loadingRead, readError]);
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
              {loadingRead
                ? 'Loading this run’s read…'
                : `Reading the ${noun}…`}
            </p>
          )}
          {read?.problems?.length ? (
            <div role="alert" className="grid gap-1">
              <p className="text-dense">
                The {noun} does not fit what this process reads, so nothing is
                proposed on it. Fix the {noun} and start a new run:
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
          className="trial-setup rounded-shell grid gap-4 p-4"
        >
          <Lede>
            Reads the {noun}&rsquo;s data {resource.plural} once. Every later
            step of this run uses this read. Nothing is written to the {noun}.
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
              The live {noun}, through Composio
            </label>
          </fieldset>
          <TrialControl
            label={`Read the ${noun}`}
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
              failed ??
              readError ??
              (read ? `${read.tabs.length} ${resource.plural}` : null)
            }
          />
          {read ? (
            <p className="text-meta text-muted break-words">{read.source}</p>
          ) : null}
          {read?.problems?.length ? (
            <div role="alert" className="grid gap-1">
              <p className="text-dense">
                The {noun} does not fit what this process reads, so no rules are
                drafted on it. Fix the {noun} and read it again:
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
          kind={kind}
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
  if (!read)
    return (
      <div className="read-card">
        <div className="read-card-head" data-reading>
          <TableFilled aria-hidden className="read-card-icon" />
          <span className="read-card-name">{source.name}</span>
        </div>
      </div>
    );
  const sourceName = read.title || read.url;
  const setOpen = onOpenChange;
  return (
    <div className="read-card" data-open={open || undefined}>
      <button
        type="button"
        className="read-card-head group/head"
        aria-expanded={open}
        aria-controls={cardId}
        onClick={() => setOpen(!open)}
      >
        <TableFilled aria-hidden className="read-card-icon" />
        <span className="read-card-name">{source.name}</span>
        <span className="thread-step-fact read-card-count">
          {read.tabs.length} {read.tabs.length === 1 ? singular : plural}
        </span>
        <Pill
          tone="ready"
          size="compact"
          className="read-card-done group-hover/head:bg-severity-pill-hover group-hover/head:text-severity-pill-strong group-focus-visible/head:bg-severity-pill-hover group-focus-visible/head:text-severity-pill-strong"
        >
          Read · {dateTime(read.readAt)}
        </Pill>
        <ChevronTriangleDown aria-hidden className="read-card-chevron" />
      </button>
      <Fold open={open} id={cardId} className="pt-2">
        <DataTable
          as="article"
          aria-label={`${capitalised(source.noun)} read`}
          data-revealing={revealing || undefined}
          className="read-card-table"
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
                      'read-card-enter',
                    )}
                  >
                    <span>{capitalised(singular)}</span>
                    <span className="justify-self-end">Rows</span>
                  </div>
                  <ul
                    aria-label={`Data ${plural} read`}
                    className="row-list read-card-rows col-span-full grid grid-cols-subgrid"
                  >
                    {read.tabs.map((tab, index) => (
                      <li
                        key={tab.name}
                        className="read-card-enter col-span-full grid grid-cols-subgrid"
                        style={
                          {
                            '--read-card-index': index + 1,
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
                          </span>{' '}
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
                  className="read-card-enter flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                  style={
                    {
                      '--read-card-index': read.tabs.length + 1,
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
