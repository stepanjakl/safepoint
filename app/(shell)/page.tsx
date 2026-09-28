import Link from 'next/link';
import { ThreadPage } from '@/components/app-shell/thread/thread-page';
import { ProcessView } from '@/components/app-shell/process/process-view';
import { RunThread } from '@/components/app-shell/thread/run-thread';
import { loadReviewedReplay } from '@/lib/promotion-release';
import { parseSkuParam } from '@/lib/review-presentation';
import { promotionProcess } from '@/lib/process/placeholder-process';
import { presentPromotionInputDetails } from '@/lib/process/input-details';
import { presentPromotionInputs } from '@/lib/process/system-links';
import { presentPromotionPlan } from '@/lib/review/promotion-adapter';
import { presentRunFacts } from '@/lib/process/run-lifecycle';

export default async function ReviewPage({ searchParams }: PageProps<'/'>) {
  const replay = loadReviewedReplay();
  const plan = presentPromotionPlan(replay);
  const inputs = presentPromotionInputs(replay);
  const initialItemId = parseSkuParam((await searchParams).sku) ?? undefined;

  const facts = presentRunFacts(
    replay,
    plan,
    inputs,
    promotionProcess.outputs.length,
  );

  return (
    <ProcessView
      process={promotionProcess}
      inputs={inputs}
      inputDetails={presentPromotionInputDetails(replay)}
    >
      <ThreadPage
        eyebrow="Alderton’s · Promotion operations"
        title="Fresh Food Weekend"
      >
        <RunThread
          stage="awaiting_review"
          facts={facts}
          plan={plan}
          inputs={inputs}
          outputs={promotionProcess.outputs}
          analysis={promotionProcess.analysis}
          request={
            <p>Check the promotion release and show me what needs attention.</p>
          }
          requestLabel="Thu 4 Sep · 09:00"
          initialItemId={initialItemId}
        />
        <div className="border-rule-faint text-muted text-meta mt-10 border-t pt-5 leading-relaxed max-sm:mt-7">
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
      <footer className="text-muted text-meta p-6 text-center">
        The agent proposes. You review. Safepoint applies only approved changes.
      </footer>
    </ProcessView>
  );
}
