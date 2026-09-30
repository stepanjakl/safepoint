'use client';

import ArrowUpRight from 'blode-icons-react/icons/arrow-up-right';
import { motion } from 'motion/react';
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import {
  DISPOSITION_LABELS,
  severityRank,
  type Disposition,
  type Effect,
  type ReleasePlan,
} from '@/lib/review/plan-contract';
import {
  barSegments,
  bucketRows,
  effectsByDisposition,
  evaluationCounts,
  nonEmptyDispositions,
  totalOf,
  type ReasonRollUp,
} from '@/lib/review/plan-derivations';
import { Glyph } from '@/components/ui/glyph';
import { cx } from '@/lib/cx';
import { useSwap } from '@/components/ui/swap';
import { formatScalar } from './delta';
import { dispositionGlyph } from './markers';

/*
  The release card's buckets: the bar, one tab per disposition, and the rows of
  whichever is selected. The card itself -- title, verdict, commitment -- is in
  release-card.tsx.
*/

/*
  Every tab is lit in its bucket's colour, so each reads as a count of
  something; the selected one takes the run tally's solid and light ink. Flat:
  no ring in any state.
*/
const PILL_SHAPE =
  'control-wash inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-dense font-medium whitespace-nowrap [&_.value]:[font-weight:550]';
const PILL = cx(
  PILL_SHAPE,
  'bg-severity-pill text-severity-ink data-[hovered]:not-data-[selected]:bg-severity-pill-hover data-[hovered]:not-data-[selected]:text-severity-strong data-[focus-visible]:not-data-[selected]:bg-severity-pill-hover data-[focus-visible]:not-data-[selected]:text-severity-strong data-[selected]:bg-severity-solid data-[selected]:text-severity-on-solid',
);

// The card's header: what the batch needs, the bar and the tabs, ruled off
// from the rows. The card's other states open with it too.
export const CARD_HEAD =
  'border-floating-ring shadow-separator-bottom-solid border-b p-6 @max-card:p-4';

/*
  One line per item, ruled from where the text starts, and closed by a rule
  across the card's full width: the subject, why it is here in its bucket's colour, how much it
  would change, and the arrow that says the review opens over the page. Rows
  share the list's columns, so reasons and counts line up down it; below the
  card's narrow width the reason drops under the subject.
*/
const LIST =
  'release-list grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 @max-card:grid-cols-[minmax(0,1fr)_auto_auto]';
// Its rules are the list's (`.release-list` in release-card.css).
const ROW = 'col-span-full grid grid-cols-subgrid';
const ROW_BUTTON =
  'release-row group/row control-wash hover:bg-surface-hover focus-visible:bg-surface-hover col-span-full grid w-full cursor-pointer grid-cols-subgrid items-center gap-y-1 px-6 py-3 text-left text-dense @max-card:px-4';
// Opened items step back (`.release-row[data-seen]` in release-card.css).
const ROW_SUBJECT = 'release-row-subject col-start-1 row-start-1 truncate';
// Colour alone, no face: the pill beside it is the row's one chip.
// Colour alone, no face, against the column's right edge; with no count
// beside it, the count's column too, so every reason ends where the next thing
// begins.
const ROW_REASON =
  'text-severity-ink group-hover/row:text-severity-strong group-focus-visible/row:text-severity-strong control-wash col-start-2 row-start-1 justify-self-end text-meta data-[alone]:col-span-2 @max-card:col-start-1 @max-card:row-start-2 @max-card:justify-self-start @max-card:data-[alone]:col-span-1';
// Stretched across its column, so every count is the same chip.
const ROW_COUNT =
  'release-row-pill col-start-3 row-start-1 @max-card:col-start-2';
