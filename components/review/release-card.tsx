'use client';

import { styleDebug } from '@/lib/style-debug';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import type { ReleasePlan } from '@/lib/review/plan-contract';
import {
  appliedSummary,
  attentionLine,
  evaluationCounts,
  planState,
  totalOf,
} from '@/lib/review/plan-derivations';
import { Buckets, nounFor, type OpenReview } from './release-buckets';

/*
  Class sets the card reuses. Named here rather than repeated because each is
  applied in two or three places. The card's own inline-size container is what
  the narrow rules here and in release-buckets.tsx answer to.
*/

// One step above the pane it sits on: the first thing found, not another panel
// on the same plane. `@container` makes the card the query root for its zones.
const CARD =
  'control-face surface-floating @container data-[danger]:border-state-blocked overflow-clip rounded-shell';
const BODY = 'p-6 @max-card:px-4 @max-card:py-5';
const TITLE = 'text-display [font-weight:550] [overflow-wrap:anywhere]';
const VERDICT = 'text-primary mt-2 text-body leading-normal text-pretty';
const RECEIPT_NOTE = 'text-muted mt-1 text-meta';
const PILL_STATE =
  'bg-commit-state text-commit-state-ink data-[simulated=true]:bg-replay-state-face data-[simulated=true]:text-replay-state-ink rounded-full px-3 py-1.25 text-dense font-medium whitespace-nowrap';

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
      <span
        {...styleDebug({
          component: 'ReleaseCard',
          part: 'commit-state',
          appearance: 'bg-commit-state',
        })}
        className={PILL_STATE}
        data-simulated={simulated}
      >
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
      <article
        {...styleDebug({
          component: 'ReleaseCard',
          appearance: 'surface-floating',
        })}
        className={CARD}
        aria-labelledby={headingId}
      >
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
      <article
        {...styleDebug({
          component: 'ReleaseCard',
          appearance: 'surface-floating',
        })}
        className={CARD}
        aria-labelledby={headingId}
      >
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
        {...styleDebug({
          component: 'ReleaseCard',
          appearance: 'surface-floating',
        })}
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
