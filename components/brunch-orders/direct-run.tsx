'use client';

import { useContext, useState } from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { useRunSelection } from '@/components/app-shell/runs/run-selection';
import { ResponseSection } from '@/components/app-shell/thread/thread-page';
import { ThreadStep } from '@/components/app-shell/thread/thread-step';
import { Button } from '@/components/ui/button';
import type { ProcessStep, ProcessSummary } from '@/lib/process/model';

import { SUBJECT } from '@/lib/processes/brunch-orders/process';

import { ApplyStep, type ApplyProgress } from './apply-step';
import { Instructions, ReadStep, WithText, type RunRead } from './orders-run';
import { ProposeStep, type ProposeProgress } from './propose-step';

/*
  A Brunch orders run with no rulebook, as a person would meet it: it reads
  the live sheet as it starts and the model proposes from the instructions
  straight after, so the first thing asked of anyone is the review. Nothing is
  written until they confirm it. Kept in this browser, as the rulebook run is.
*/
export function DirectOrdersRun({ process }: { process: ProcessSummary }) {
  const selection = useRunSelection();
  const sheet = useContext(ProcessSheetActions);
  const [revealingReadId, setRevealingReadId] = useState<string | null>(null);
  const live = selection?.live;
  if (!live || !selection) return null;
  const read = live.data.read as RunRead | undefined;
  const proposed = live.data.propose as ProposeProgress | undefined;
  const applied = live.data.apply as ApplyProgress | undefined;
  const update = (data: Record<string, unknown>) =>
    selection.updateLive(live.run.id, data);
  const unfit = Boolean(read?.problems?.length);
  const canPropose = read !== undefined && !unfit;
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
        return !read ? 'running' : unfit ? 'blocked' : 'complete';
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
            : proposed.writes
              ? `${proposed.writes} to write`
              : 'Nothing to write'
        : step.label;
  // The furthest step a person can act on.
  const latest =
    !read || revealingReadId === read.id || unfit
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
                    label: live.run.instructionsVersion,
                    onPress: sheet.showInstructions,
                  }
                : undefined
            }
          >
            {step.id === 'instructions' ? (
              <Instructions
                process={process}
                version={live.run.instructionsVersion}
              />
            ) : step.id === 'read' ? (
              <ResponseSection>
                <ReadStep
                  automatic
                  read={read}
                  revealing={revealingReadId === read?.id}
                  onRevealed={() => setRevealingReadId(null)}
                  onRead={(next) => {
                    setRevealingReadId(
                      matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? null
                        : next.id,
                    );
                    update({ read: next });
                  }}
                />
              </ResponseSection>
            ) : step.id === 'propose' && canPropose ? (
              <ResponseSection>
                <WithText
                  process={process}
                  version={live.run.instructionsVersion}
                >
                  {(text) => (
                    <ProposeStep
                      subject={SUBJECT}
                      evaluation="model"
                      text={text}
                      readId={read.id}
                      progress={proposed}
                      onProgress={(progress) => update({ propose: progress })}
                    />
                  )}
                </WithText>
              </ResponseSection>
            ) : step.id === 'apply' && allDecided && read ? (
              <ResponseSection>
                <WithText
                  process={process}
                  version={live.run.instructionsVersion}
                >
                  {(text) => (
                    <ApplyStep
                      subject={SUBJECT}
                      evaluation="model"
                      text={text}
                      readId={read.id}
                      rulebook={proposed.fingerprint}
                      proposedAt={proposed.proposedAt!}
                      decisions={proposed.decisions}
                      onProgress={(progress) => update({ apply: progress })}
                    />
                  )}
                </WithText>
              </ResponseSection>
            ) : null}
          </ThreadStep>
        ))}
      </ol>
      <div className="border-rule-faint mt-8 flex items-center gap-3 border-t pt-4">
        <Button onPress={() => selection.removeLive(live.run.id)}>
          Discard this run
        </Button>
      </div>
    </>
  );
}
