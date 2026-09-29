'use client';

// Deep import: Blode's barrel is the whole icon library.
import SparklesTwoFilled from 'blode-icons-react/icons/sparkles-two-filled';
import { styleDebug } from '@/lib/style-debug';
import { useContext, useId } from 'react';
import { AssistantContext } from '@/components/app-shell/assistant/assistant-state';
import { Button } from '@/components/ui/button';
import { Glyph } from '@/components/ui/glyph';
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
import {
  Buckets,
  CARD_HEAD,
  nounFor,
  type OpenReview,
} from './release-buckets';

/*
  Class sets the card reuses. Named here rather than repeated because each is
  applied in two or three places. The card's own inline-size container is what
  the narrow rules here and in release-buckets.tsx answer to.
*/

// One step above the pane it sits on: the first thing found, not another panel
// on the same plane. `@container` makes the card the query root for its zones.
// No header: the step names the review and the page names the run, so the
// card opens on what the batch needs.
const CARD =
  'control-face surface-floating @container overflow-clip rounded-shell';

// The verdict leads the card, at the size of a panel's title rather than a
// page's: it sits inside a step, inside a run.
const VERDICT = 'text-title [font-weight:550] text-pretty';
const RECEIPT_NOTE = 'text-muted mt-1 text-meta';

// First in the card, because it invalidates everything below it, counts
// included.
function StaleRow({ plan }: { plan: ReleasePlan }) {
  if (plan.status.kind !== 'stale') return null;
  const n = plan.status.changedEffectIds.length;
  return (
    <p
      className="text-state-caution text-dense mb-3 flex items-center gap-1.5"
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

// The footer: the card's actions, under the rows' last rule.
const ACTION_ROW = 'flex flex-wrap items-center gap-2 px-6 py-4 @max-card:px-4';
const ACTION_NOTE = 'text-muted text-meta ml-2 min-w-0';

// A button's icon after its label and a shade under it, as the run tallies
// quiet the words beside their counts.
const BUTTON_ICON = 'opacity-75';

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
    <Button variant={variant} pill onPress={() => onOpen()}>
      {label}
      <span aria-hidden="true" className={BUTTON_ICON}>
        ↗
      </span>
    </Button>
  );
}

// A question about the batch, never a decision on it: the assistant opens with
// it written. Absent where there is no shell to hold an assistant.
function AskButton() {
  const assistant = useContext(AssistantContext);
  if (!assistant) return null;
  return (
    <Button
      pill
      onPress={() =>
        assistant.ask('What needs my attention in this release, and why?')
      }
    >
      Ask about this release
      <SparklesTwoFilled
        aria-hidden
        size={14}
        className={cx(BUTTON_ICON, 'flex-none')}
      />
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
            <Button variant="primary" pill onPress={onCommit}>
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
        <AskButton />
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
        <AskButton />
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
      <AskButton />
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
  const verdictId = useId();
  const state = planState(plan);
  const counts = evaluationCounts(plan.effects);
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
        aria-labelledby={verdictId}
      >
        <div className={CARD_HEAD}>
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
        aria-labelledby={verdictId}
      >
        <div className={CARD_HEAD}>
          <h2
            id={verdictId}
            className={cx(VERDICT, 'flex items-baseline gap-2.5')}
          >
            <span className="text-state-verified shrink-0 self-center">
              <Glyph name="check" size={16} />
            </span>
            <span>{attentionLine(counts, plan.noun)}</span>
          </h2>
        </div>
        <CardAction
          plan={plan}
          counts={counts}
          progress={progress}
          onOpen={onOpen}
          onCommit={onCommit}
        />
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
      aria-labelledby={verdictId}
    >
      <Buckets
        plan={plan}
        counts={counts}
        onOpen={onOpen}
        lead={
          <>
            <StaleRow plan={plan} />
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
                  {plan.mode === 'replay'
                    ? ' · No external record changed.'
                    : ''}
                </p>
              </div>
            ) : (
              // Nothing can go out: the verdict itself carries the blocked tone.
              <h2
                id={verdictId}
                className={cx(VERDICT, blockedOnly && 'text-state-blocked')}
              >
                {attentionLine(counts, plan.noun)}
              </h2>
            )}
          </>
        }
      />
      <CardAction
        plan={plan}
        counts={counts}
        progress={progress}
        onOpen={onOpen}
        onCommit={onCommit}
      />
    </article>
  );
}
