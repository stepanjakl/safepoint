import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import {
  RequestBubble,
  ResponseSection,
  ThreadPage,
} from '@/components/app-shell/thread-page';
import { InitialAnalysis } from '@/components/app-shell/initial-analysis';
import { ProcessView } from '@/components/app-shell/process-view';
import { ThreadStep } from '@/components/app-shell/thread-step';
import { ReplayReview } from '@/components/review/replay-review';
import { supportProcess } from '@/lib/process/placeholder-process';
import { supportPlan } from '@/lib/review/support-fixture';

export default function SupportExamplePage() {
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
      <ResponseSection caption="Synthetic example · Recorded checks · No cases moved or messages sent">
        <ReplayReview plan={supportPlan} />
      </ResponseSection>
    ),
  };

  return (
    <AppShell current="/examples/support">
      <ProcessView process={supportProcess}>
        <ThreadPage eyebrow="Support operations" title="Morning handoff">
          <ol className="thread">
            {supportProcess.steps.map((step) => (
              <ThreadStep key={step.id} step={step}>
                {boxes[step.id]}
              </ThreadStep>
            ))}
          </ol>
        </ThreadPage>
      </ProcessView>
    </AppShell>
  );
}
