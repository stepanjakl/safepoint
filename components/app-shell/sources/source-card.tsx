'use client';

import ArrowRotateClockwise from 'blode-icons-react/icons/arrow-rotate-clockwise';
import ChainLink1Filled from 'blode-icons-react/icons/chain-link-1-filled';
import CrossSmall from 'blode-icons-react/icons/cross-small';
import PlusMedium from 'blode-icons-react/icons/plus-medium';
import TrashCanSimple from 'blode-icons-react/icons/trash-can-simple';
import { useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
} from 'react-aria-components';

import { AlertBox } from '@/components/ui/alert-box';
import { Button, ICON_BOX } from '@/components/ui/button';
import {
  DATA_TABLE_HEADING,
  DATA_TABLE_NAME,
  DataTable,
} from '@/components/ui/data-table';
import { Fold } from '@/components/ui/fold';
import { ICON_FILLED, IconButton } from '@/components/ui/icon-button';
import { MORPH_WORDS_MS, MorphingText } from '@/components/ui/morphing-text';
import { useLoader } from '@/components/ui/working-mark';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';
import { runStamp } from '@/lib/process/run-time';
import { capitalise } from '@/lib/review-presentation/format';
import {
  SOURCE_KINDS,
  sourceById,
  type SourceKind,
  type SourceResource,
  type SourceSummary,
  type SourceUse,
} from '@/lib/sources/model';

import { SourceDrawer } from './source-drawer';
import { SourceHead } from './source-head';
import { useSources, type SourceEntry } from './source-store';

const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/*
  Text starts 5 in from the sides. Controls at the end of the header and of
  the table's rows end 3.5 in, as far as Add sheet sits from the header's top
  and bottom. The file's column keeps 5 on both sides. Each column ends 3
  below its last item, as near as the title sits to its band's top. Rows run
  on a 10 rhythm. The first band of each column -- the file's title, the
  table's heading -- is 10 inside its rule (box-content), an even height, so
  the 6-high Edit pill centres on a whole pixel and the two columns start on
  one line.
*/
const BAND = 'border-rule-faint box-content min-h-10 border-b';
// The table heading's face, padded here rather than by DATA_TABLE_HEAD.
const HEAD = DATA_TABLE_HEADING;
// Name, rows, columns, and the row's own control.
const TABLE = 'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 pb-3';
const ROW = 'col-span-full grid grid-cols-subgrid items-center';
const CELLS = 'col-span-3 grid grid-cols-subgrid items-center py-2.5 pl-5';
const OPENS = cx(CELLS, 'release-row text-dense cursor-pointer text-left');
// The whole row lights, its own control included, for the pointer or the keyboard.
const LIT_ROW = cx(
  ROW,
  'control-wash hover:bg-row-hover has-focus-visible:bg-row-hover',
);
// Controls at a row's end sit as Add sheet does in the header: 3.5 from
// the edge, its margin above and below.
const ACTIONS = 'flex items-center justify-end pr-3.5';
const ROUND = cx(ICON_BOX, 'size-7.5 rounded-full');
// Eyebrow over its value, at the app's eyebrow gap.
const LABELLED = 'grid gap-1.5';
const VALUE = 'text-dense text-primary font-medium tabular-nums';
// A figure's cell, padded 3 above and below its label and value; the divider
// runs between the row's rules, and a lone cell takes the row.
const CELL = cx(
  LABELLED,
  'border-rule-faint content-start py-3 not-first:border-l not-first:pl-5 only:col-span-2',
);

// How long a landed read's time takes in the verified tone: in, held, out.
const FRESH_MS = 3000;

// The resources whose size a new read changed, or that it found anew.
function changedBetween(
  before: SourceSummary,
  after: SourceSummary,
): ReadonlySet<string> {
  return new Set(
    after.resources
      .filter((resource) => {
        const was = before.resources.find((one) => one.name === resource.name);
        return (
          !was ||
          was.rows !== resource.rows ||
          was.columns.length !== resource.columns.length
        );
      })
      .map((resource) => resource.name),
  );
}

