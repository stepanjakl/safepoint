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

export default async function ReviewPage({
  searchParams,
}: PageProps<'/examples/promotion'>) {
  const replay = loadReviewedReplay();
  const plan = presentPromotionPlan(replay);
  const inputs = presentPromotionInputs(replay);
  const params = await searchParams;
  const initialItemId = parseSkuParam(params.sku) ?? undefined;
  const recorded = promotionProcess.runs.find((run) => run.current);
  // A link into the review names an item of the recorded run, so it opens it.
  const initialRunId =
    (typeof params.run === 'string' ? params.run : null) ??
    (initialItemId ? (recorded?.id ?? null) : null);

  const facts = presentRunFacts(
    replay,
    plan,
    inputs,
    promotionProcess.outputs.length,
  );

  const request = (
    <p>Check the promotion release and show me what needs attention.</p>
  );

  return (
    <ProcessView
      process={promotionProcess}
      inputs={inputs}
      inputDetails={presentPromotionInputDetails(replay)}
      initialRunId={initialRunId}
      playable={{
        facts,
        plan,
        inputs,
        outputs: promotionProcess.outputs,
        analysis: promotionProcess.analysis,
        request,
      }}
    >
      <ThreadPage label="Run, Thu 4 Sep · 09:00">
        <RunThread
          stage="awaiting_review"
          facts={facts}
          plan={plan}
          inputs={inputs}
          outputs={promotionProcess.outputs}
          analysis={promotionProcess.analysis}
          request={request}
          requestLabel="Thu 4 Sep · 09:00"
          instructionsVersion={recorded?.instructionsVersion}
          initialItemId={initialItemId}
        />
      </ThreadPage>
    </ProcessView>
  );
}