const PILL_LEAD = 'release-row-pill-lead value';
// The word beside a count, a shade under it, as the run tallies set theirs.
const QUIET = 'text-muted-strong';
// Outside the list, so outside its columns: its own two, arrow last.
const MORE_ROW =
  'release-row group/row control-wash hover:bg-surface-hover focus-visible:bg-surface-hover border-floating-ring shadow-separator-bottom-solid grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b px-6 py-3 text-left text-dense @max-card:px-4';
// Its timing and lean are `.release-row-arrow` in release-card.css.
const ARROW =
  'release-row-arrow text-muted group-hover/row:text-primary group-focus-visible/row:text-primary group-aria-expanded/row:text-primary inline-block';
const ROW_ARROW = cx(ARROW, 'col-start-4 row-start-1 @max-card:col-start-3');
const rowStyle = (
  index: number,
): CSSProperties & { '--release-bucket-row-index': number } => ({
  '--release-bucket-row-index': index,
});

// Opening the review can name a bucket, an item, or neither. One callback
// rather than three: every route into the modal is the same operation with a
// narrower starting point.
export type OpenReview = (disposition?: Disposition, itemId?: string) => void;

export function nounFor(plan: ReleasePlan, count: number) {
  return count === 1 ? plan.noun.one : plan.noun.other;
}

// Zone 3. The bar, the tabs and the rows are one control: the tabs are the only
// place a bucket's count appears, and the rows below are whichever bucket is
// selected. Two parallel lists of the same four buckets -- pills to open a
// filtered modal, an accordion to expand the same bucket inline -- was the
// redundancy; this is the merge.
export function Buckets({
  plan,
  counts,
  onOpen,
  lead,
  seen,
}: {
  plan: ReleasePlan;
  counts: ReturnType<typeof evaluationCounts>;
  onOpen: OpenReview;
  // Items already opened in the review.
  seen?: ReadonlySet<string>;
  // What the header says above the bar: the verdict, or the receipt.
  lead: ReactNode;
}) {
  const order = nonEmptyDispositions(counts);
  const total = totalOf(counts);
  // The most severe bucket opens, because it is the one that decides whether
  // the release can go out at all.
  const [selected, setSelected] = useState<Disposition>(order[0]!);
  // The selected bucket answers at once; its rows fade before the next set
  // arrives, while their dividers stay in place.
  const { shown, layer, entering } = useSwap(selected, () => 'fade');
  const rows = useRef<HTMLDivElement>(null);
  const height = useMeasuredHeight(rows);

  return (
    <Tabs
      selectedKey={selected}
      onSelectionChange={(key) => setSelected(key as Disposition)}
    >
      <div className={CARD_HEAD}>
        {lead}
        <BucketBar counts={counts} selected={selected} className="mt-5" />
        <TabList
          className="mt-4 flex flex-wrap gap-1.5"
          aria-label="Filter by disposition"
        >
          {order.map((disposition) => (
            <Tab
              key={disposition}
              id={disposition}
              className={PILL}
              data-severity={severityRank(disposition)}
            >
              <Glyph name={dispositionGlyph[disposition]} size={8} />
              <span className="value">{counts[disposition]}</span>
              {DISPOSITION_LABELS[disposition].toLowerCase()}
            </Tab>
          ))}
        </TabList>
      </div>
      <div
        className="overflow-clip transition-[height] duration-(--duration-pane) ease-out"
        style={{ height }}
      >
        <div ref={rows}>
          {/* Only the selected tab's panel renders; what it holds is the
              bucket on show, which lags the selection while the old rows
              fade out. */}
          {order.map((disposition) => (
            <TabPanel
              key={disposition}
              id={disposition}
              className="outline-none"
            >
              <motion.div
                key={shown}
                {...layer}
                className="release-bucket-swap"
                data-swap-entering={entering || undefined}
              >
                <BucketPanel
                  plan={plan}
                  disposition={shown}
                  onOpen={onOpen}
                  seen={seen}
                />
              </motion.div>
            </TabPanel>
          ))}
        </div>
      </div>
      <p className="sr-only">
        {total} {nounFor(plan, total)} evaluated.
      </p>
    </Tabs>
  );
}

