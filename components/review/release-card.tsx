'use client';

import { styleDebug } from '@/lib/style-debug';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Glyph, type GlyphName } from '@/components/ui/glyph';
import type { Tone } from '@/components/ui/status-label';
import type { ReleasePlan } from '@/lib/review/plan-contract';
import {
  appliedSummary,
  attentionLine,
  evaluationCounts,
  needingAttention,
  planState,
  totalOf,
  type DispositionCounts,
  type ReviewProgress,
} from '@/lib/review/plan-derivations';
import { cx } from '@/lib/cx';
import { toneText } from './markers';
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
const EDGE = 'px-6 @max-card:px-4';
const BODY = 'p-6 @max-card:px-4 @max-card:py-5';
// The verdict is the headline: the batch is already named by the page and by
// the card's header, so the one large line says what the batch needs.
const VERDICT = 'text-display [font-weight:550] text-pretty';
const RECEIPT_NOTE = 'text-muted mt-1 text-meta';
const HEADER_ROW =
  'border-rule-faint shadow-separator-bottom-solid flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b py-3 text-meta';

// Whether anything has been applied, said once, in the header, where it is
// read before anything else. A reassurance is not a warning, so it carries the
// run's mode mark rather than the caution tone.
function modeOf(plan: ReleasePlan): {
  glyph: GlyphName;
  tone: Tone;
  label: string;
} {
  const replay = plan.mode === 'replay';
  const applied =
    plan.status.kind === 'applied' || plan.status.kind === 'partially_applied';
  if (applied)
    return replay
      ? {
          glyph: 'diamond',
          tone: 'simulated',
          label: 'Replay · simulated receipt',
        }
      : { glyph: 'check', tone: 'verified', label: 'Applied' };
  return replay
    ? { glyph: 'diamond', tone: 'simulated', label: 'Replay · nothing applied' }
    : { glyph: 'dotted', tone: 'preview', label: 'Preview · nothing applied' };
}

// Zone 1. The batch's name, and whether anything has changed because of it.
function Header({ plan, titleId }: { plan: ReleasePlan; titleId: string }) {
  const mode = modeOf(plan);
  return (
    <div className={cx(HEADER_ROW, EDGE)}>
      <span
        id={titleId}
        className="text-muted min-w-0 [overflow-wrap:anywhere]"
      >
        {plan.title}
      </span>
      <span
        {...styleDebug({ component: 'ReleaseCard', part: 'mode' })}
        className="text-muted inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <span className={toneText[mode.tone]}>
          <Glyph name={mode.glyph} size={10} />
        </span>
        {mode.label}
      </span>
    </div>
  );
}

// Inside the card, under its header, because it invalidates everything below
// it, counts included.
function StaleRow({ plan }: { plan: ReleasePlan }) {
  if (plan.status.kind !== 'stale') return null;
  const n = plan.status.changedEffectIds.length;
  return (
    <p
      className={cx(
        HEADER_ROW,
        EDGE,
        'text-state-caution text-dense justify-start',
      )}
      role="status"
    >
      <Glyph name="triangle" size={10} />
      <span>
        {n} {nounFor(plan, n)} changed since this ran.
        {plan.mode === 'replay' ? ' Re-run is not available in replay.' : ''}
      </span>
    </p>
  );
}

const ACTION_ROW =
  'mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 [&>button]:min-h-11';
const ACTION_NOTE = 'text-muted text-meta min-w-0';

function ReviewButton({
  label,
  onOpen,
  variant = 'primary',
}: {
  label: string;
  onOpen: OpenReview;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Button variant={variant} onPress={() => onOpen()}>
      {label}
      <span aria-hidden="true">↗</span>
    </Button>
  );
}

