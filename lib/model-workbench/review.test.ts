import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from '@/lib/promotion-release';
import type { Sku } from '@/lib/promotion-release/schemas';

import type { LineSuggestion } from './line';
import { reviewLineSuggestion } from './review';

const replay = loadReviewedReplay();

function recordedSuggestion(sku: Sku): LineSuggestion {
  const candidate = replay.proposal.candidates.find((line) => line.sku === sku);
  if (!candidate) throw new Error(`Missing candidate ${sku}`);
  return {
    sku,
    recommendation: candidate.agentRecommendation,
    proposedPricePence:
      candidate.proposed?.promotionalSellingPricePence ?? null,
    proposedTopUpUnits:
      candidate.proposed?.recommendedTopUpQuantityUnits ?? null,
    rationale: candidate.rationale,
    uncertainties: candidate.uncertainties,
    evidenceRefs: candidate.evidenceRefs,
    selfReportedCertainty: 'medium',
    gateAssessments: candidate.gateAssessments,
    semanticActions: candidate.proposed
      ? [
          'update_promotion_record',
          'record_top_up_recommendation',
          'schedule_storefront_promotion',
          'queue_labels',
        ]
      : [],
  };
}

describe('model proposal review', () => {
  it('requires individual approval for the recorded large price change', () => {
    const review = reviewLineSuggestion(
      replay.scenario,
      recordedSuggestion('ALD-0010'),
    );
    expect(review.policy.verdict).toBe('review_required');
    expect(review.findingCodes).toContain('large_price_change');
    expect(review.treatment).toBe('individual_approval');
    expect(review.gateObligations).toHaveLength(7);
  });

  it('lets a blocking check override a release suggestion and price warning', () => {
    const review = reviewLineSuggestion(replay.scenario, {
      ...recordedSuggestion('ALD-0010'),
      proposedPricePence: 60,
    });
    expect(review.policy.verdict).toBe('blocked');
    expect(review.findingCodes).toContain('large_price_change');
    expect(review.treatment).toBe('blocked');
  });

  it('separates a clean proposal, an attention check, and no release proposal', () => {
    expect(
      reviewLineSuggestion(replay.scenario, recordedSuggestion('ALD-0002'))
        .treatment,
    ).toBe('passes_checks');
    expect(
      reviewLineSuggestion(replay.scenario, recordedSuggestion('ALD-0013'))
        .treatment,
    ).toBe('individual_approval');
    const withheld = reviewLineSuggestion(
      replay.scenario,
      recordedSuggestion('ALD-0027'),
    );
    expect(withheld.policy.basis).toBe('brief_baseline');
    expect(withheld.treatment).toBe('no_release_proposal');
  });
});
