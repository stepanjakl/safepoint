'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  DISPOSITION_LABELS,
  severityRank,
  type Disposition,
  type Effect,
  type ReleasePlan,
} from '@/lib/review/plan-contract';
import {
  ROLL_UP_THRESHOLD,
  appliedSummary,
  barSegments,
  effectsByDisposition,
  evaluationCounts,
  nonEmptyDispositions,
  planState,
  rollUpByReason,
  totalOf,
  verdictLine,
} from '@/lib/review/plan-derivations';
import { DeltaValue } from './delta';

const MAX_ROWS_PER_GROUP = 3;

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
    <div className="release-commit">
      <span className="release-pill-state" data-simulated={simulated}>
        {applied
          ? simulated
            ? 'Replay · simulated receipt'
            : 'Applied'
          : simulated
            ? 'Preview · nothing applied'
            : 'Preview'}
      </span>
      <span className="release-source">{plan.source}</span>
    </div>
  );
}

function Distribution({
  plan,
  onOpen,
}: {
  plan: ReleasePlan;
  onOpen: (disposition?: Disposition) => void;
}) {
  const counts = evaluationCounts(plan.effects);
  const segments = barSegments(counts);
  const total = totalOf(counts);

  return (
    <div className="release-distribution">
      <div className="release-bar" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={segment.disposition}
            className="release-bar-segment"
            data-severity={severityRank(segment.disposition)}
            style={{ flexGrow: segment.count }}
          />
        ))}
      </div>
      <ul className="release-pills">
        {nonEmptyDispositions(counts).map((disposition) => (
          <li key={disposition}>
            {/* Every count is a control. The pills are the navigation, which is
                why there is no separate "view blockers" link. */}
            <button
              type="button"
              className="release-pill"
              data-severity={severityRank(disposition)}
              onClick={() => onOpen(disposition)}
            >
              <span className="value">{counts[disposition]}</span>{' '}
              {DISPOSITION_LABELS[disposition].toLowerCase()}
              <span className="sr-only">
                {' '}
                — open the review filtered to these{' '}
                {nounFor(plan, counts[disposition])}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="sr-only">
        {total} {nounFor(plan, total)} evaluated.
      </p>
    </div>
  );
}

function EffectRow({ effect }: { effect: Effect }) {
  const [first, ...rest] = effect.deltas;
  return (
    <li className="release-row">
      <span className="release-row-subject">{effect.subject}</span>
      <span className="release-row-delta">
        {first ? (
          <DeltaValue delta={first} />
        ) : (
          <span className="delta-opaque">No change proposed</span>
        )}
        {rest.length > 0 ? (
          <span className="release-row-more">
            +{rest.length} more {rest.length === 1 ? 'change' : 'changes'}
          </span>
        ) : null}
      </span>
      {effect.requiresApproval ? (
        <span className="release-chip">Needs approval</span>
      ) : null}
    </li>
  );
}

// Zone 4. Below the threshold the items are the evidence; above it the shape of
// the problem is the reason distribution, and items belong in the modal.
function EvidenceGroup({
  plan,
  disposition,
  open,
  onOpen,
}: {
  plan: ReleasePlan;
  disposition: Disposition;
  open: boolean;
  onOpen: (disposition?: Disposition) => void;
}) {
  const effects = effectsByDisposition(plan.effects, disposition);
  if (effects.length === 0) return null;
  const rolled = effects.length > ROLL_UP_THRESHOLD;
  const rows = rolled ? [] : effects.slice(0, MAX_ROWS_PER_GROUP);
  const hidden = rolled ? 0 : effects.length - rows.length;
  const reasonRows = rolled
    ? rollUpByReason(effects, plan.reasons).slice(0, MAX_ROWS_PER_GROUP)
    : [];
  const reasonHidden = rolled
    ? rollUpByReason(effects, plan.reasons).length - reasonRows.length
    : 0;

  return (
    <details className="release-group" open={open}>
      <summary>
        <span
          className="release-group-dot"
          data-severity={severityRank(disposition)}
          aria-hidden="true"
        />
        {DISPOSITION_LABELS[disposition]}
        <span className="release-group-count value">{effects.length}</span>
      </summary>
      <ul className="release-rows">
        {rows.map((effect) => (
          <EffectRow key={effect.id} effect={effect} />
        ))}
        {reasonRows.map((row) => (
          <li key={row.key} className="release-row release-row-rolled">
            <span className="release-row-subject">{row.label}</span>
            <span className="release-row-delta">
              <span className="value">{row.count}</span>{' '}
              {nounFor(plan, row.count)}
            </span>
          </li>
        ))}
        {hidden + reasonHidden > 0 ? (
          <li className="release-row release-row-more-link">
            <button type="button" onClick={() => onOpen(disposition)}>
              and {hidden + reasonHidden} more
            </button>
          </li>
        ) : null}
      </ul>
    </details>
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
  onOpen: (disposition?: Disposition) => void;
  safety: string;
}) {
  return (
    <div className="release-commitment">
      <Button variant="primary" onPress={() => onOpen()}>
        {label}
        <span aria-hidden="true">↗</span>
      </Button>
      <p className="release-safety">{safety}</p>
    </div>
  );
}

function StaleBanner({ plan }: { plan: ReleasePlan }) {
  if (plan.status.kind !== 'stale') return null;
  const n = plan.status.changedEffectIds.length;
  return (
    // Above the header, because it invalidates everything below it, counts included.
    <p className="release-stale" role="status">
      <span aria-hidden="true">!</span> {n} {nounFor(plan, n)} changed since
      this ran.{' '}
      {plan.mode === 'replay' ? 'Re-run is not available in replay.' : ''}
    </p>
  );
}

export function ReleaseCard({
  plan,
  onOpen,
}: {
  plan: ReleasePlan;
  onOpen: (disposition?: Disposition) => void;
}) {
  const headingId = useId();
  const state = planState(plan);
  const counts = evaluationCounts(plan.effects);
  const total = totalOf(counts);
  const receipt = appliedSummary(plan);

  // Nothing to do is not a card. One muted line in the thread.
  if (state === 'empty') {
    return (
      <p className="release-quiet">
        Rule pass produced no changes. Nothing to review.
      </p>
    );
  }

  if (state === 'incomplete' && plan.status.kind === 'incomplete') {
    return (
      <article className="release-card" aria-labelledby={headingId}>
        <CommitState plan={plan} />
        <div className="release-body">
          <h2 id={headingId} className="release-title">
            {plan.title}
          </h2>
          <p className="release-verdict">
            Evaluation stopped at step {plan.status.step} of {plan.status.of}.
            No release plan was produced.
          </p>
        </div>
      </article>
    );
  }

  if (state === 'all_clear') {
    return (
      <article
        className="release-card release-card-quiet"
        aria-labelledby={headingId}
      >
        <CommitState plan={plan} />
        <div className="release-body">
          <p className="release-allclear">
            <span aria-hidden="true" className="release-check">
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
            safety="Nothing is applied until you apply it."
          />
        </div>
      </article>
    );
  }

  const blockedOnly = state === 'fully_blocked';
  const order = nonEmptyDispositions(counts);
  const mostSevere = order[0];

  return (
    <>
      <StaleBanner plan={plan} />
      <article
        className="release-card"
        data-danger={blockedOnly || undefined}
        aria-labelledby={headingId}
      >
        <CommitState plan={plan} />
        <div className="release-body">
          <h2 id={headingId} className="release-title">
            {plan.title}
          </h2>
          {receipt ? (
            <div className="release-receipt">
              <p className="release-verdict">
                Applied {receipt.applied} of {receipt.total}{' '}
                {nounFor(plan, receipt.total)}.
              </p>
              {plan.status.kind === 'partially_applied' ? (
                <p className="release-receipt-note">
                  {plan.status.failures[0]!.reason}
                  {plan.status.failures.length > 1
                    ? ` · ${plan.status.failures.length} failures`
                    : ''}
                </p>
              ) : null}
              <p className="release-receipt-note">
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
            <p className="release-verdict">{verdictLine(counts, plan.noun)}</p>
          )}
          <Distribution plan={plan} onOpen={onOpen} />
          <div className="release-evidence">
            {order.map((disposition) => (
              <EvidenceGroup
                key={disposition}
                plan={plan}
                disposition={disposition}
                open={disposition === mostSevere}
                onOpen={onOpen}
              />
            ))}
          </div>
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
