'use client';

import { useId, useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import {
  DISPOSITION_LABELS,
  severityRank,
  type Disposition,
  type Effect,
  type ReleasePlan,
} from '@/lib/review/plan-contract';
import {
  appliedSummary,
  attentionLine,
  barSegments,
  bucketRows,
  effectsByDisposition,
  evaluationCounts,
  nonEmptyDispositions,
  planState,
  totalOf,
  type ReasonRollUp,
} from '@/lib/review/plan-derivations';
import { DeltaValue } from './delta';

/*
  Class sets the card reuses. Named here rather than repeated because each is
  applied in two or three places and several of them have to agree: every row
  and the panel that holds them share one separator treatment, and the card's
  own inline-size container is what the narrow rules below answer to.
*/

// One step above the pane it sits on: the first thing found, not another panel
// on the same plane. `@container` makes the card the query root for its zones.
const CARD =
  'control-face surface-floating severity-scale @container data-[danger]:border-state-blocked overflow-clip rounded-shell';
const BODY = 'p-6 @max-card:px-4 @max-card:py-5';
const TITLE = 'text-display [font-weight:550] [overflow-wrap:anywhere]';
const VERDICT = 'text-primary mt-2 text-body leading-normal text-pretty';
const RECEIPT_NOTE = 'text-muted mt-1 text-meta';
const PILL_STATE =
  'bg-commit-state text-state-caution rounded-full px-3 py-1.25 text-dense font-medium whitespace-nowrap';

/*
  Filled rather than outlined: the tab carries its bucket's colour at a weight
  the bar segment can be read against, lightened enough to keep the label
  legible on top of it. The selected tab is the only one wearing its own colour
  as an edge, so the ring is what says "these rows", not the fill weight alone.
*/
const PILL =
  'bg-severity-fill text-severity-ink data-[hovered]:bg-severity-fill-strong data-[selected]:bg-severity-fill-strong data-[selected]:shadow-severity-ring data-[focus-visible]:outline-focus inline-flex items-baseline gap-1.5 rounded-full border-0 px-2.5 py-1 text-dense font-medium whitespace-nowrap control-wash data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 [&_.value]:text-inherit [&_.value]:[font-weight:550]';

// Rows run the full width of the card: the separators are the structure, so
// they cannot stop short of the edge. The panel pays back the body's padding
// with a negative margin and each row puts it back as its own inline padding.
const ROW = 'border-rule-faint shadow-separator-bottom-solid border-b';
const ROW_BUTTON =
  'control-wash hover:bg-surface-inset focus-visible:outline-focus flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-6 py-3 text-left text-body leading-normal focus-visible:outline-2 focus-visible:-outline-offset-2';
const ROW_DELTA =
  'text-muted ml-auto inline-flex min-w-0 flex-wrap items-baseline gap-1.5 text-right @max-card:ml-0 @max-card:w-full @max-card:text-left';
// The reason, as a chip in its row's own severity. Pulled back from the tab's
// weight: the tabs are the navigation, a reason is an annotation.
const ROW_REASON =
  'bg-severity-fill text-severity-annotation rounded-full px-2.5 py-0.75 text-right text-meta ';
const CHIP =
  'border-rule-default text-muted rounded-full border px-1.75 py-0.5 text-micro whitespace-nowrap';

// Opening the review can name a bucket, an item, or neither. One callback
// rather than three: every route into the modal is the same operation with a
// narrower starting point.
export type OpenReview = (disposition?: Disposition, itemId?: string) => void;

function nounFor(plan: ReleasePlan, count: number) {
  return count === 1 ? plan.noun.one : plan.noun.other;
}

// Zone 1. The fact that makes the card safe to read, so it opens the card and
// sets up the safety line that closes it.
function CommitState({ plan }: { plan: ReleasePlan }) {
  const simulated = plan.mode === 'replay';
  const applied =
    plan.status.kind === 'applied' || plan.status.kind === 'partially_applied';
  return (
    <div className="border-rule-faint shadow-separator-bottom-solid @max-card:px-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-6 py-3">
      {/* Filled and in sentence case: the commit state is the first thing read,
          so it is a label rather than a system readout. */}
      <span className={PILL_STATE} data-simulated={simulated}>
        {applied
          ? simulated
            ? 'Replay · simulated receipt'
            : 'Applied'
          : simulated
            ? 'Preview · nothing applied'
            : 'Preview'}
      </span>
      <span className="text-muted text-meta min-w-0 [overflow-wrap:anywhere]">
        {plan.source}
      </span>
    </div>
  );
}

// Zone 3. The bar, the tabs and the rows are one control: the tabs are the only
// place a bucket's count appears, and the rows below are whichever bucket is
// selected. Two parallel lists of the same four buckets -- pills to open a
// filtered modal, an accordion to expand the same bucket inline -- was the
// redundancy; this is the merge.
function Buckets({
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
            className="bg-severity-bar h-1.5 min-w-2 rounded-full transition-[flex-grow,height] duration-(--duration-row) ease-out data-[active]:h-2.5"
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
          className="control-wash text-muted hover:bg-surface-inset hover:text-primary focus-visible:outline-focus text-body block min-h-11 w-full px-6 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
          onClick={() => onOpen(disposition)}
        >
          and {rows.hidden} more <span aria-hidden="true">↗</span>
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
  return (
    <li className={ROW} data-severity={severityRank(effect.disposition)}>
      <button type="button" className={ROW_BUTTON} onClick={onOpen}>
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {effect.subject}
        </span>
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
            was only feeding the roll-up before; it belongs on the row too. */}
        {reasonLabel ? <span className={ROW_REASON}>{reasonLabel}</span> : null}
        {effect.requiresApproval ? (
          <span className={CHIP}>Needs approval</span>
        ) : null}
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
  row,
  onOpen,
}: {
  plan: ReleasePlan;
  row: ReasonRollUp;
  onOpen: () => void;
}) {
  return (
    <li className={ROW}>
      <button type="button" className={ROW_BUTTON} onClick={onOpen}>
        {/* A reason stands for items rather than being one, so it reads as a
            summary line: the count leads and the label carries no severity
            chip of its own. */}
        <span className="text-muted min-w-0 [overflow-wrap:anywhere]">
          {row.label}
        </span>
        <span className={ROW_DELTA}>
          <span className="value">{row.count}</span> {nounFor(plan, row.count)}
        </span>
        <span className="sr-only">Open in review</span>
      </button>
    </li>
  );
}

// Zone 5. Under replay no control names an operation this slice cannot perform,
// so apply, retry, undo and re-run appear as receipt text rather than buttons.
function Commitment({
  label,
  onOpen,
  safety,
}: {
  label: string;
  onOpen: OpenReview;
  safety: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 [&>button]:min-h-11">
      <Button variant="primary" onPress={() => onOpen()}>
        {label}
        <span aria-hidden="true">↗</span>
      </Button>
      <p className="text-muted text-meta min-w-0">{safety}</p>
    </div>
  );
}

function StaleBanner({ plan }: { plan: ReleasePlan }) {
  if (plan.status.kind !== 'stale') return null;
  const n = plan.status.changedEffectIds.length;
  return (
    // Above the header, because it invalidates everything below it, counts included.
    <p
      className="border-state-caution bg-state-caution/8 rounded-t-shell text-dense -mb-px flex items-baseline gap-2.5 border px-4 py-2.5 leading-normal"
      role="status"
    >
      <span
        aria-hidden="true"
        className="value text-state-caution font-semibold"
      >
        !
      </span>{' '}
      {n} {nounFor(plan, n)} changed since this ran.{' '}
      {plan.mode === 'replay' ? 'Re-run is not available in replay.' : ''}
    </p>
  );
}

export function ReleaseCard({
  plan,
  onOpen,
}: {
  plan: ReleasePlan;
  onOpen: OpenReview;
}) {
  const headingId = useId();
  const state = planState(plan);
  const counts = evaluationCounts(plan.effects);
  const total = totalOf(counts);
  const receipt = appliedSummary(plan);

  // Nothing to do is not a card. One muted line in the thread.
  if (state === 'empty') {
    return (
      <p className="text-muted text-dense py-1">
        Rule pass produced no changes. Nothing to review.
      </p>
    );
  }

  if (state === 'incomplete' && plan.status.kind === 'incomplete') {
    return (
      <article className={CARD} aria-labelledby={headingId}>
        <CommitState plan={plan} />
        <div className={BODY}>
          <h2 id={headingId} className={TITLE}>
            {plan.title}
          </h2>
          <p className={VERDICT}>
            Evaluation stopped at step {plan.status.step} of {plan.status.of}.
            No release plan was produced.
          </p>
        </div>
      </article>
    );
  }

  if (state === 'all_clear') {
    return (
      <article className={CARD} aria-labelledby={headingId}>
        <CommitState plan={plan} />
        <div className={BODY}>
          <p className="text-body flex items-baseline gap-2.5 leading-normal text-pretty">
            <span
              aria-hidden="true"
              className="value text-state-verified shrink-0"
            >
              ✓
            </span>
            <span>
              <strong id={headingId}>{plan.title}.</strong> {total}{' '}
              {nounFor(plan, total)} will apply. Nothing needs attention.
            </span>
          </p>
          <Commitment
            label={plan.reviewLabel}
            onOpen={onOpen}
            safety={
              plan.mode === 'replay'
                ? 'This is a recorded replay. Reviewing changes nothing.'
                : 'Nothing is applied until you apply it.'
            }
          />
        </div>
      </article>
    );
  }

  const blockedOnly = state === 'fully_blocked';

  return (
    <>
      <StaleBanner plan={plan} />
      <article
        className={CARD}
        data-danger={blockedOnly || undefined}
        aria-labelledby={headingId}
      >
        <CommitState plan={plan} />
        <div className={BODY}>
          <h2 id={headingId} className={TITLE}>
            {plan.title}
          </h2>
          {receipt ? (
            <div>
              <p className={VERDICT}>
                Applied {receipt.applied} of {receipt.total}{' '}
                {nounFor(plan, receipt.total)}.
              </p>
              {plan.status.kind === 'partially_applied' ? (
                <p className={RECEIPT_NOTE}>
                  {plan.status.failures[0]!.reason}
                  {plan.status.failures.length > 1
                    ? ` · ${plan.status.failures.length} failures`
                    : ''}
                </p>
              ) : null}
              <p className={RECEIPT_NOTE}>
                {plan.status.kind === 'applied' ||
                plan.status.kind === 'partially_applied'
                  ? plan.status.at
                  : ''}
                {plan.mode === 'replay'
                  ? ' · Simulated receipt. No external record changed.'
                  : ''}
              </p>
            </div>
          ) : (
            <p className={VERDICT}>{attentionLine(counts, plan.noun)}</p>
          )}
          <Buckets plan={plan} counts={counts} onOpen={onOpen} />
          <Commitment
            // When applying is impossible the action changes; it is never
            // greyed out.
            label={blockedOnly ? 'Resolve blockers' : plan.reviewLabel}
            onOpen={onOpen}
            safety={
              plan.mode === 'replay'
                ? 'This is a recorded replay. Reviewing changes nothing.'
                : 'Nothing is applied until you apply it.'
            }
          />
        </div>
      </article>
    </>
  );
}
