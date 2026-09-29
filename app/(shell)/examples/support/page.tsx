import type { ReactNode } from 'react';
import {
  RequestBubble,
  ResponseSection,
  ThreadPage,
} from '@/components/app-shell/thread/thread-page';
import { InitialAnalysis } from '@/components/app-shell/thread/initial-analysis';
import { ProcessView } from '@/components/app-shell/process/process-view';
import { ThreadStep } from '@/components/app-shell/thread/thread-step';
import { ReplayReview } from '@/components/review/replay-review';
import { supportProcess } from '@/lib/process/placeholder-process';
import { supportPlan } from '@/lib/review/support-fixture';

export default async function SupportExamplePage({
  searchParams,
}: PageProps<'/examples/support'>) {
  const run = (await searchParams).run;
  const steps = supportProcess.steps ?? [];
  const boxes: Record<string, ReactNode> = {
    request: (
      <RequestBubble>
        <p>
          Review the proposed case handoffs before the next team takes over.
        </p>
      </RequestBubble>
    ),
    analysis: <InitialAnalysis analysis={supportProcess.analysis} />,
    review: (
      <ResponseSection>
        <ReplayReview plan={supportPlan} />
      </ResponseSection>
    ),
  };

  return (
    <ProcessView
      process={supportProcess}
      initialRunId={typeof run === 'string' ? run : null}
    >
      <ThreadPage label="Handoff, Mon 7 Sep · 09:00">
        <ol className="thread">
          {steps.map((step, index) => (
            <ThreadStep
              key={step.id}
              step={step}
              latest={index === steps.length - 1}
            >
              {boxes[step.id]}
            </ThreadStep>
          ))}
        </ol>
      </ThreadPage>
    </ProcessView>
  );
}
