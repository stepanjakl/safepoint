import { notFound } from 'next/navigation';

import { buildLinePreview } from '@/lib/model-workbench/line';
import { loadReviewedReplay } from '@/lib/promotion-release';
import { EXPECTED_SKUS } from '@/lib/promotion-release/schemas';

import { ModelWorkbench } from './workbench';

export default function ModelWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const replay = loadReviewedReplay();
  const previews = EXPECTED_SKUS.map((sku) =>
    buildLinePreview(replay.scenario, sku),
  );
  const baselines = replay.lines.map(
    ({ sku, agentAssessment, policyEvaluation }) => ({
      sku,
      recommendation: agentAssessment.agentRecommendation,
      eligibility: policyEvaluation.eligibility,
    }),
  );

  return (
    <ModelWorkbench
      keyConfigured={Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)}
      previews={previews}
      baselines={baselines}
    />
  );
}
