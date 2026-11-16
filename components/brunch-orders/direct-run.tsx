'use client';

import { useContext, useState } from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import {
  useRunSelection,
  type LiveRun,
  type RunSelection,
} from '@/components/app-shell/runs/run-selection';
import { ResponseSection } from '@/components/app-shell/thread/thread-page';
import { ThreadStep } from '@/components/app-shell/thread/thread-step';
import type { ProcessStep, ProcessSummary } from '@/lib/process/model';

import { SUBJECT } from '@/lib/processes/brunch-orders/process';

import { ApplyStep, type ApplyProgress } from './apply-step';
import {
  DiscardRun,
  InstructionsText,
  ReadStep,
  useRunRead,
  type RunRead,
} from './orders-run';
import { ProposeStep } from './propose/propose-step';
import type { ProposeProgress } from './propose/types';

/*
  A Brunch orders run with no rulebook, as a person would meet it: it reads
  the live sheet as it starts and the model proposes from the instructions
  straight after, so the first thing asked of anyone is the review. Nothing is
  written until they confirm it. The server keeps the run and its read, as it
  does the rulebook run's.
*/
export function DirectOrdersRun({ process }: { process: ProcessSummary }) {
  const selection = useRunSelection();
  const live = selection?.live;
  if (!live || !selection) return null;
  // How far each step has got is held for this run alone.
  return (
    <DirectThread
      key={live.run.id}
      process={process}
      live={live}
      selection={selection}
    />
  );
}

function DirectThread({
  process,
  live,
  selection,
}: {
  process: ProcessSummary;
  live: LiveRun;
  selection: RunSelection;
}) {
  const sheet = useContext(ProcessSheetActions);
  const { kept, text } = live;
  const [revealingReadId, setRevealingReadId] = useState<string | null>(null);
  const [taken, setTaken] = useState<RunRead | null>(null);
  const [proposed, setProposed] = useState<ProposeProgress>();
  const [applied, setApplied] = useState<ApplyProgress>();
  const saved = useRunRead(kept.readId);
  // The read just taken shows at once, and goes if the server will not keep
  // it as the run's; once kept, the server's summary is what is shown.
  const read = taken && taken.id !== kept.readId ? taken : saved.read;
  const readId = read?.id ?? kept.readId;
  const unfit = Boolean(read?.problems?.length);
  // The model proposes only on a read that fits, judged from the read's own
  // summary, and once the server has it as the run's: that is what a decision
  // is kept under.
  const canPropose = read !== undefined && !unfit && kept.readId === read.id;
  const decidedCount = proposed ? Object.keys(proposed.decisions).length : 0;
  const allDecided =
    proposed?.proposedAt != null &&
    proposed.total > 0 &&
    decidedCount === proposed.total;

  const status = (step: ProcessStep): ProcessStep['status'] => {
    switch (step.id) {
      case 'instructions':
        return 'complete';
      case 'read':
        return !readId ? 'running' : unfit ? 'blocked' : 'complete';
      case 'propose':
        return !canPropose
          ? 'pending'
          : !proposed?.proposedAt || proposed.running
            ? 'running'
            : allDecided
              ? 'complete'
              : 'attention';
      case 'apply':
        return !allDecided
          ? 'pending'
          : proposed.writes === 0 || applied?.status === 'verified'
            ? 'complete'
            : 'attention';
      default:
        return 'pending';
    }
  };
  const label = (step: ProcessStep) =>
    step.id === 'propose' && proposed?.proposedAt && !proposed.running
      ? allDecided
        ? 'All decided'
        : decidedCount
          ? `${decidedCount} of ${proposed.total} decided`
          : proposed.needYou
            ? `${proposed.total} proposed · ${proposed.needYou} need you`
            : `${proposed.total} proposed · not checked`
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
  // The furthest step a person can act on.
  const latest =
    !readId || revealingReadId === readId || unfit
      ? 'read'
      : !allDecided
        ? 'propose'
        : 'apply';
  const steps = (process.steps ?? []).map((step) => ({
    ...step,
    status: status(step),
    label: label(step),
  }));

  return (
    <>
      <ol className="thread">
        {steps.map((step) => (
          <ThreadStep
            key={step.id}
            step={step}
            latest={step.id === latest}
            headingAction={
              step.id === 'instructions' && sheet
                ? {
                    label: kept.instructions.version,
                    onPress: sheet.showInstructions,
                  }
                : undefined
            }
          >
            {step.id === 'instructions' ? (
              <InstructionsText text={text} />
            ) : step.id === 'read' ? (
              <ResponseSection>
                <ReadStep
                  automatic
                  read={read}
                  loadingRead={readId !== null && read === undefined}
                  readError={saved.error}
                  revealing={revealingReadId === read?.id}
                  onRevealed={() => setRevealingReadId(null)}
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
            ) : step.id === 'propose' && canPropose ? (
              <ResponseSection>
                <ProposeStep
                  subject={SUBJECT}
                  evaluation="model"
                  text={text}
                  readId={read.id}
                  run={{ process: 'brunch-orders-direct', runId: kept.id }}
                  onProgress={setProposed}
                />
              </ResponseSection>
            ) : step.id === 'apply' && allDecided && read ? (
              <ResponseSection>
                <ApplyStep
                  subject={SUBJECT}
                  run={{ process: 'brunch-orders-direct', runId: kept.id }}
                  decisions={proposed.decisions}
                  onProgress={setApplied}
                />
              </ResponseSection>
            ) : null}
          </ThreadStep>
        ))}
      </ol>
      {selection.recordError ? (
        <p role="alert" className="text-dense text-state-blocked mt-6">
          {selection.recordError}
        </p>
      ) : null}
      <div className="border-rule-faint mt-8 flex flex-wrap items-center gap-3 border-t pt-4">
        <DiscardRun selection={selection} id={kept.id} />
      </div>
    </>
  );
}
