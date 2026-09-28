'use client';

import type { ReactNode } from 'react';
import { styleDebug } from '@/lib/style-debug';
import { Button } from '@/components/ui/button';
import { Glyph, type GlyphName } from '@/components/ui/glyph';
import type { Tone } from '@/components/ui/status-label';
import { toneText } from '@/components/review/markers';
import {
  SystemDisc,
  SystemMeta,
} from '@/components/app-shell/system/system-parts';
import {
  DISPOSITION_LABELS,
  severityRank,
  type ReleasePlan,
} from '@/lib/review/plan-contract';
import {
  barSegments,
  evaluationCounts,
  nonEmptyDispositions,
} from '@/lib/review/plan-derivations';
import { byAttention, type SystemLink } from '@/lib/process/system-links';
import type { RunFacts, RunStage } from '@/lib/process/run-lifecycle';
import { cx } from '@/lib/cx';

/*
  The boxes the run's steps hang beneath, other than the request, the analysis
  and the release card. Most are not boxes at all: a list of what was read or
  written sits straight under its step's name, and only what the run concluded
  earns a face. Every row keeps one shape -- a mark, a name, a fact at the far
  end -- so a list here reads like a list in the card.
*/

const LIST = 'grid gap-1';
const ROW = 'text-dense flex min-h-8 items-center gap-2.5';
const ROW_NAME = 'text-primary min-w-0 flex-1 [overflow-wrap:anywhere]';
const NOTE = 'text-muted text-dense leading-normal text-pretty';
// A cell as wide as a system disc, so a glyph row and a disc row put their
// names on the same axis.
const MARK_CELL = 'grid size-7 flex-none place-items-center';

// What the run read. While it reads, only the files it has reached; after,
// all of them, the ones that were not current first.
export function SourcesRead({
  inputs,
  read,
}: {
  inputs: SystemLink[];
  read?: number;
}) {
  const shown =
    read === undefined ? [...inputs].sort(byAttention) : inputs.slice(0, read);
  return (
    <ul className={LIST}>
      {shown.map((link) => (
        <li key={link.id} className={ROW}>
          <SystemDisc link={link} />
          <span className={ROW_NAME}>{link.label}</span>
          <SystemMeta link={link} />
        </li>
      ))}
    </ul>
  );
}

/*
  The card's bar, being filled. The same segments in the same order the card
  will open with, over a track for what is still to come, so the bar the
  reviewer meets is one they have already watched arrive.
*/
export function EvaluationProgress({
  plan,
  evaluated,
}: {
  plan: ReleasePlan;
  evaluated: number;
}) {
  const total = plan.effects.length;
  const counts = evaluationCounts(plan.effects.slice(0, evaluated));
  const segments = barSegments(counts);
  const sofar = nonEmptyDispositions(counts)
    .map(
      (disposition) =>
        `${counts[disposition]} ${DISPOSITION_LABELS[disposition].toLowerCase()}`,
    )
    .join(' · ');
  return (
    <div className="grid gap-2.5">
      <div
        role="progressbar"
        aria-label="Candidates evaluated"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={evaluated}
        aria-valuetext={`${evaluated} of ${total}`}
        className="flex h-1.5 gap-0.5"
      >
        {segments.map((segment) => (
          <span
            key={segment.disposition}
            {...styleDebug({
              component: 'EvaluationProgress',
              part: 'segment',
              appearance: 'release-bucket-bar',
            })}
            className="release-bucket-bar rounded-full"
            data-severity={severityRank(segment.disposition)}
            style={{ flexGrow: segment.count }}
          />
        ))}
        <span
          className="bg-rule-faint rounded-full"
          style={{ flexGrow: total - evaluated }}
        />
      </div>
      {sofar ? <p className={NOTE}>So far: {sofar}</p> : null}
    </div>
  );
}

