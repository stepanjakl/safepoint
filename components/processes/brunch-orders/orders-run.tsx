'use client';

import { useContext, useState } from 'react';

import { useRunProgress } from '@/components/app-shell/runs/run-progress';
import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { useRunRestoration } from '@/components/app-shell/runs/run-readiness';
import {
  useRunSelection,
  type LiveRun,
  type RunSelection,
} from '@/components/app-shell/runs/run-selection';
import { Thread } from '@/components/app-shell/thread/thread-arrivals';
import { ResponseSection } from '@/components/app-shell/thread/thread-page';
import { AlertBox } from '@/components/ui/alert-box';
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
  RunModelLabel,
  useRunDebug,
} from '@/components/engine/run-parts';

import { OrdersMockRun } from './orders-mock-run';

import { ordersAnnouncement, ordersRunStatus } from './orders-progress';

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
  const { restoring, finishRestoring } = useRunRestoration(kept.readId);
  const [rulesReady, setRulesReady] = useState(false);
  const [calculateReady, setCalculateReady] = useState(false);
  const [proposeReady, setProposeReady] = useState(false);
  const [applyReady, setApplyReady] = useState(false);
  const version = kept.instructions.version;
  const [revealingReadId, setRevealingReadId] = useState<string | null>(null);
  const [readFailure, setReadFailure] = useState<string | null>(null);
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
  const canCalculate = rulesDone && readId !== null;
  const canApply = allDecided && read !== undefined && pinned !== null;
  if (
    restoring &&
    (saved.read !== undefined || saved.error !== null) &&
    rulesReady &&
    (!canCalculate || calculateReady) &&
    (!canPropose || proposeReady) &&
    (!canApply || applyReady)
  )
    finishRestoring();
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
                  : applied?.status === 'mismatch'
                    ? 'blocked'
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
  const runStatus = ordersRunStatus({
    latest,
    proposalReady: Boolean(proposed?.proposedAt),
    noWrites: proposed?.writes === 0,
    application: applied?.status,
    stopped: Boolean(
      saved.error ||
      readFailure ||
      (latest === 'propose' && proposed?.failed) ||
      (latest === 'rules' && !rules?.running && rules?.error),
    ),
    held: Boolean(
      latest === 'calculate' &&
      calculated?.checked &&
      calculated.agreed < calculated.total,
    ),
  });
  useRunProgress(selection, kept.id, kept.status, restoring ? null : runStatus);

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
              : `${proposed.total} ${proposed.total === 1 ? 'item' : 'items'}`
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
      : step.id === 'propose' &&
          canPropose &&
          !proposed?.running &&
          proposed?.proposedAt &&
          proposed.needYou > 0
        ? `${proposed.needYou} need you`
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
    flagWhenClosed: step.id === 'propose',
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
  return (
    <>
      <Thread
        steps={steps}
        look="proposed"
        latestId={latest}
        restoring={restoring}
        announcement={ordersAnnouncement(
          latest,
          runStatus,
          proposed?.writes === 0,
        )}
        headingActions={{
          instructions: sheet
            ? {
                label: version,
                onPress:
                  version === sheet.currentVersion
                    ? sheet.showInstructions
                    : () => sheet.showVersion(version),
              }
            : undefined,
        }}
        boxes={Object.fromEntries(
          steps.map((step) => [
            step.id,
            step.id === 'instructions' ? (
              kept.additionalInstructions || kept.modelPlan ? (
                <div className="grid gap-3">
                  {kept.modelPlan ? (
                    <RunModelLabel plan={kept.modelPlan} />
                  ) : null}
                  {kept.additionalInstructions ? (
                    <RunNote text={kept.additionalInstructions} />
                  ) : null}
                  <InstructionsText text={text} />
                </div>
              ) : (
                <InstructionsText text={text} />
              )
            ) : step.id === 'read' ? (
              <ResponseSection>
                <ReadStep
                  kind={sourceById(SHEET_USE.source)?.kind ?? 'google-sheets'}
                  runId={kept.modelPlan ? kept.id : undefined}
                  read={read}
                  loadingRead={readId !== null && read === undefined}
                  readError={saved.error}
                  onFailure={setReadFailure}
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
                  runId={kept.id}
                  rulebook={pinned}
                  modelPlan={kept.modelPlan}
                  onProgress={setRules}
                  onReadyChange={restoring ? setRulesReady : undefined}
                  debug={debug}
                />
              </ResponseSection>
            ) : step.id === 'calculate' && canCalculate ? (
              <ResponseSection>
                <CalculateStep
                  key={moves}
                  text={text}
                  readId={readId}
                  calculatedOn={kept.rulebook}
                  runId={kept.id}
                  modelPlan={kept.modelPlan}
                  onProgress={pin}
                  onReadyChange={restoring ? setCalculateReady : undefined}
                  restoring={restoring}
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
                  modelPlan={kept.modelPlan}
                  onProgress={setProposed}
                  onReadyChange={restoring ? setProposeReady : undefined}
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
            ) : step.id === 'apply' && canApply ? (
              <ResponseSection>
                <ApplyStep
                  subject={SUBJECT}
                  run={{ process: 'brunch-orders', runId: kept.id }}
                  decisions={proposed.decisions}
                  onProgress={setApplied}
                  onReadyChange={restoring ? setApplyReady : undefined}
                />
              </ResponseSection>
            ) : (
              <p className="text-dense text-muted">{COMING[step.id]}</p>
            ),
          ]),
        )}
      />
      {selection.recordError ? (
        <AlertBox className="mt-6">{selection.recordError}</AlertBox>
      ) : null}
    </>
  );
}
