import type { ReactNode } from 'react';
import Link from 'next/link';
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
import { loadReviewedReplay } from '@/lib/promotion-release';
import { parseSkuParam } from '@/lib/review-presentation';
import { promotionProcess } from '@/lib/process/placeholder-process';
import { presentPromotionSources } from '@/lib/process/system-links';
import { presentPromotionPlan } from '@/lib/review/promotion-adapter';

export default async function ReviewPage({ searchParams }: PageProps<'/'>) {
  const replay = loadReviewedReplay();
  const plan = presentPromotionPlan(replay);
  const sources = presentPromotionSources(replay);
  const initialItemId = parseSkuParam((await searchParams).sku) ?? undefined;

  // Order comes from the process; the box for each step comes from here. A new
  // step is a change to the placeholder data plus one entry in this map.
  const boxes: Record<string, ReactNode> = {
    request: (
      <RequestBubble>
        <p>Check the promotion release and show me what needs attention.</p>
      </RequestBubble>
    ),
    analysis: <InitialAnalysis analysis={promotionProcess.analysis} />,
    review: (
      <ResponseSection
        caption={`Recorded on ${plan.evaluatedAt} · Fictional data`}
      >
        <ReplayReview plan={plan} initialItemId={initialItemId} />
      </ResponseSection>
    ),
  };

  return (
    <AppShell current="/">
      <ProcessView process={promotionProcess} sources={sources}>
        <ThreadPage
          eyebrow="Alderton’s · Promotion operations"
          title="Fresh Food Weekend"
        >
          <ol className="thread">
            {promotionProcess.steps.map((step) => (
              <ThreadStep key={step.id} step={step}>
                {boxes[step.id]}
              </ThreadStep>
            ))}
          </ol>
          <div className="border-rule-faint text-muted mt-10 border-t pt-5 text-[12px] leading-[1.6] max-sm:mt-7">
            <p>
              This conversation demonstrates how Safepoint can appear inside
              another application.
            </p>
            <Link
              href="/examples/support"
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Explore a support handoff <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </ThreadPage>
        <footer className="text-muted p-6 text-center text-[12px]">
          The agent proposes. You review. Safepoint applies only approved
          changes.
        </footer>
      </ProcessView>
    </AppShell>
  );
}