/*
  A control drawn as it will be, which does nothing yet: focusable and lit
  on hover, so the layout can be judged, and announced as unavailable.
  Its name is its tooltip.
*/
function Placeholder({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <AriaButton aria-label={label} aria-disabled="true" className={className}>
        {children}
      </AriaButton>
    </Tooltip>
  );
}

/*
  The sources of one kind a process uses, as one section: the service named
  once at the top, then each source of it -- a file, for a spreadsheet -- on
  a band of its own: what it is, what it holds and when it was read on the
  left, the resources the process uses on the right, each opening what was
  last read of it. Nothing here says what the process does with them; that
  belongs to the process.

  `side` picks a use's inputs or outputs; a resource the source does not
  have shows a dash for its figures. Adding and removing
  are placeholders until a process's choice is kept outside the code.
*/
export function SourceView({
  kind: kindKey,
  uses,
  side,
  initial,
  details,
}: {
  kind: SourceKind;
  uses: readonly SourceUse[];
  side: 'inputs' | 'outputs';
  // The latest read of each source as the server had it.
  initial: Parameters<typeof useSources>[1];
  // More about each source as this side sees it, under its last read.
  details?: ReactNode;
}) {
  const kind = SOURCE_KINDS[kindKey];
  const titleId = useId();
  const { entries, read } = useSources(
    uses.map((use) => use.source),
    initial,
  );

  return (
    <DataTable as="article" aria-labelledby={titleId}>
      <SourceHead kind={kindKey} titleId={titleId}>
        <Button size="small" aria-disabled="true">
          <PlusMedium aria-hidden size={12} className="flex-none" />
          Add {kind.noun}
        </Button>
      </SourceHead>
      <div className="divide-rule-faint divide-y">
        {uses.map((use, index) => {
          const entry = entries.find((one) => one.id === use.source);
          return entry ? (
            <SourceFile
              // Index too: one source may be shown twice while previewing.
              key={`${use.source}-${index}`}
              use={use}
              entry={entry}
              names={use[side]}
              onRead={() => void read(use.source)}
              details={details}
            />
          ) : null;
        })}
      </div>
    </DataTable>
  );
}

