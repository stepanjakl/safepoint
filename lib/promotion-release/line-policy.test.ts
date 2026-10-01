import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from './replay';
import { evaluateLinePolicy } from './line-policy';
import type { PromotionReleasePlan } from './schemas';

const replay = loadReviewedReplay();

function fromReplay(candidate: PromotionReleasePlan['candidates'][number]) {
  return {
    sku: candidate.sku,
    proposedPricePence:
      candidate.proposed?.promotionalSellingPricePence ?? null,
    proposedTopUpUnits:
      candidate.proposed?.recommendedTopUpQuantityUnits ?? null,
    proposedStartsAt: candidate.proposed?.startsAt ?? null,
    proposedEndsAt: candidate.proposed?.endsAt ?? null,
  };
}

describe('read-only line policy', () => {
  it('agrees with replay eligibility for all 27 reviewed candidates', () => {
    const disagreements = replay.proposal.candidates.flatMap((candidate) => {
      const expected = replay.policy.candidates.find(
        ({ sku }) => sku === candidate.sku,
      );
      if (!expected) throw new Error(`Missing policy replay ${candidate.sku}`);
      const actual = evaluateLinePolicy(replay.scenario, fromReplay(candidate));
      const eligible = actual.verdict !== 'blocked';
      return eligible === (expected.eligibility === 'eligible')
        ? []
        : [
            {
              sku: candidate.sku,
              verdict: actual.verdict,
              expected: expected.eligibility,
            },
          ];
    });
    expect(disagreements).toEqual([]);
  });

  it('checks both mozzarella alternatives and invalid quantities', () => {
    const candidate = replay.proposal.candidates.find(
      ({ sku }) => sku === 'ALD-0023',
    );
    if (!candidate) throw new Error('Missing mozzarella replay.');
    const reviewed = fromReplay(candidate);
    for (const proposal of [
      reviewed,
      { ...reviewed, proposedPricePence: 235, proposedTopUpUnits: 320 },
    ]) {
      const result = evaluateLinePolicy(replay.scenario, proposal);
      expect(result.verdict).not.toBe('blocked');
      expect(result.checks).toContainEqual(
        expect.objectContaining({ code: 'stock_coverage', status: 'pass' }),
      );
    }
    const invalid = evaluateLinePolicy(replay.scenario, {
      ...reviewed,
      proposedTopUpUnits: 280,
    });
    expect(invalid.checks).toContainEqual(
      expect.objectContaining({ code: 'order_terms', status: 'block' }),
    );
  });

  it('blocks stale source records using the full snapshot', () => {
    const scenario = structuredClone(replay.scenario);
    const record = scenario.cataloguePricebook.records.find(
      ({ sku }) => sku === 'ALD-0002',
    );
    if (!record) throw new Error('Missing catalogue record.');
    record.observedAt = '2026-08-01T00:00:00Z';
    const candidate = replay.proposal.candidates.find(
      ({ sku }) => sku === 'ALD-0002',
    );
    if (!candidate) throw new Error('Missing reviewed candidate.');
    const result = evaluateLinePolicy(scenario, fromReplay(candidate));
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        code: 'source_freshness',
        status: 'block',
        evidenceRefs: ['ev-catalogue-0002'],
      }),
    );
  });
});
