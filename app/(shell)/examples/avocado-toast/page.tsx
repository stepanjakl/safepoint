import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import {
  RequestBubble,
  ResponseSection,
  ThreadPage,
} from '@/components/app-shell/thread/thread-page';
import { ProcessView } from '@/components/app-shell/process/process-view';
import { ThreadStep } from '@/components/app-shell/thread/thread-step';
import { SheetReadStep } from '@/components/sheet-process/sheet-read-step';
import { CalculateStep } from '@/components/sheet-process/calculate-step';
import { CheckStep } from '@/components/sheet-process/check-step';
import { EvaluationProvider } from '@/components/sheet-process/evaluation-context';
import { RulebookInForce } from '@/components/sheet-process/rulebook-in-force';
import { RulebookPanel } from '@/components/sheet-process/rulebook-panel';
import { isStale } from '@/lib/rulebook/decisions';
import { validateRulebook, validateSaved } from '@/lib/rulebook/validate';
import {
  activeRulebook,
  listDecisions,
  listDraftRecords,
  readDraftRecord,
} from '@/lib/rulebook/store';
import {
  BRUNCH_MAY_CHANGE,
  PENDING_STEPS,
  brunchProcess,
} from '@/lib/processes/avocado-toast/process';
import {
  loadSnapshot,
  PROCESS_ID,
} from '@/lib/processes/avocado-toast/snapshot';
import { GOOGLESHEETS_TOOLKIT_VERSION } from '@/lib/sheets/composio';

/*
  Brunch weekend, built in the open. Development only: the process is under
  construction and its steps call development-only routes. Each step is
  open while it waits on the reader to press its button.
*/
export default async function BrunchWeekendPage({
  searchParams,
}: PageProps<'/examples/avocado-toast'>) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const run = (await searchParams).run;
  const steps = brunchProcess.steps ?? [];
  const active = await activeRulebook(PROCESS_ID);
  // Each decision is marked stale against the captured read of the sheet.
  const captured = await loadSnapshot('captured').catch(() => null);
  // The latest saved draft opens with the page, so testing needs no clicks.
  const newest = (await listDraftRecords(PROCESS_ID))[0];
  const newestRecord = newest
    ? await readDraftRecord(PROCESS_ID, newest.file)
    : null;
  const latest =
    newest && newestRecord
      ? {
          file: newest.file,
          record: newestRecord,
          drift:
            newestRecord.draft.rulebook && captured
              ? validateSaved(
                  newestRecord.draft.rulebook,
                  captured.read,
                  BRUNCH_MAY_CHANGE,
                )
              : [],
        }
      : null;
  // An approved rulebook is checked again on every load: the sheet can change
  // under it, and checks are added after it was approved.
  const drift =
    active && captured
      ? validateRulebook(active.rulebook, captured.read, BRUNCH_MAY_CHANGE)
      : [];
  const decisions = (await listDecisions(PROCESS_ID)).map((decision) => ({
    ...decision,
    stale: captured ? isStale(decision, captured.read) : false,
  }));
  const boxes: Record<string, ReactNode> = {
    request: (
      <RequestBubble>
        <p>
          Plan the store&rsquo;s Brunch weekend from its Google Sheet. Show
          every source and every step, and let me run each one myself.
        </p>
      </RequestBubble>
    ),
    read: (
      <ResponseSection>
        <SheetReadStep toolkitVersion={GOOGLESHEETS_TOOLKIT_VERSION} />
      </ResponseSection>
    ),
    calculate: (
      <ResponseSection>
        <CalculateStep />
      </ResponseSection>
    ),
    check: (
      <ResponseSection>
        <CheckStep />
      </ResponseSection>
    ),
    rules: (
      <ResponseSection>
        <RulebookInForce active={active} drift={drift} />
      </ResponseSection>
    ),
  };

  return (
    <ProcessView
      process={brunchProcess}
      initialRunId={typeof run === 'string' ? run : 'build'}
      // The rulebook is this process's instructions: versioned policy a
      // person approves. Drafting it is not part of a run.
      policy={{
        label: 'Rulebook',
        version: active ? `v${active.version}` : 'none',
        content: (
          <RulebookPanel
            active={active}
            drift={drift}
            decisions={decisions}
            latest={latest}
          />
        ),
      }}
    >
      <ThreadPage label="Brunch weekend, built in the open">
        <EvaluationProvider>
          <ol className="thread">
            {steps.map((step) => (
              <ThreadStep
                key={step.id}
                step={step}
                latest={step.status === 'attention'}
              >
                {boxes[step.id] ?? (
                  <p className="text-dense text-muted">
                    {PENDING_STEPS[step.id]}
                  </p>
                )}
              </ThreadStep>
            ))}
          </ol>
        </EvaluationProvider>
      </ThreadPage>
    </ProcessView>
  );
}