// The step that shows the rules decide, not the model: every line the agent
// would have released that deterministic policy held instead.
export function PolicyCheck({
  facts,
  running,
}: {
  facts: RunFacts;
  running: boolean;
}) {
  if (running) {
    return (
      <p className={NOTE}>
        Recalculating each proposal against the policy rules. The agent&rsquo;s
        recommendation cannot change the result.
      </p>
    );
  }
  if (facts.overruled.length === 0) {
    return <p className={NOTE}>Every proposal the agent made clears policy.</p>;
  }
  return (
    <div className="grid gap-2">
      <p className={NOTE}>
        The agent recommended releasing these. Policy held them.
      </p>
      <ul className={LIST}>
        {facts.overruled.map((line) => (
          <li key={line.id} className={ROW}>
            <span className={cx(MARK_CELL, toneText.blocked)}>
              <Glyph name="square" size={10} />
            </span>
            <span className={ROW_NAME}>{line.subject}</span>
            <span className="text-muted text-meta text-right">
              {line.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type WriteState =
  'waiting' | 'applying' | 'verified' | 'conflict' | 'simulated';

const WRITE_STATES: Record<
  WriteState,
  { glyph: GlyphName; tone: Tone; label: string }
> = {
  waiting: { glyph: 'minus', tone: 'unavailable', label: 'Waiting' },
  applying: { glyph: 'dotted', tone: 'advisory', label: 'Applying' },
  verified: { glyph: 'check', tone: 'verified', label: 'Verified' },
  conflict: {
    glyph: 'cross',
    tone: 'blocked',
    label: 'Changed since review · withheld',
  },
  simulated: { glyph: 'diamond', tone: 'simulated', label: 'Simulated' },
};

// Placeholder outcomes per destination, in the outputs' own order: the second
// destination is the one a person edited after review.
function writeState(
  stage: RunStage,
  index: number,
  output: SystemLink,
): WriteState {
  const done = output.mode === 'simulated' ? 'simulated' : 'verified';
  if (stage === 'committing')
    return index === 0 ? 'verified' : index === 1 ? 'applying' : 'waiting';
  if (stage === 'intervention' && index === 1) return 'conflict';
  return done;
}

/*
  What the commit wrote, one destination to a row, as the spec's log: rows are
  appended and each reads on its own. Controls stay outside the log, below it.
*/
export function CommitLog({
  outputs,
  stage,
  mode,
}: {
  outputs: SystemLink[];
  stage: RunStage;
  mode: ReleasePlan['mode'];
}) {
  const live = mode === 'live';
  return (
    <div className="grid gap-3">
      <ul role="log" aria-label="Commit progress" className={LIST}>
        {outputs.map((output, index) => {
          const state = WRITE_STATES[writeState(stage, index, output)];
          return (
            <li key={output.id} className={ROW}>
              <SystemDisc link={output} />
              <span className={ROW_NAME}>{output.label}</span>
              <span
                className={cx(
                  'text-meta inline-flex items-center gap-1.5 text-right',
                  toneText[state.tone],
                )}
              >
                <Glyph name={state.glyph} size={10} />
                {state.label}
              </span>
            </li>
          );
        })}
      </ul>
      {stage === 'intervention' ? (
        <StepAction
          live={live}
          label="Resolve conflict"
          replayNote="Resolving is not available in replay."
        >
          The other changes were applied. The withheld one waits for your
          decision.
        </StepAction>
      ) : null}
      {stage === 'committed' ? (
        <StepAction
          live={live}
          label="Reverse changes"
          variant="secondary"
          replayNote="Reversing is not available in replay."
        >
          Eligible changes can be reversed while their rows are unchanged.
        </StepAction>
      ) : null}
    </div>
  );
}

// Why the run stopped, and the one thing to do about it.
export function StoppedNotice({
  evaluated,
  total,
  mode,
}: {
  evaluated: number;
  total: number;
  mode: ReleasePlan['mode'];
}) {
  return (
    <div className="grid gap-3">
      <p className="text-body text-primary leading-normal text-pretty">
        Stopped after {evaluated} of {total} candidates. The supply position
        could not be read, so no plan was produced and nothing can be reviewed.
      </p>
      <StepAction
        live={mode === 'live'}
        label="Re-run"
        replayNote="Re-run is not available in replay."
      />
    </div>
  );
}

// Under replay no control names an operation the slice cannot perform, so the
// action becomes a line of text rather than a greyed button.
function StepAction({
  live,
  label,
  replayNote,
  variant = 'primary',
  children,
}: {
  live: boolean;
  label: string;
  replayNote: string;
  variant?: 'primary' | 'secondary';
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 [&>button]:min-h-11">
      {live ? <Button variant={variant}>{label}</Button> : null}
      <p className="text-muted text-meta min-w-0">
        {children}
        {children && !live ? ' ' : null}
        {live ? null : replayNote}
      </p>
    </div>
  );
}
