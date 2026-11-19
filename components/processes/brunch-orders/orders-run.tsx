'use client';

import { useContext, useRef, useState } from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import {
  useRunSelection,
  type LiveRun,
  type RunSelection,
} from '@/components/app-shell/runs/run-selection';
import { useFollowRun } from '@/components/app-shell/thread/follow-run';
import { ResponseSection } from '@/components/app-shell/thread/thread-page';
import { ThreadStep } from '@/components/app-shell/thread/thread-step';
import type { ProcessStep, ProcessSummary } from '@/lib/shell/model';
import { SHEET_USE, SUBJECT } from '@/lib/processes/brunch-orders/data';
import { COMING, ORDER_STEPS } from '@/lib/processes/brunch-orders/steps';
import { sourceById } from '@/lib/sources/model';

import { ApplyStep, type ApplyProgress } from '@/components/engine/apply-step';
import {
  CalculateStep,
  type CalculateProgress,
} from '@/components/engine/calculate-step';
import { ProposeStep } from '@/components/engine/propose/propose-step';
import type { ProposeProgress } from '@/components/engine/propose/types';
import {
  ReadStep,
  useRunRead,
  type RunRead,
} from '@/components/engine/read-step';
import {
  RulesStep,
  type RulesProgress,
} from '@/components/engine/rules/rules-step';
import {
  InstructionsText,
  RunNote,
  useRunDebug,
} from '@/components/engine/run-parts';

import { OrdersMockRun } from './orders-mock-run';

/*
  A Brunch orders run, step by step. It moves only when a person acts: the
  instructions it runs under, reading the sheet, then the rules. The later
  steps are listed with the phase that brings each one
  (docs/processes/brunch-orders/PLAN.md).
*/
export function OrdersRun({ process }: { process: ProcessSummary }) {
  const selection = useRunSelection();
  const live = selection?.live;
  if (!live || !selection) return null;
  if (live.mock)
    return (
      <OrdersMockRun key={live.run.id} live={live} selection={selection} />
    );
  // How far each step has got is held for this run alone.
  return (
    <OrdersThread
      key={live.run.id}
      process={process}
      live={live}
      selection={selection}
    />
  );
}