/*
  One source on its band: on the left its title, what it holds and when it
  was read, with its actions at the foot; on the right a row for each
  resource this side uses.
*/
function SourceFile({
  use,
  entry,
  names,
  onRead,
  details,
}: {
  use: SourceUse;
  entry: SourceEntry;
  names: readonly string[];
  onRead: () => void;
  details?: ReactNode;
}) {
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  // Drawn only once a read has taken a moment, and held long enough to be
  // seen (useLoader), so a quick read does not flicker.
  const loader = useLoader(entry.reading);
  const summary = entry.summary.kind === 'ready' ? entry.summary.value : null;
  // What the last read changed, worked out when a new one lands: its rows
  // light once, keyed by the read so the next change lights them again.
  const [seen, setSeen] = useState(summary);
  const [changed, setChanged] = useState<{
    readId: string;
    names: ReadonlySet<string>;
  } | null>(null);
  if (summary !== seen) {
    setSeen(summary);
    if (seen && summary && seen.readId !== summary.readId)
      setChanged({
        readId: summary.readId,
        names: changedBetween(seen, summary),
      });
  }
  const reduced = useReducedMotion();
  const ring = useReadRing(
    entry.reading && (loader.phase === 'shown' || loader.phase === 'slow'),
    reduced,
  );
  // A read that lands shows its time in the verified tone once the ring has
  // gone -- at once if none was shown: it eases in, holds, and eases back to
  // ink. Played afresh for every read without remounting the time, which
  // morphs to its new value meanwhile.
  const readTime = useRef<HTMLSpanElement>(null);
  const shownFor = useRef<string | null>(null);
  // The time on screen keeps the last read's until the ring has gone, then
  // changes in the same moment the highlight starts.
  const [readAt, setReadAt] = useState(summary?.readAt ?? null);
  if (!ring.phase && readAt !== (summary?.readAt ?? null))
    setReadAt(summary?.readAt ?? null);
  const landed = changed?.readId;
  useEffect(() => {
    if (!landed || reduced || ring.phase || shownFor.current === landed) return;
    shownFor.current = landed;
    const verified = 'var(--sp-state-verified)';
    readTime.current?.animate(
      [
        { offset: 0, easing: 'ease-in-out' },
        { offset: 0.15, color: verified },
        { offset: 0.45, color: verified, easing: 'ease-in-out' },
        { offset: 1 },
      ],
      { duration: FRESH_MS },
    );
  }, [landed, reduced, ring.phase]);
  const declaration = sourceById(use.source);
  if (!declaration) return null;
  const kind = SOURCE_KINDS[declaration.kind];
  const title = summary?.title ?? declaration.label;
  const rows = summary?.resources.reduce((sum, r) => sum + r.rows, 0) ?? 0;

  const table = (view?: (resource: string) => void) => (
    <div className={TABLE}>
      <div className={cx(ROW, BAND, HEAD, 'pl-5')}>
        <span aria-hidden>{kind.resource.singular}</span>
        <span aria-hidden className="justify-self-end">
          Rows
        </span>
        <span aria-hidden className="justify-self-end">
          Columns
        </span>
        <span className={ACTIONS}>
          <Button
            size="xsmall"
            shape="round"
            aria-label={
              editing ? 'Done' : `Edit ${kind.resource.plural} in ${title}`
            }
            onPress={() => setEditing((on) => !on)}
          >
            <MorphingText text={editing ? 'Done' : 'Edit'} />
          </Button>
        </span>
      </div>
      <ResourceList
        label={`${title}: ${kind.resource.plural}`}
        rows={names.map((name) => ({
          name,
          found: summary?.resources.find((r) => r.name === name),
        }))}
        removing={editing}
        changed={changed}
        view={view}
      />
      <div className="col-span-full">
        <Fold open={editing} className="pt-1 pl-5">
          <AddResource
            kind={kind}
            available={
              summary
                ? summary.resources
                    .map((resource) => resource.name)
                    .filter((name) => !names.includes(name))
                : []
            }
          />
        </Fold>
      </div>
    </div>
  );

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={entry.reading || undefined}
      className="grid lg:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <div className="border-rule-faint flex flex-col border-b lg:border-r lg:border-b-0">
        {/* Inset as the figures' rules are: its rule is their top one, on the
            table heading's line. */}
        <div className={cx(BAND, 'mx-5 flex items-center')}>
          <h4
            id={titleId}
            className="text-dense text-primary leading-snug font-semibold"
          >
            {title}
          </h4>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-5 pb-3">
          {/* Two rows of figures: what the file holds, and when it was read
              (and, beside it, anything the side adds -- Last write). */}
          <div className="grid">
            {summary ? (
              <dl className="border-rule-faint grid grid-cols-2 border-b">
                <Figure
                  term={kind.resource.plural}
                  value={summary.resources.length}
                />
                <Figure term="Rows" value={rows} />
              </dl>
            ) : null}
            <dl className="border-rule-faint grid grid-cols-2 border-b">
              <div className={CELL}>
                <dt className="readout text-muted">Last read</dt>
                <dd className="grid gap-0.5">
                  <span ref={readTime} className={cx(VALUE, 'block')}>
                    <MorphingText
                      text={readAt ? runStamp(readAt) : 'Never'}
                      duration={MORPH_WORDS_MS}
                    />
                  </span>
                  <span className="text-meta text-muted block empty:hidden">
                    {summary?.origin === 'captured'
                      ? 'Repository copy'
                      : summary
                        ? ''
                        : entry.summary.kind === 'failed'
                          ? entry.summary.message
                          : 'Not read yet'}
                  </span>
                  {/* Said once, plainly; the page shows it by the ring. */}
                  <span role="status" className="sr-only">
                    {entry.reading
                      ? 'Reading…'
                      : entry.readError
                        ? `The read failed: ${entry.readError}`
                        : ''}
                  </span>
                </dd>
              </div>
              {details}
            </dl>
          </div>
          {entry.readError ? (
            <AlertBox>The read failed: {entry.readError}</AlertBox>
          ) : null}
          {/* At the foot, and never nearer the figures than 30 (gap and pad). */}
          <div className="mt-auto flex items-center gap-1.5 pt-5">
            {summary?.url ? (
              <Tooltip label={kind.open}>
                <a
                  href={summary.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${kind.open} (opens in a new tab)`}
                  className={cx(ROUND, ICON_FILLED)}
                >
                  <ChainLink1Filled aria-hidden size={14} />
                </a>
              </Tooltip>
            ) : null}
            {/* The ring travels round the button while a read is under way. */}
            <span className="source-read">
              <IconButton
                label={
                  !entry.reading
                    ? 'Read now'
                    : loader.phase === 'slow'
                      ? 'Still reading…'
                      : 'Reading…'
                }
                shape="round"
                placement="top"
                aria-disabled={entry.reading || undefined}
                onPress={() => {
                  if (!entry.reading) onRead();
                }}
              >
                <ArrowRotateClockwise aria-hidden size={14} />
              </IconButton>
              <ReadRing {...ring} />
            </span>
            <Placeholder
              label={`Remove this ${kind.noun}`}
              className={cx(ROUND, 'source-remove ml-auto')}
            >
              <TrashCanSimple aria-hidden size={14} />
            </Placeholder>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        {summary ? (
          <SourceDrawer
            source={use.source}
            readId={summary.readId}
            title={title}
          >
            {table}
          </SourceDrawer>
        ) : (
          table()
        )}
      </div>
    </section>
  );
}

/*
  The ring round the Read button: three segments, as the brand mark has three
  petals. They grow in together and turn while a read is under way. When it
  ends they finish at least one whole turn -- a quick read does not flash --
  then shrink back out and are gone (null). Without motion they stand still
  and go as the read ends.
*/
type RingPhase = 'turning' | 'leaving' | null;

function useReadRing(reading: boolean, reduced: boolean | null) {
  const [phase, setPhase] = useState<RingPhase>(null);
  const [turns, setTurns] = useState(0);
  if (reading && phase !== 'turning') {
    setPhase('turning');
    setTurns(0);
  }
  if (!reading && phase === 'turning' && (turns > 0 || reduced))
    setPhase(reduced ? null : 'leaving');
  return {
    phase,
    onTurn: () => setTurns((done) => done + 1),
    onGone: () => setPhase(null),
  };
}

function ReadRing({ phase, onTurn, onGone }: ReturnType<typeof useReadRing>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      className="source-read-ring"
      data-phase={phase ?? undefined}
      onAnimationIteration={(event) => {
        if (event.animationName === 'source-read-turn') onTurn();
      }}
      onAnimationEnd={(event) => {
        if (event.animationName === 'source-read-shrink') onGone();
      }}
    >
      <g>
        {[0, 1, 2].map((index) => (
          <circle
            key={index}
            cx="16"
            cy="16"
            r="15.25"
            pathLength="100"
            transform={`rotate(${index * 120} 16 16)`}
          />
        ))}
      </g>
    </svg>
  );
}

// A moment in the file's figures, drawn as Last read is: its name, the time
// in the app's date shape, and a line about it. Spans, not paragraphs, so a
// panel's rise-in for its lines (process-sheet.css) leaves the figures still.
export function Moment({
  label,
  at,
  note,
}: {
  label: string;
  at: string | null;
  note?: string;
}) {
  return (
    <div className={CELL}>
      <dt className="readout text-muted">{label}</dt>
      <dd className="grid gap-0.5">
        <span className={cx(VALUE, 'block')}>
          {at ? runStamp(at) : 'Never'}
        </span>
        {note ? (
          <span className="text-meta text-muted block">{note}</span>
        ) : null}
      </dd>
    </div>
  );
}

const POPOVER =
  'popover-motion control-face surface-popover rounded-shell outline-none';
const MENU_ITEM =
  'text-dense data-[disabled]:text-muted rounded-control flex h-8 cursor-default items-center px-2.5 outline-none';

/*
  Adding a resource is choosing one the source already has: the menu lists
  only those this side does not use yet, as the last read found them, and
  offers no way to name a new one. Choosing is not wired yet -- what a process
  uses is set in its code -- so each choice is shown but cannot be taken.
*/
function AddResource({
  kind,
  available,
}: {
  kind: (typeof SOURCE_KINDS)[SourceKind];
  available: string[];
}) {
  const label = `Add ${kind.resource.singular}`;
  const face = (
    <>
      <PlusMedium aria-hidden size={12} className="flex-none" />
      {label}
    </>
  );
  if (available.length === 0)
    return (
      <Tooltip
        label={`Every ${kind.resource.singular} in this ${kind.noun} is used`}
      >
        <Button size="small" aria-disabled="true">
          {face}
        </Button>
      </Tooltip>
    );
  return (
    <MenuTrigger>
      <Button size="small">{face}</Button>
      <Popover
        placement="bottom start"
        offset={6}
        className={cx(POPOVER, 'min-w-52')}
      >
        <Menu
          aria-label={label}
          disabledKeys={available}
          className="grid p-1 outline-none"
        >
          <MenuSection>
            <Header className="readout text-muted px-2.5 pt-1.5 pb-1">
              {capitalise(kind.resource.plural)} in this {kind.noun}
            </Header>
            {available.map((name) => (
              <MenuItem key={name} id={name} className={MENU_ITEM}>
                {name}
              </MenuItem>
            ))}
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function Figure({ term, value }: { term: string; value: number }) {
  return (
    <div className={CELL}>
      <dt className="readout text-muted">{term}</dt>
      <dd className={VALUE}>
        <MorphingText text={String(value)} />
      </dd>
    </div>
  );
}

function ResourceList({
  label,
  rows,
  removing,
  changed,
  view,
}: {
  label: string;
  rows: { name: string; found: SourceResource | undefined }[];
  // Whether each row's remove control shows.
  removing: boolean;
  // The rows a read just changed, which light once.
  changed: { readId: string; names: ReadonlySet<string> } | null;
  view?: (resource: string) => void;
}) {
  return (
    <ul
      aria-label={label}
      className="release-list source-rows col-span-full grid grid-cols-subgrid"
    >
      {rows.map(({ name, found }) => (
        <li
          // A changed row is drawn afresh, so its light plays again.
          key={changed?.names.has(name) ? `${name}:${changed.readId}` : name}
          data-changed={changed?.names.has(name) ? '' : undefined}
          className={LIT_ROW}
        >
          {found && view ? (
            <button
              type="button"
              className={OPENS}
              aria-label={`${name}, ${count(found.rows, 'row')}, ${count(found.columns.length, 'column')}. View its data.`}
              onClick={() => view(name)}
            >
              <span
                className={cx('release-row-subject truncate', DATA_TABLE_NAME)}
              >
                {name}
              </span>
              <span className="release-row-pill release-row-trail justify-self-end">
                <MorphingText text={String(found.rows)} />
              </span>
              <span className="release-row-trail text-meta text-muted justify-self-end tabular-nums">
                <MorphingText text={String(found.columns.length)} />
              </span>
            </button>
          ) : (
            <div className={cx(CELLS, 'text-dense')}>
              <span className={cx('truncate', DATA_TABLE_NAME)}>{name}</span>
              <span className="text-meta text-muted justify-self-end">—</span>
              <span className="text-meta text-muted justify-self-end">—</span>
            </div>
          )}
          <span className={ACTIONS}>
            {/* Always there, so it can fade both ways; hidden, it cannot be
                reached (source-card.css). */}
            <span
              className="source-row-remove"
              data-shown={removing || undefined}
            >
              <Placeholder
                label={`Remove ${name}`}
                className={cx(ICON_BOX, 'source-cross size-6 rounded-full')}
              >
                <CrossSmall aria-hidden size={12} />
              </Placeholder>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
