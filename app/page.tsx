import Link from 'next/link';
import { AppShell } from '@/components/app-shell/app-shell';
import { ProcessView } from '@/components/app-shell/process-view';
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

  return (
    <AppShell current="/">
      <ProcessView process={promotionProcess} sources={sources}>
        <main id="main" tabIndex={-1} className="chat-main">
          <div className="chat-thread-heading">
            <p className="text-meta text-muted">
              Alderton’s · Promotion operations
            </p>
            <h1>Fresh Food Weekend</h1>
          </div>
          <div className="chat-request">
            <p>Check the promotion release and show me what needs attention.</p>
          </div>
          <section aria-label="Safepoint response" className="chat-response">
            <p className="chat-response-intro">
              The release review is ready. Here’s where things stand.
            </p>
            <ReplayReview plan={plan} initialItemId={initialItemId} />
            <p className="chat-caption">
              Recorded on {plan.evaluatedAt} · Fictional data
            </p>
          </section>
          <div className="chat-demo-note">
            <p>
              This conversation demonstrates how Safepoint can appear inside
              another application.
            </p>
            <Link href="/examples/support">
              Explore a support handoff <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </main>
        <footer className="chat-footer">
          The agent proposes. You review. Safepoint applies only approved
          changes.
        </footer>
      </ProcessView>
    </AppShell>
  );
}
