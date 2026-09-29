'use client';

import { motion } from 'motion/react';
import { styleDebug } from '@/lib/style-debug';
import {
  useLayoutEffect,
  useRef,
  useState,
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
import { motionAlong, useSwap } from '@/components/ui/swap';
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
const PILL =
  'control-wash bg-severity-pill text-severity-ink data-[hovered]:not-data-[selected]:bg-severity-pill-hover data-[hovered]:not-data-[selected]:text-severity-strong data-[focus-visible]:not-data-[selected]:bg-severity-pill-hover data-[focus-visible]:not-data-[selected]:text-severity-strong data-[selected]:bg-severity-solid data-[selected]:text-severity-on-solid inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-dense font-medium whitespace-nowrap [&_.value]:[font-weight:550]';

// The card's header: what the batch needs, the bar and the tabs, ruled off
// from the rows. The card's other states open with it too.
export const CARD_HEAD =
  'border-rule-faint shadow-separator-bottom-solid border-b p-6 @max-card:p-4';

/*
  One line per item, the rules running the card's full width between header
  and footer: the subject, why it is here in its bucket's colour, how much it
  would change, and the arrow that says the review opens over the page. Rows
  share the list's columns, so reasons and counts line up down it; below the
  card's narrow width the reason drops under the subject.
*/
const LIST =
  'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 @max-card:grid-cols-[minmax(0,1fr)_auto_auto]';
const ROW =
  'border-rule-faint shadow-separator-bottom-solid col-span-full grid grid-cols-subgrid border-b';
const ROW_BUTTON =
  'release-row group/row control-wash hover:bg-surface-hover focus-visible:bg-surface-hover col-span-full grid min-h-11 w-full cursor-pointer grid-cols-subgrid items-center gap-y-1 px-6 py-2 text-left text-dense @max-card:px-4';
const ROW_SUBJECT = 'text-primary col-start-1 row-start-1 truncate font-medium';
// Colour alone, no face: the pill beside it is the row's one chip.
// Colour alone, no face, against the column's right edge; with no count
// beside it, the count's column too, so every reason ends where the next thing
// begins.
const ROW_REASON =
  'text-severity-ink group-hover/row:text-severity-strong group-focus-visible/row:text-severity-strong col-start-2 row-start-1 justify-self-end text-meta font-medium transition-colors data-[alone]:col-span-2 @max-card:col-start-1 @max-card:row-start-2 @max-card:justify-self-start @max-card:data-[alone]:col-span-1';
// Stretched across its column, so every count is the same chip.
const ROW_COUNT =
  'release-row-pill col-start-3 row-start-1 @max-card:col-start-2';
const PILL_LEAD = 'release-row-pill-lead value';
// The word beside a count, a shade under it, as the run tallies set theirs.
const QUIET = 'opacity-75';
// Outside the list, so outside its columns: its own two, arrow last.
const MORE_ROW =
  'release-row group/row control-wash hover:bg-surface-hover focus-visible:bg-surface-hover border-rule-faint shadow-separator-bottom-solid grid min-h-11 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b px-6 py-2 text-left text-dense @max-card:px-4';
const ARROW =
  'text-muted group-hover/row:text-primary group-focus-visible/row:text-primary transition-colors';
const ROW_ARROW = cx(ARROW, 'col-start-4 row-start-1 @max-card:col-start-3');

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
}: {
  plan: ReleasePlan;
  counts: ReturnType<typeof evaluationCounts>;
  onOpen: OpenReview;
  // What the header says above the bar: the verdict, or the receipt.
  lead: ReactNode;
}) {
  const order = nonEmptyDispositions(counts);
  const total = totalOf(counts);
  // The most severe bucket opens, because it is the one that decides whether
  // the release can go out at all.
  const [selected, setSelected] = useState<Disposition>(order[0]!);
  const segments = barSegments(counts);
  // The rows trade places the way the tabs lie, and the list's height follows
  // what is in it rather than jumping when a bucket is longer.
  const { shown, layer } = useSwap(selected, motionAlong(order, 'horizontal'));
  const rows = useRef<HTMLDivElement>(null);
  const height = useMeasuredHeight(rows);

  return (
    <Tabs
      selectedKey={selected}
      onSelectionChange={(key) => setSelected(key as Disposition)}
    >
      <div className={CARD_HEAD}>
        {lead}
        {/* Decorative: it restates the proportions the tabs give in digits, and
          answers to selection rather than to the pointer so it always agrees
          with the rows on show. One line: square where two buckets meet,
          rounded only at its ends. */}
        {/* A track the selected segment's height, so it can grow without moving
          anything below it. */}
        <div
          className="mt-5 flex h-2.5 items-center gap-0.5"
          aria-hidden="true"
        >
          {segments.map((segment) => (
            <span
              key={segment.disposition}
              {...styleDebug({
                component: 'ReleaseCard',
                part: 'bucket-bar',
                appearance: 'release-bucket-bar',
              })}
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
        <TabList
          className="mt-4 flex flex-wrap gap-1.5"
          aria-label="Filter by disposition"
        >
          {order.map((disposition) => (
            <Tab
              key={disposition}
              id={disposition}
              {...styleDebug({
                component: 'ReleaseCard',
                part: 'bucket-tab',
                appearance: 'bg-severity-pill',
              })}
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
              <motion.div key={shown} {...layer}>
                <BucketPanel plan={plan} disposition={shown} onOpen={onOpen} />
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
}: {
  plan: ReleasePlan;
  disposition: Disposition;
  onOpen: OpenReview;
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
          ? rows.items.map((effect) => (
              <EffectRow
                key={effect.id}
                effect={effect}
                reasonLabel={
                  effect.reasonKey
                    ? (reasonLabels.get(effect.reasonKey) ?? null)
                    : null
                }
                onOpen={() => onOpen(disposition, effect.id)}
              />
            ))
          : rows.reasons.map((row) => (
              <ReasonRow
                key={row.key}
                plan={plan}
                row={row}
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
          onClick={() => onOpen(disposition)}
        >
          <span>and {rows.hidden} more</span>
          <span aria-hidden="true" className={ARROW}>
            ↗
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
  reasonLabel,
  onOpen,
}: {
  effect: Effect;
  reasonLabel: string | null;
  onOpen: () => void;
}) {
  const changes = effect.deltas.length;
  const reason = [reasonLabel, effect.requiresApproval && 'Needs approval']
    .filter(Boolean)
    .join(' · ');
  return (
    <li className={ROW} data-severity={severityRank(effect.disposition)}>
      <button
        type="button"
        {...styleDebug({
          component: 'ReleaseCard',
          part: 'review-row',
          appearance: 'control-wash',
        })}
        className={ROW_BUTTON}
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
          ↗
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
  onOpen,
}: {
  plan: ReleasePlan;
  row: ReasonRollUp;
  onOpen: () => void;
}) {
  return (
    <li className={ROW}>
      <button
        type="button"
        {...styleDebug({
          component: 'ReleaseCard',
          part: 'review-row',
          appearance: 'control-wash',
        })}
        className={ROW_BUTTON}
        onClick={onOpen}
      >
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
          ↗
        </span>
        <span className="sr-only">Open in review</span>
      </button>
    </li>
  );
}