/*
  The run's read and pin are the server's (`runs.record`); how far the steps
  have got is not kept anywhere, but worked out again by each step as it
  opens, from what it summarises, and reported here for the headings.
*/
function OrdersThread({
  live,
  selection,
}: {
  process: ProcessSummary;
  live: LiveRun;
  selection: RunSelection;
}) {
  const sheet = useContext(ProcessSheetActions);
  const debug = useRunDebug();
  const { kept, text } = live;
  const version = kept.instructions.version;
  const [revealingReadId, setRevealingReadId] = useState<string | null>(null);
  const [taken, setTaken] = useState<RunRead | null>(null);
  const [rules, setRules] = useState<RulesProgress>();
  const [calculated, setCalculated] = useState<CalculateProgress>();
  const [proposed, setProposed] = useState<ProposeProgress>();
  const [applied, setApplied] = useState<ApplyProgress>();
  // Counts each move back to Calculate, which starts it afresh.
  const [moves, setMoves] = useState(0);
  const saved = useRunRead(kept.readId);
  // The read just taken shows at once, and goes if the server will not keep
  // it as the run's; once kept, the server's summary is what is shown.
  const read = taken && taken.id !== kept.readId ? taken : saved.read;
  const readId = read?.id ?? kept.readId;
  const rulesDone =
    rules !== undefined &&
    rules.intent &&
    rules.total > 0 &&
    rules.approved === rules.total;
  // Propose opens once Calculate has worked the values out, which the server
  // knows by the rulebook it pinned: the one a decision is kept under.
  const pinned = kept.rulebook;
  const canPropose = rulesDone && read !== undefined && pinned !== null;
  const decidedCount = proposed ? Object.keys(proposed.decisions).length : 0;
  const allDecided =
    proposed?.proposedAt != null &&
    proposed.total > 0 &&
    decidedCount === proposed.total;
  const status = (step: ProcessStep): ProcessStep['status'] =>
    step.id === 'instructions'
      ? 'complete'
      : step.id === 'read'
        ? readId
          ? 'complete'
          : 'attention'
        : step.id === 'rules'
          ? rules?.running
            ? 'running'
            : rulesDone
              ? 'complete'
              : readId
                ? 'attention'
                : 'pending'
          : step.id === 'calculate'
            ? !rulesDone
              ? 'pending'
              : calculated?.checked
                ? calculated.agreed === calculated.total
                  ? 'complete'
                  : 'attention'
                : !debug && calculated
                  ? 'complete'
                  : 'attention'
            : step.id === 'propose'
              ? !canPropose
                ? 'pending'
                : proposed?.running
                  ? 'running'
                  : allDecided
                    ? 'complete'
                    : 'attention'
              : step.id === 'apply'
                ? !allDecided
                  ? 'pending'
                  : proposed.writes === 0 || applied?.status === 'verified'
                    ? 'complete'
                    : 'attention'
                : 'pending';
  // The furthest step a person can act on.
  const latest =
    !readId || revealingReadId === readId
      ? 'read'
      : !rulesDone
        ? 'rules'
        : !canPropose
          ? 'calculate'
          : !allDecided
            ? 'propose'
            : 'apply';
  // What each step has come to, in its heading, where it has a state yet.
  const label = (step: ProcessStep) =>
    step.id === 'rules' && (rules?.running || rules?.total)
      ? rules.running
        ? rules.found
          ? `${rules.written} of ${rules.total} written`
          : 'Finding the rules'
        : rules.error && rules.written < rules.total
          ? `${rules.written} of ${rules.total} written`
          : rules.approved === rules.total
            ? 'All rules accepted'
            : `${rules.approved} of ${rules.total} accepted`
      : step.id === 'calculate' && rulesDone
        ? !calculated?.checked
          ? debug
            ? 'Not cross-checked'
            : calculated
              ? `${calculated.total} ${calculated.total === 1 ? 'value' : 'values'} worked out`
              : step.label
          : calculated.agreed === calculated.total
            ? `All ${calculated.total} match the model`
            : `${calculated.total - calculated.agreed} don’t match the model`
        : step.id === 'propose' && canPropose
          ? proposed?.running
            ? 'Proposing…'
            : !proposed?.proposedAt
              ? 'Not proposed'
              : allDecided
                ? 'All decided'
                : decidedCount
                  ? `${decidedCount} of ${proposed.total} decided`
                  : proposed.needYou
                    ? `${proposed.total} proposed · ${proposed.needYou} need you`
                    : `${proposed.total} proposed · all ready`
          : step.id === 'apply' && allDecided
            ? applied?.status === 'verified'
              ? 'Written and read back'
              : applied?.status === 'mismatch'
                ? 'Check the sheet'
                : applied?.status === 'pending'
                  ? 'Not confirmed yet'
                  : proposed.writes
                    ? `${proposed.writes} to write`
                    : 'Nothing to write'
            : step.label;
  const flag = (step: ProcessStep) =>
    step.id === 'rules' && !rules?.running && rules?.error
      ? `Stopped: ${rules.error.split(/[.:]/)[0]!.toLowerCase()}`
      : undefined;
  const progress = (step: ProcessStep) =>
    step.id === 'rules' && rules?.running && rules.found
      ? { at: rules.written, of: rules.total }
      : undefined;
  const steps = ORDER_STEPS.map((step) => ({
    ...step,
    status: status(step),
    label: label(step),
    flag: flag(step),
    progress: progress(step),
  }));
  // Pinning the rulebook is not waited for by the screen, which shows what
  // Calculate has worked out; Propose opens once the server has the pin.
  const pin = (progress: CalculateProgress) => {
    setCalculated(progress);
    if (progress.fingerprint !== kept.rulebook)
      selection
        .record(kept.id, { rulebook: progress.fingerprint })
        .catch(() => undefined);
  };
  const thread = useRef<HTMLOListElement>(null);
  useFollowRun(thread, undefined);

  return (
    <>
      <ol ref={thread} className="thread">
        {steps.map((step) => (
          <ThreadStep
            key={step.id}
            step={step}
            latest={step.id === latest}
            headingAction={
              step.id === 'instructions' && sheet
                ? {
                    label: version,
                    onPress: sheet.showInstructions,
                  }
                : undefined
            }
          >
            {step.id === 'instructions' ? (
              kept.additionalInstructions ? (
                <div className="grid gap-3">
                  <RunNote text={kept.additionalInstructions} />
                  <InstructionsText text={text} />
                </div>
              ) : (
                <InstructionsText text={text} />
              )
            ) : step.id === 'read' ? (
              <ResponseSection>
                <ReadStep
                  kind={sourceById(SHEET_USE.source)?.kind ?? 'google-sheets'}
                  read={read}
                  loadingRead={readId !== null && read === undefined}
                  readError={saved.error}
                  revealing={revealingReadId === read?.id}
                  onRevealed={() => setRevealingReadId(null)}
                  automatic={!debug}
                  onRead={(next) => {
                    setRevealingReadId(
                      matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? null
                        : next.id,
                    );
                    setTaken(next);
                    selection.record(kept.id, { readId: next.id }).catch(() => {
                      setTaken(null);
                      setRevealingReadId(null);
                    });
                  }}
                />
              </ResponseSection>
            ) : step.id === 'rules' ? (
              <ResponseSection>
                <RulesStep
                  subject={SUBJECT}
                  text={text}
                  version={version}
                  readId={readId}
                  onProgress={setRules}
                  debug={debug}
                />
              </ResponseSection>
            ) : step.id === 'calculate' && rulesDone && readId ? (
              <ResponseSection>
                <CalculateStep
                  key={moves}
                  text={text}
                  readId={readId}
                  calculatedOn={kept.rulebook}
                  onProgress={pin}
                  debug={debug}
                />
              </ResponseSection>
            ) : step.id === 'propose' && canPropose ? (
              <ResponseSection>
                <ProposeStep
                  subject={SUBJECT}
                  text={text}
                  readId={read.id}
                  rulebook={pinned}
                  run={{ process: 'brunch-orders', runId: kept.id }}
                  onProgress={setProposed}
                  debug={debug}
                  // Back to Calculate once the server has let go of the pin.
                  onMoveRules={() =>
                    void selection.record(kept.id, { rulebook: null }).then(
                      () => {
                        setCalculated(undefined);
                        setProposed(undefined);
                        setMoves((count) => count + 1);
                      },
                      () => undefined,
                    )
                  }
                />
              </ResponseSection>
            ) : step.id === 'apply' && allDecided && read && pinned ? (
              <ResponseSection>
                <ApplyStep
                  subject={SUBJECT}
                  run={{ process: 'brunch-orders', runId: kept.id }}
                  decisions={proposed.decisions}
                  onProgress={setApplied}
                />
              </ResponseSection>
            ) : (
              <p className="text-dense text-muted">{COMING[step.id]}</p>
            )}
          </ThreadStep>
        ))}
      </ol>
      {selection.recordError ? (
        <p role="alert" className="text-dense text-state-blocked mt-6">
          {selection.recordError}
        </p>
      ) : null}
    </>
  );
}
