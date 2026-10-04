import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import {
  RequestBubble,
  ResponseSection,
  ThreadPage,
} from '@/components/app-shell/thread/thread-page';
import { ProcessView } from '@/components/app-shell/process/process-view';
import { ThreadStep } from '@/components/app-shell/thread/thread-step';
import { RuleTrialStep } from '@/components/sheet-process/rule-trial-step';
import { SheetReadStep } from '@/components/sheet-process/sheet-read-step';
import { CalculateStep } from '@/components/sheet-process/calculate-step';
import { CheckStep } from '@/components/sheet-process/check-step';
import { EvaluationProvider } from '@/components/sheet-process/evaluation-context';
import { RulebookStep } from '@/components/sheet-process/rulebook-step';
import { activeRulebook } from '@/lib/rulebook/store';
import { CONFORMANCE_SECTIONS } from '@/lib/rulebook/cel-conformance';
import {
  PENDING_STEPS,
  brunchProcess,
} from '@/lib/processes/avocado-toast/process';
import { TRIAL_RULES } from '@/lib/processes/avocado-toast/rule-trial';
import { PROCESS_ID } from '@/lib/processes/avocado-toast/snapshot';
import { GOOGLESHEETS_TOOLKIT_VERSION } from '@/lib/sheets/composio';

/*
  Brunch weekend, built in the open. Development only: the process is under
  construction and its trial steps call development-only routes. Each step is
  open while it waits on the reader to press its button.
*/
export default async function BrunchWeekendPage({
  searchParams,
}: PageProps<'/examples/avocado-toast'>) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const run = (await searchParams).run;
  const steps = brunchProcess.steps ?? [];
  const active = await activeRulebook(PROCESS_ID);
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
        <RulebookStep
          active={active}
          trial={
            <RuleTrialStep
              ruleCount={TRIAL_RULES.length}
              sections={CONFORMANCE_SECTIONS}
            />
          }
        />
      </ResponseSection>
    ),
  };

  return (
    <ProcessView
      process={brunchProcess}
      initialRunId={typeof run === 'string' ? run : 'build'}
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
