import { loadReviewedReplay } from '@/lib/prototype/promotion-release';
import {
  shiftProposalToReviewAt,
  shiftScenarioToReviewAt,
} from '@/lib/prototype/promotion-release/scenario-clock';
import { parseSkuParam } from '@/lib/prototype/review-presentation';

import { HistoryNote } from '../history-note';
import { ReviewExplorer } from './review-explorer';

export const dynamic = 'force-dynamic';

export default async function ReviewExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
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
      note={
        <HistoryNote made="2 October 2026">
          The review explorer of the promotion-release prototype: change a
          scenario&rsquo;s rules or a product&rsquo;s price and top-up and watch
          the review&rsquo;s checks and outcomes move, beside what the agent had
          proposed. The original could also ask a live model to review a
          product, extract claims from text and draft a rule, and ran an
          evaluation suite against it; that is not part of this copy, which
          works from the recorded replay alone and calls no model.
        </HistoryNote>
      }
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
      keyConfigured={false}
    />
  );
}
