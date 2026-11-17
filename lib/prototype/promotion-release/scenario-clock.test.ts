import { describe, expect, it } from 'vitest';

import { evaluateLinePolicy } from './line-policy';
import { loadReviewedReplay } from './replay';
import {
  promotionReleasePlanSchema,
  scenarioEvidencePackSchema,
} from './schemas';
import {
  shiftProposalToReviewAt,
  shiftScenarioToReviewAt,
} from './scenario-clock';

describe('synthetic scenario clock', () => {
  it('moves structured dates together without changing the source fixture', () => {
    const replay = loadReviewedReplay();
    const original = replay.scenario.promotionBrief.campaign.reviewAt;
    const reviewAt = '2027-01-11T12:00:00.000Z';
    const shifted = shiftScenarioToReviewAt(replay.scenario, reviewAt);
    const shiftedProposal = shiftProposalToReviewAt(
      replay.proposal,
      original,
      reviewAt,
    );
    expect(shifted.promotionBrief.campaign.reviewAt).toBe(reviewAt);
    expect(replay.scenario.promotionBrief.campaign.reviewAt).toBe(original);
    expect(() => scenarioEvidencePackSchema.parse(shifted)).not.toThrow();
    expect(() =>
      promotionReleasePlanSchema.parse(shiftedProposal),
    ).not.toThrow();
    expect(
      Date.parse(shifted.promotionBrief.campaign.startsAt) -
        Date.parse(reviewAt),
    ).toBe(
      Date.parse(replay.scenario.promotionBrief.campaign.startsAt) -
        Date.parse(original),
    );
    expect(shifted.supplierTerms.records[0]?.topUpCutoffAt).not.toBe(
      replay.scenario.supplierTerms.records[0]?.topUpCutoffAt,
    );
    expect(shifted.channelState.records[0]?.channels[0]?.startsAt).not.toBe(
      replay.scenario.channelState.records[0]?.channels[0]?.startsAt,
    );
    for (const [index, movedLine] of shiftedProposal.candidates.entries()) {
      const originalLine = replay.proposal.candidates[index];
      if (!originalLine || originalLine.sku !== movedLine.sku)
        throw new Error('Proposal candidate order changed.');
      const proposal = {
        sku: movedLine.sku,
        proposedPricePence:
          movedLine.proposed?.promotionalSellingPricePence ?? null,
        proposedTopUpUnits:
          movedLine.proposed?.recommendedTopUpQuantityUnits ?? null,
        proposedStartsAt: movedLine.proposed?.startsAt,
        proposedEndsAt: movedLine.proposed?.endsAt,
      };
      expect(evaluateLinePolicy(shifted, proposal).verdict).toBe(
        evaluateLinePolicy(replay.scenario, {
          ...proposal,
          proposedStartsAt: originalLine.proposed?.startsAt,
          proposedEndsAt: originalLine.proposed?.endsAt,
        }).verdict,
      );
    }
  });

  it('rejects an invalid anchor', () => {
    expect(() =>
      shiftScenarioToReviewAt(loadReviewedReplay().scenario, 'not a date'),
    ).toThrow('Invalid scenario review time.');
  });
});