/*
  Decorative: it restates the proportions the tabs give in digits, and answers
  to selection rather than to the pointer so it always agrees with the rows on
  show. One line: square where two buckets meet, rounded only at its ends. A
  track the selected segment's height, so it can grow without moving anything
  below it.
*/
function BucketBar({
  counts,
  selected,
  className,
}: {
  counts: ReturnType<typeof evaluationCounts>;
  selected: Disposition;
  className?: string;
}) {
  return (
    <div
      className={cx('flex h-2.5 items-center gap-0.5', className)}
      aria-hidden="true"
    >
      {barSegments(counts).map((segment) => (
        <span
          key={segment.disposition}
          className="release-bucket-bar h-1.5 min-w-2 transition-[flex-grow,height,background-color] duration-(--duration-row) ease-out first:rounded-l-full last:rounded-r-full data-[active]:h-2.5"
          data-severity={severityRank(segment.disposition)}
          data-active={segment.disposition === selected || undefined}
          // Grown from the same count that sizes it, so the selected segment
          // takes its extra width from its neighbours rather than from the
          // bar changing size.
          style={{
            flexGrow:
              segment.disposition === selected
                ? segment.count * 1.2
                : segment.count,
          }}
        />
      ))}
    </div>
  );
}

// The rendered height of what the element holds, for a box to ease to. Undefined
// until measured, so the first paint is the content's own height.
function useMeasuredHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry!.borderBoxSize[0]!.blockSize),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

// Zone 4. At or below the row budget every item is listed, so the ordinary
// case hides nothing. Past it the reason distribution is the readable summary
// and the items themselves belong in the modal.
function BucketPanel({
  plan,
  disposition,
  onOpen,
  seen,
}: {
  plan: ReleasePlan;
  disposition: Disposition;
  onOpen: OpenReview;
  seen?: ReadonlySet<string>;
}) {
  const effects = effectsByDisposition(plan.effects, disposition);
  const rows = bucketRows(effects, plan.reasons);
  const reasonLabels = new Map(
    plan.reasons.map((reason) => [reason.key, reason.label]),
  );

  return (
    <>
      <ul className={LIST}>
        {rows.kind === 'items'
          ? rows.items.map((effect, index) => (
              <EffectRow
                key={effect.id}
                effect={effect}
                index={index}
                seen={seen?.has(effect.id) ?? false}
                reasonLabel={
                  effect.reasonKey
                    ? (reasonLabels.get(effect.reasonKey) ?? null)
                    : null
                }
                onOpen={() => onOpen(disposition, effect.id)}
              />
            ))
          : rows.reasons.map((row, index) => (
              <ReasonRow
                key={row.key}
                plan={plan}
                row={row}
                index={index}
                onOpen={() => onOpen(disposition)}
              />
            ))}
      </ul>
      {/* Only when something is actually withheld. Every listed row is already
          a way into the modal, so a link beside a complete list would be a
          second route to what the reader can already reach. */}
      {rows.hidden > 0 ? (
        <button
          type="button"
          className={cx(MORE_ROW, 'text-muted hover:text-primary')}
          style={rowStyle(
            rows.kind === 'items' ? rows.items.length : rows.reasons.length,
          )}
          onClick={() => onOpen(disposition)}
        >
          <span>and {rows.hidden} more</span>
          <span aria-hidden="true" className={ARROW}>
            <ArrowUpRight size={14} strokeWidth={2} />
          </span>
          <span className="sr-only">
            {' '}
            — open the review filtered to{' '}
            {DISPOSITION_LABELS[disposition].toLowerCase()}
          </span>
        </button>
      ) : null}
    </>
  );
}

