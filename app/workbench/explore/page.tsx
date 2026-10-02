import { notFound } from 'next/navigation';

import { loadReviewedReplay } from '@/lib/promotion-release';
import {
  shiftProposalToReviewAt,
  shiftScenarioToReviewAt,
} from '@/lib/promotion-release/scenario-clock';
import { parseSkuParam } from '@/lib/review-presentation';

import { ReviewExplorer } from './review-explorer';

export const dynamic = 'force-dynamic';

export default async function ReviewExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const replay = loadReviewedReplay();
  const reviewAt = new Date().toISOString();
  const scenario = shiftScenarioToReviewAt(replay.scenario, reviewAt);
  const proposal = shiftProposalToReviewAt(
    replay.proposal,
    replay.scenario.promotionBrief.campaign.reviewAt,
    reviewAt,
  );

  return (
    <ReviewExplorer
      scenario={scenario}
      proposal={proposal}
      baselines={replay.lines.map((line) => ({
        sku: line.sku,
        eligibility: line.policyEvaluation.eligibility,
        findingCodes: line.policyEvaluation.findings.map(({ code }) => code),
        reviewedPolicy: line.policyEvaluation,
      }))}
      initialSku={parseSkuParam((await searchParams).sku) ?? 'ALD-0001'}
      reviewAt={reviewAt}
      keyConfigured={Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)}
    />
  );
}
