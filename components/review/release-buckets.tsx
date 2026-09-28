'use client';

import { styleDebug } from '@/lib/style-debug';
import { useState } from 'react';
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
import { DeltaValue } from './delta';
import { dispositionGlyph } from './markers';

/*
  The release card's buckets: the bar, one tab per disposition, and the rows of
  whichever is selected. The card itself -- title, verdict, commitment -- is in
  release-card.tsx.
*/

/*
  Only the selected tab is filled: it is the one filled thing in the card, so
  "these rows" needs no second signal. The rest carry their bucket's colour as
  ink alone and take the lighter fill under the pointer or the keyboard; the
  bar above them already says what each colour is worth.
*/
const PILL =
  'text-severity-ink data-[hovered]:bg-severity-fill data-[focus-visible]:bg-severity-fill data-[selected]:bg-severity-fill-strong data-[selected]:text-severity-strong data-[selected]:shadow-severity-ring inline-flex items-baseline gap-1.5 rounded-full border-0 px-2.5 py-1 text-dense font-medium whitespace-nowrap control-wash data-[focus-visible]:outline-offset-2 [&_.value]:text-inherit [&_.value]:[font-weight:550]';

// Rows run the full width of the card: the separators are the structure, so
// they cannot stop short of the edge. The panel pays back the card's body
// padding (BODY in release-card.tsx) with a negative margin, and each row puts
// it back as its own inline padding.
const ROW = 'border-rule-faint shadow-separator-bottom-solid border-b';
/*
  Three columns on one grid for every row: the shape, the subject with its
  reason under it, and the change at the far end. The shape column is what the
  eye runs down, so it keeps one width whether a row holds a glyph or not.
*/
const ROW_GRID =
  'grid w-full grid-cols-[0.75rem_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-6 text-left @max-card:grid-cols-[0.75rem_minmax(0,1fr)] @max-card:px-4';
const ROW_BUTTON = cx(
  ROW_GRID,
  'control-wash hover:bg-surface-hover focus-visible:bg-surface-hover py-3 text-body leading-normal focus-visible:-outline-offset-2',
);
const ROW_MARK = 'text-severity-ink self-center';
const ROW_SUBJECT = 'min-w-0 [overflow-wrap:anywhere]';
const ROW_REASON = 'text-muted text-meta col-start-2 min-w-0';
const ROW_DELTA =
  'col-start-3 row-start-1 inline-flex min-w-0 flex-wrap items-baseline justify-end gap-1.5 text-right @max-card:col-start-2 @max-card:row-start-auto @max-card:justify-start @max-card:text-left';

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
}: {
  plan: ReleasePlan;
  counts: ReturnType<typeof evaluationCounts>;
  onOpen: OpenReview;
}) {
  const order = nonEmptyDispositions(counts);
  const total = totalOf(counts);
  // The most severe bucket opens, because it is the one that decides whether
  // the release can go out at all.
  const [selected, setSelected] = useState<Disposition>(order[0]!);
  const segments = barSegments(counts);

  return (
    <Tabs
      className="mt-5"
      selectedKey={selected}
      onSelectionChange={(key) => setSelected(key as Disposition)}
    >
      {/* Decorative: it restates the proportions the tabs give in digits, and
          answers to selection rather than to the pointer so it always agrees
          with the rows on show. */}
      {/* Taller box than the bar reads, with the extra pulled back by a
          negative margin: the selected segment can grow without moving
          anything below it. */}
      <div
        className="-my-0.5 flex h-2.5 items-center gap-0.5"
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
            className="release-bucket-bar h-1.5 min-w-2 rounded-full transition-[flex-grow,height] duration-(--duration-row) ease-out data-[active]:h-2.5"
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
        className="mt-3 flex flex-wrap gap-2"
        aria-label="Filter by disposition"
      >
        {order.map((disposition) => (
          <Tab
            key={disposition}
            id={disposition}
            {...styleDebug({
              component: 'ReleaseCard',
              part: 'bucket-tab',
              appearance: 'bg-severity-fill',
            })}
            className={PILL}
            data-severity={severityRank(disposition)}
          >
            <span className="value [font-weight:550] text-inherit">
              {counts[disposition]}
            </span>{' '}
            {DISPOSITION_LABELS[disposition].toLowerCase()}
          </Tab>
        ))}
      </TabList>
      {order.map((disposition) => (
        <TabPanel
          key={disposition}
          id={disposition}
          className="border-rule-faint shadow-separator-bottom-solid -mx-6 mt-4 border-t outline-none"
          data-severity={severityRank(disposition)}
        >
          <BucketPanel plan={plan} disposition={disposition} onOpen={onOpen} />
        </TabPanel>
      ))}
      <p className="sr-only">
        {total} {nounFor(plan, total)} evaluated.
      </p>
    </Tabs>
  );
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
      <ul>
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
                disposition={disposition}
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
          className={cx(
            ROW_GRID,
            'control-wash text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary text-body min-h-11 py-2.5 focus-visible:-outline-offset-2',
          )}
          onClick={() => onOpen(disposition)}
        >
          <span className="col-start-2">
            and {rows.hidden} more <span aria-hidden="true">↗</span>
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
  const [first, ...rest] = effect.deltas;
  const annotation = [
    reasonLabel,
    effect.requiresApproval ? 'Needs approval' : null,
  ]
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
        <span aria-hidden="true" className={ROW_MARK}>
          <Glyph name={dispositionGlyph[effect.disposition]} size={10} />
        </span>
        <span className={ROW_SUBJECT}>{effect.subject}</span>
        <span className={ROW_DELTA}>
          {first ? (
            <DeltaValue delta={first} />
          ) : (
            <DeltaValue
              delta={{
                kind: 'opaque',
                label: 'Proposed change',
                summary: 'No change proposed',
              }}
            />
          )}
          {rest.length > 0 ? (
            <span className="text-muted text-meta">
              +{rest.length} more {rest.length === 1 ? 'change' : 'changes'}
            </span>
          ) : null}
        </span>
        {/* The row contract is subject, delta, reason, disposition. The reason
            is an annotation, so it sits under the subject in the quiet ink
            rather than in a chip of its own. */}
        {annotation ? <span className={ROW_REASON}>{annotation}</span> : null}
        <span className="sr-only">Open in review</span>
      </button>
    </li>
  );
}

// A reason is not an item, so it opens the bucket rather than a detail. It
// still has to be reachable: it is the only route the card offers to the
// items it stands for.
function ReasonRow({
  plan,
  disposition,
  row,
  onOpen,
}: {
  plan: ReleasePlan;
  disposition: Disposition;
  row: ReasonRollUp;
  onOpen: () => void;
}) {
  return (
    <li className={ROW} data-severity={severityRank(disposition)}>
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
        {/* A reason stands for items rather than being one, so it reads as a
            summary line: the shape of its bucket, and the count at the end. */}
        <span aria-hidden="true" className={ROW_MARK}>
          <Glyph name={dispositionGlyph[disposition]} size={10} />
        </span>
        <span className={cx(ROW_SUBJECT, 'text-muted')}>{row.label}</span>
        <span className={ROW_DELTA}>
          <span className="value">{row.count}</span> {nounFor(plan, row.count)}
        </span>
        <span className="sr-only">Open in review</span>
      </button>
    </li>
  );
}
