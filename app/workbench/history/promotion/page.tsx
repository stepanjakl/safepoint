import Link from 'next/link';

import { ProcessView } from '@/components/app-shell/process/process-view';
import { ThreadPage } from '@/components/app-shell/thread/thread-page';
import { RunThread } from '@/components/prototype/promotion/run-thread';
import { loadReviewedReplay } from '@/lib/prototype/promotion-release';
import { presentPromotionInputDetails } from '@/lib/prototype/promotion/input-details';
import { promotionProcess } from '@/lib/prototype/promotion/placeholder/placeholder-process';
import { presentRunFacts } from '@/lib/prototype/promotion/placeholder/run-lifecycle';
import { presentPromotionInputs } from '@/lib/prototype/promotion/system-links';
import { presentPromotionPlan } from '@/lib/prototype/review/promotion-adapter';
import { parseSkuParam } from '@/lib/prototype/review-presentation';
import { runStamp } from '@/lib/shell/run-time';

import { HistoryNote } from '../history-note';
import { PromotionInputs } from './promotion-inputs';
import { OutputsList } from './outputs-list';

export default async function PromotionRunPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const replay = loadReviewedReplay();
  const plan = presentPromotionPlan(replay);
  const inputs = presentPromotionInputs(replay);
  const params = await searchParams;
  const initialItemId = parseSkuParam(params.sku) ?? undefined;
  const recorded = promotionProcess.runs.find((run) => run.current);
  // A link into the review names an item of the recorded run, so it opens it.
  const initialRunId =
    (typeof params.run === 'string' ? params.run : null) ??
    recorded?.id ??
    null;

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
      inputsPanel={
        <PromotionInputs
          inputs={inputs}
          details={presentPromotionInputDetails(replay)}
          runLabel={recorded ? runStamp(recorded.startedAt) : undefined}
        />
      }
      outputsPanel={<OutputsList outputs={promotionProcess.outputs} />}
      initialRunId={initialRunId}
    >
      <ThreadPage label="Run, Thu 4 Sep · 09:00">
        <div className="mb-8 grid gap-2">
          <HistoryNote made="3 September 2026">
            The original product idea: a promotion-release review, shown in the
            shell as a run from a recorded replay. An AI agent proposed prices
            and supplier top-ups for 27 products of a fictional grocer&rsquo;s
            weekend promotion; independent checks found what needed a person,
            and the review asked for each decision. It first ran as a standalone
            replay review on 3 September and moved into the shell on 30
            September. The run is a recording: nothing is started, written or
            asked of a model, and it is not the Brunch orders process the
            product became.
          </HistoryNote>
          <Link
            href="/workbench"
            className="text-meta text-muted w-fit underline underline-offset-4"
          >
            Back to the workbench
          </Link>
        </div>
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