// The item is the reviewable unit, so the whole row is the control that opens
// it. Nothing inside is separately clickable: a row with its own interactive
// parts would give the pointer two targets for one destination.
function EffectRow({
  effect,
  index,
  seen,
  reasonLabel,
  onOpen,
}: {
  effect: Effect;
  index: number;
  seen: boolean;
  reasonLabel: string | null;
  onOpen: () => void;
}) {
  const changes = effect.deltas.length;
  const reason = [reasonLabel, effect.requiresApproval && 'Needs approval']
    .filter(Boolean)
    .join(' · ');
  return (
    <li
      className={ROW}
      data-severity={severityRank(effect.disposition)}
      style={rowStyle(index)}
    >
      <button
        type="button"
        className={ROW_BUTTON}
        data-seen={seen || undefined}
        onClick={onOpen}
      >
        <span className={ROW_SUBJECT}>{effect.subject}</span>
        {reason ? (
          <span
            className={ROW_REASON}
            data-alone={changes > 0 ? undefined : ''}
          >
            {reason}
          </span>
        ) : null}
        {/* Nothing to count is the usual case for a held item, so it leaves
            the column to the reason rather than printing "none" down it. */}
        {changes > 0 ? <ChangePill deltas={effect.deltas} /> : null}
        <span aria-hidden="true" className={ROW_ARROW}>
          <ArrowUpRight size={14} strokeWidth={2} />
        </span>
        <span className="sr-only">Open in review</span>
      </button>
    </li>
  );
}

// One value moving is worth showing rather than counting: the change itself,
// the old value a shade under the new, which sits on the lead. Anything else
// is counted.
function ChangePill({ deltas }: { deltas: Effect['deltas'] }) {
  const only = deltas.length === 1 ? deltas[0]! : null;
  const pair =
    only?.kind === 'scalar'
      ? {
          before:
            only.before === null
              ? null
              : formatScalar(only.before, only.display),
          after: formatScalar(only.after, only.display),
        }
      : only?.kind === 'categorical'
        ? { before: only.before, after: only.after }
        : null;
  if (!only || !pair) {
    return (
      <span className={ROW_COUNT}>
        <span className={PILL_LEAD}>{deltas.length}</span>
        <span className={QUIET}>
          {deltas.length === 1 ? 'change' : 'changes'}
        </span>
      </span>
    );
  }
  // Figures take the tabular face; a categorical value is a word.
  const figure = only.kind === 'scalar';
  // Read in order, old then new, so here the lead half is the second.
  return (
    <span className={ROW_COUNT}>
      <span className={cx(QUIET, figure && 'value', 'text-right')}>
        <span className="sr-only">{only.label}: </span>
        {pair.before === null ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">not observed</span>
          </>
        ) : (
          pair.before
        )}
        <span aria-hidden="true"> →</span>
        <span className="sr-only"> changes to </span>
      </span>
      <span className={cx('release-row-pill-lead', figure && 'value')}>
        {pair.after}
      </span>
    </span>
  );
}

// A reason is not an item, so it opens the bucket rather than a detail. It
// still has to be reachable: it is the only route the card offers to the
// items it stands for.
function ReasonRow({
  plan,
  row,
  index,
  onOpen,
}: {
  plan: ReleasePlan;
  row: ReasonRollUp;
  index: number;
  onOpen: () => void;
}) {
  return (
    <li className={ROW} style={rowStyle(index)}>
      <button type="button" className={ROW_BUTTON} onClick={onOpen}>
        {/* A reason stands for items rather than being one: the reason, and
            how many items it covers in the pill. */}
        <span className={cx(ROW_SUBJECT, 'text-muted-strong')}>
          {row.label}
        </span>
        <span className={ROW_COUNT}>
          <span className={PILL_LEAD}>{row.count}</span>
          <span className={QUIET}>{nounFor(plan, row.count)}</span>
        </span>
        <span aria-hidden="true" className={ROW_ARROW}>
          <ArrowUpRight size={14} strokeWidth={2} />
        </span>
        <span className="sr-only">Open in review</span>
      </button>
    </li>
  );
}