/*
  Zone 5. One primary action, and which one follows the review rather than the
  proposal: review, then continue, then commit. Approving is not here -- every
  decision is made in the review, beside its evidence, so the card can never
  approve a line nobody opened. Committing is, because its confirmation lists
  everything it will do. Under replay no control names an operation this slice
  cannot perform, so commit appears as receipt text rather than a button.
*/
function CardAction({
  plan,
  counts,
  progress,
  onOpen,
  onCommit,
}: {
  plan: ReleasePlan;
  counts: DispositionCounts;
  progress?: ReviewProgress;
  onOpen: OpenReview;
  onCommit?: () => void;
}) {
  const state = planState(plan);
  const live = plan.mode === 'live';
  const settled = state === 'applied' || state === 'partially_applied';

  if (progress?.phase === 'committing') {
    return (
      <div className={ACTION_ROW}>
        <p className={ACTION_NOTE}>
          Committing approved changes. Decisions are closed until it finishes.
        </p>
      </div>
    );
  }

  const ready =
    progress?.phase === 'ready' || (!settled && state === 'all_clear');
  if (ready) {
    const total = totalOf(counts);
    const summary =
      progress?.phase === 'ready'
        ? `${progress.approved} approved · ${progress.held} held`
        : `${total} ${nounFor(plan, total)} · nothing needs a decision`;
    return (
      <div className={ACTION_ROW}>
        {live ? (
          <>
            <Button variant="primary" onPress={onCommit}>
              Commit approved changes
            </Button>
            <ReviewButton
              label={plan.reviewLabel}
              onOpen={onOpen}
              variant="secondary"
            />
          </>
        ) : (
          <ReviewButton label={plan.reviewLabel} onOpen={onOpen} />
        )}
        <p className={ACTION_NOTE}>
          {summary}
          {live ? '' : '. Commit is not available in replay.'}
        </p>
      </div>
    );
  }

  if (progress?.phase === 'reviewing') {
    return (
      <div className={ACTION_ROW}>
        <ReviewButton label="Continue review" onOpen={onOpen} />
        <p className={ACTION_NOTE}>
          <span className="value text-primary">{progress.decided}</span> of{' '}
          <span className="value text-primary">{needingAttention(counts)}</span>{' '}
          decisions made
        </p>
      </div>
    );
  }

  return (
    <div className={ACTION_ROW}>
      <ReviewButton
        // When applying is impossible the action changes; it is never
        // greyed out.
        label={
          state === 'fully_blocked' ? 'Resolve blockers' : plan.reviewLabel
        }
        onOpen={onOpen}
      />
    </div>
  );
}

export function ReleaseCard({
  plan,
  progress,
  onOpen,
  onCommit,
}: {
  plan: ReleasePlan;
  progress?: ReviewProgress;
  onOpen: OpenReview;
  onCommit?: () => void;
}) {
  const titleId = useId();
  const verdictId = useId();
  const state = planState(plan);
  const counts = evaluationCounts(plan.effects);
  const receipt = appliedSummary(plan);
  const labelledBy = `${titleId} ${verdictId}`;

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
        aria-labelledby={labelledBy}
      >
        <Header plan={plan} titleId={titleId} />
        <div className={BODY}>
          <h2 id={verdictId} className={VERDICT}>
            Evaluation stopped at step {plan.status.step} of {plan.status.of}.
          </h2>
          <p className={RECEIPT_NOTE}>No release plan was produced.</p>
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
        aria-labelledby={labelledBy}
      >
        <Header plan={plan} titleId={titleId} />
        <div className={BODY}>
          <h2
            id={verdictId}
            className={cx(VERDICT, 'flex items-baseline gap-2.5')}
          >
            <span className="text-state-verified shrink-0 self-center">
              <Glyph name="check" size={16} />
            </span>
            <span>{attentionLine(counts, plan.noun)}</span>
          </h2>
          <CardAction
            plan={plan}
            counts={counts}
            progress={progress}
            onOpen={onOpen}
            onCommit={onCommit}
          />
        </div>
      </article>
    );
  }

  const blockedOnly = state === 'fully_blocked';

  return (
    <article
      {...styleDebug({
        component: 'ReleaseCard',
        appearance: 'surface-floating',
      })}
      className={CARD}
      data-danger={blockedOnly || undefined}
      aria-labelledby={labelledBy}
    >
      <Header plan={plan} titleId={titleId} />
      <StaleRow plan={plan} />
      <div className={BODY}>
        {receipt ? (
          <div>
            <h2 id={verdictId} className={VERDICT}>
              Applied {receipt.applied} of {receipt.total}{' '}
              {nounFor(plan, receipt.total)}.
            </h2>
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
              {plan.mode === 'replay' ? ' · No external record changed.' : ''}
            </p>
          </div>
        ) : (
          <h2 id={verdictId} className={VERDICT}>
            {attentionLine(counts, plan.noun)}
          </h2>
        )}
        <Buckets plan={plan} counts={counts} onOpen={onOpen} />
        <CardAction
          plan={plan}
          counts={counts}
          progress={progress}
          onOpen={onOpen}
          onCommit={onCommit}
        />
      </div>
    </article>
  );
}
