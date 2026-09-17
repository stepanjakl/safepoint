'use client';

import {
  Fragment,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';
import { diffText, type ParagraphChange } from '@/lib/process/instruction-diff';

/*
  A change to a long text, read as the text itself rather than as two texts
  side by side. Two parts:

    The summary card says how much changed and draws the paragraph map: one
    segment per paragraph, sized by its length and coloured by what happened
    to it, so where the changes sit in a long document is visible before any
    of it is read. The map is a control, not a picture. Pointing at or
    focusing a segment names the paragraph and says what its colour means,
    and lights the paragraph in the text; choosing it brings the paragraph
    into view, unfolding it if it was folded. Arrow keys move along the map,
    so it is one tab stop however long the document.

    The text lists the paragraphs in order, numbered as they stand in the new
    version, each with a bar in the margin and a label for what changed, and
    the words added or taken out marked inside a rewritten one. Pointing at a
    paragraph lights its segment on the map. Runs of unchanged paragraphs fold
    away behind their numbers, so a one-word edit to a long document shows the
    edit and not the document; a single unchanged paragraph stays open as the
    context a change beside it is read in.

  Colour is never the only signal: every paragraph has a label, additions are
  underlined, removals struck through, and each carries a word for screen
  readers.
*/

const FOLD_FROM = 2;

type Kind = ParagraphChange['kind'];

const KINDS: Record<
  Kind,
  {
    label: string;
    explain: (to: string) => string;
    bar: string;
    swatch: string;
    ink: string;
  }
> = {
  same: {
    label: 'Unchanged',
    explain: () => 'Reads the same in both versions.',
    bar: 'border-rule-faint',
    swatch: 'bg-rule-strong',
    ink: 'text-muted',
  },
  changed: {
    label: 'Rewritten',
    explain: () => 'Words were added or taken out inside this paragraph.',
    bar: 'border-state-caution',
    swatch: 'bg-state-caution',
    ink: 'text-state-caution',
  },
  added: {
    label: 'Added',
    explain: (to) => `A paragraph that is new in ${to}.`,
    bar: 'border-state-verified',
    swatch: 'bg-state-verified',
    ink: 'text-state-verified',
  },
  removed: {
    label: 'Removed',
    explain: (to) => `A paragraph taken out in ${to}.`,
    bar: 'border-state-blocked',
    swatch: 'bg-state-blocked',
    ink: 'text-state-blocked',
  },
};

// The legend's order: what a reader is looking for first.
const LEGEND: Kind[] = ['changed', 'added', 'removed', 'same'];

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (count: number, one: string, other: string) =>
  `${count} ${count === 1 ? one : other}`;

type Row = {
  index: number;
  change: ParagraphChange;
  // Its place in the new version; null for a paragraph that is not in it.
  number: number | null;
  wordsAdded: number;
  wordsRemoved: number;
  length: number;
};

type Block =
  { kind: 'row'; row: Row } | { kind: 'fold'; start: number; rows: Row[] };

function lengthOf(change: ParagraphChange): number {
  return change.kind === 'changed'
    ? change.segments.reduce((sum, segment) => sum + segment.text.length, 0)
    : change.text.length;
}

function countsOf(row: Row): string {
  return [
    row.wordsAdded > 0 ? `+${plural(row.wordsAdded, 'word', 'words')}` : null,
    row.wordsRemoved > 0
      ? `−${plural(row.wordsRemoved, 'word', 'words')}`
      : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
}

export function TextDiff({
  before,
  after,
  from,
  to,
}: {
  before: string;
  after: string;
  from: string;
  to: string;
}) {
  const id = useId();
  const diff = useMemo(() => diffText(before, after), [before, after]);
  const rows = useMemo<Row[]>(() => {
    // How many paragraphs of the new version come at or before each change:
    // a removed paragraph adds none, so it shares its neighbour's count.
    const counts = diff.paragraphs.reduce<number[]>(
      (running, change) => [
        ...running,
        (running.at(-1) ?? 0) + (change.kind === 'removed' ? 0 : 1),
      ],
      [],
    );
    return diff.paragraphs.map((change, index) => ({
      index,
      change,
      number: change.kind === 'removed' ? null : counts[index]!,
      wordsAdded: diff.stats[index]?.wordsAdded ?? 0,
      wordsRemoved: diff.stats[index]?.wordsRemoved ?? 0,
      length: lengthOf(change),
    }));
  }, [diff]);

  // Folds a reader has opened, by the index of their first paragraph.
  const [unfolded, setUnfolded] = useState<ReadonlySet<number>>(new Set());
  // The paragraph lit on both the map and the text.
  const [active, setActive] = useState<number | null>(null);
  // The map's one tab stop: the first change, until the reader moves it.
  const [focusIndex, setFocusIndex] = useState(() =>
    Math.max(
      0,
      rows.findIndex((row) => row.change.kind !== 'same'),
    ),
  );
  const segments = useRef<(HTMLButtonElement | null)[]>([]);

  const blocks: Block[] = [];
  const foldOf = new Map<number, number>();
  for (let i = 0; i < rows.length;) {
    if (rows[i]!.change.kind !== 'same') {
      blocks.push({ kind: 'row', row: rows[i]! });
      i += 1;
      continue;
    }
    let end = i;
    while (end < rows.length && rows[end]!.change.kind === 'same') end += 1;
    if (end - i >= FOLD_FROM && !unfolded.has(i)) {
      blocks.push({ kind: 'fold', start: i, rows: rows.slice(i, end) });
      for (let k = i; k < end; k += 1) foldOf.set(k, i);
    } else {
      for (let k = i; k < end; k += 1) {
        blocks.push({ kind: 'row', row: rows[k]! });
      }
    }
    i = end;
  }

  const paragraphId = (index: number) => `${id}-paragraph-${index}`;
  const reveal = (index: number) => {
    const fold = foldOf.get(index);
    if (fold !== undefined) setUnfolded((open) => new Set(open).add(fold));
    setActive(index);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    requestAnimationFrame(() =>
      document.getElementById(paragraphId(index))?.scrollIntoView({
        block: 'nearest',
        behavior: reduce.matches ? 'auto' : 'smooth',
      }),
    );
  };

  const onMapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: focusIndex + 1,
      ArrowDown: focusIndex + 1,
      ArrowLeft: focusIndex - 1,
      ArrowUp: focusIndex - 1,
      Home: 0,
      End: rows.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = Math.min(rows.length - 1, Math.max(0, target));
    setFocusIndex(next);
    segments.current[next]?.focus();
  };

  const changedCount = rows.filter((row) => row.change.kind !== 'same').length;
  const present = LEGEND.filter((kind) =>
    rows.some((row) => row.change.kind === kind),
  );

  return (
    <div className="grid gap-4">
      <div className="bg-surface-inset rounded-control grid gap-3 px-4 pt-3 pb-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-dense text-primary">
            <span className="value">{from}</span>
            <span aria-hidden="true" className="text-muted">
              {' '}
              →{' '}
            </span>
            <span className="sr-only"> to </span>
            <span className="value">{to}</span>
          </p>
          <p className="text-meta text-muted flex flex-wrap gap-x-3">
            <span>
              {changedCount === 0
                ? 'No changes'
                : `${changedCount} of ${plural(rows.length, 'paragraph', 'paragraphs')} changed`}
            </span>
            {diff.wordsAdded > 0 ? (
              <span className="text-state-verified">
                +{plural(diff.wordsAdded, 'word', 'words')}
              </span>
            ) : null}
            {diff.wordsRemoved > 0 ? (
              <span className="text-state-blocked">
                −{plural(diff.wordsRemoved, 'word', 'words')}
              </span>
            ) : null}
          </p>
        </div>

        {rows.length > 0 ? (
          <div
            role="group"
            aria-label={`Paragraph map, ${plural(rows.length, 'paragraph', 'paragraphs')}. Arrow keys move along it; Enter shows the paragraph.`}
            onKeyDown={onMapKeyDown}
            className="-my-1 flex items-center gap-0.5"
          >
            {rows.map((row) => {
              const kind = KINDS[row.change.kind];
              const name = row.number
                ? `Paragraph ${pad(row.number)}`
                : 'Removed paragraph';
              const detail = [kind.explain(to), countsOf(row)]
                .filter(Boolean)
                .join(' ');
              return (
                <Tooltip
                  key={row.index}
                  label={`${name} · ${kind.label}`}
                  description={detail}
                >
                  <button
                    type="button"
                    ref={(element) => {
                      segments.current[row.index] = element;
                    }}
                    tabIndex={row.index === focusIndex ? 0 : -1}
                    aria-label={`${name}, ${kind.label.toLowerCase()}. ${detail}`}
                    aria-controls={paragraphId(row.index)}
                    data-active={active === row.index || undefined}
                    onMouseEnter={() => setActive(row.index)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => {
                      setActive(row.index);
                      setFocusIndex(row.index);
                    }}
                    onBlur={() => setActive(null)}
                    onClick={() => reveal(row.index)}
                    // Taller than the bar it draws, so the bar is easy to
                    // point at; the bar grows into the space when lit.
                    className="group/segment flex h-6 min-w-2 basis-0 cursor-pointer items-center"
                    style={{ flexGrow: Math.max(row.length, 1) }}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        'h-1.5 w-full rounded-full transition-[height,opacity] duration-(--duration-state) ease-out group-focus-visible/segment:h-3 group-data-[active]/segment:h-3',
                        kind.swatch,
                        row.change.kind === 'same' &&
                          'opacity-50 group-data-[active]/segment:opacity-80',
                      )}
                    />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        ) : null}

        {present.some((kind) => kind !== 'same') ? (
          // Decorative: every segment names its own kind when pointed at.
          <ul
            aria-hidden="true"
            className="text-micro text-muted flex flex-wrap gap-x-4 gap-y-1"
          >
            {present.map((kind) => (
              <li key={kind} className="inline-flex items-center gap-1.5">
                <span
                  className={cx(
                    'h-1.5 w-3 rounded-full',
                    KINDS[kind].swatch,
                    kind === 'same' && 'opacity-50',
                  )}
                />
                {KINDS[kind].label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ol className="grid gap-0.5">
        {blocks.map((block) =>
          block.kind === 'fold' ? (
            <li key={`fold-${block.start}`}>
              <button
                type="button"
                onClick={() =>
                  setUnfolded((open) => new Set(open).add(block.start))
                }
                className="control-wash text-muted hover:bg-surface-inset hover:text-primary focus-visible:bg-surface-inset focus-visible:text-primary rounded-control text-meta -mx-sheet-inset px-sheet-inset grid w-[calc(100%+2*var(--spacing-sheet-inset))] cursor-pointer grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-2 text-left"
              >
                <span className="value">
                  {pad(block.rows[0]!.number!)}–
                  {pad(block.rows.at(-1)!.number!)}
                </span>
                <span className="border-rule-default border-l-2 border-dotted pl-3">
                  {plural(
                    block.rows.length,
                    'unchanged paragraph',
                    'unchanged paragraphs',
                  )}{' '}
                  · Show
                </span>
              </button>
            </li>
          ) : (
            <ParagraphRow
              key={block.row.index}
              id={paragraphId(block.row.index)}
              row={block.row}
              active={active === block.row.index}
              onHover={setActive}
            />
          ),
        )}
      </ol>
    </div>
  );
}

function ParagraphRow({
  id,
  row,
  active,
  onHover,
}: {
  id: string;
  row: Row;
  active: boolean;
  onHover: (index: number | null) => void;
}) {
  const { change } = row;
  const kind = KINDS[change.kind];
  return (
    <li
      id={id}
      data-active={active || undefined}
      onMouseEnter={() => onHover(row.index)}
      onMouseLeave={() => onHover(null)}
      className="rounded-control data-[active]:bg-surface-inset -mx-2 grid scroll-my-4 grid-cols-[2rem_minmax(0,1fr)] gap-x-3 px-2 py-2 transition-colors duration-(--duration-state)"
    >
      <span aria-hidden="true" className="value text-meta text-muted pt-0.5">
        {row.number ? pad(row.number) : '—'}
      </span>
      <div className={cx('grid gap-1 border-l-2 pl-3', kind.bar)}>
        {change.kind === 'same' ? null : (
          <p className="text-micro flex flex-wrap items-baseline gap-x-2">
            <span className={cx('readout', kind.ink)}>{kind.label}</span>
            {row.wordsAdded > 0 ? (
              <span className="value text-state-verified">
                +{row.wordsAdded}
              </span>
            ) : null}
            {row.wordsRemoved > 0 ? (
              <span className="value text-state-blocked">
                −{row.wordsRemoved}
              </span>
            ) : null}
          </p>
        )}
        <p
          className={cx(
            'text-dense leading-relaxed whitespace-pre-line',
            change.kind === 'same' || change.kind === 'removed'
              ? 'text-muted'
              : 'text-primary',
          )}
        >
          {change.kind === 'changed' ? (
            change.segments.map((segment, index) =>
              segment.kind === 'same' ? (
                <Fragment key={index}>{segment.text}</Fragment>
              ) : segment.kind === 'added' ? (
                <ins
                  key={index}
                  className="bg-state-verified/12 decoration-state-verified/60 rounded-[2px] underline decoration-1 underline-offset-[3px]"
                >
                  <span className="sr-only">[added: </span>
                  {segment.text}
                  <span className="sr-only">]</span>
                </ins>
              ) : (
                <del
                  key={index}
                  className="bg-state-blocked/8 text-state-blocked decoration-state-blocked/70 rounded-[2px]"
                >
                  <span className="sr-only">[removed: </span>
                  {segment.text}
                  <span className="sr-only">]</span>
                </del>
              ),
            )
          ) : change.kind === 'removed' ? (
            <del className="decoration-state-blocked/70">{change.text}</del>
          ) : change.kind === 'added' ? (
            <ins className="no-underline">{change.text}</ins>
          ) : (
            change.text
          )}
        </p>
      </div>
    </li>
  );
}
