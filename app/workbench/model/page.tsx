import { notFound } from 'next/navigation';

import { buildLinePreview } from '@/lib/model-workbench/line';
import { loadReviewedReplay } from '@/lib/promotion-release';
import { shiftScenarioToReviewAt } from '@/lib/promotion-release/scenario-clock';
import { EXPECTED_SKUS } from '@/lib/promotion-release/schemas';
import { parseSkuParam } from '@/lib/review-presentation';

import { ModelWorkbench } from './workbench';

export const dynamic = 'force-dynamic';

export default async function ModelWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const replay = loadReviewedReplay();
  const reviewAt = new Date().toISOString();
  const scenario = shiftScenarioToReviewAt(replay.scenario, reviewAt);
  const previews = EXPECTED_SKUS.map((sku) => buildLinePreview(scenario, sku));
  const baselines = replay.lines.map(
    ({ sku, agentAssessment, policyEvaluation }) => ({
      sku,
      recommendation: agentAssessment.agentRecommendation,
      eligibility: policyEvaluation.eligibility,
      approvalConsequence:
        policyEvaluation.findings.find(
          ({ approvalConsequence }) => approvalConsequence === 'block',
        )?.approvalConsequence ??
        policyEvaluation.findings.find(
          ({ approvalConsequence }) =>
            approvalConsequence === 'individual_approval',
        )?.approvalConsequence ??
        'none',
      proposedPricePence:
        agentAssessment.proposed?.promotionalSellingPricePence ?? null,
      proposedTopUpUnits:
        agentAssessment.proposed?.recommendedTopUpQuantityUnits ?? null,
      findingCodes: policyEvaluation.findings.map(({ code }) => code),
    }),
  );

  return (
    <ModelWorkbench
      keyConfigured={Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)}
      reviewAt={reviewAt}
      previews={previews}
      baselines={baselines}
      initialSku={parseSkuParam((await searchParams).sku) ?? 'ALD-0001'}
    />
  );
}
