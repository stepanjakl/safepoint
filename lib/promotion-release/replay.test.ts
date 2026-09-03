import cataloguePricebookJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/catalogue-pricebook.json';
import channelStateJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/channel-state.json';
import demandEvidenceJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/demand-evidence.json';
import operationalNotesJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/operational-notes.json';
import policyRulesJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/policy-rules.json';
import promotionBriefJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/promotion-brief.json';
import shortlistProvenanceJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/shortlist-provenance.json';
import supplierTermsJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/supplier-terms.json';
import supplyPositionJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/supply-position.json';
import policyEvaluationJson from '../../replays/promotion-release/aldertons-promotion-release-v1/policy-evaluation-replay.json';
import promotionReleasePlanJson from '../../replays/promotion-release/aldertons-promotion-release-v1/promotion-release-plan.json';
import evaluationOracleJson from '../../tests/fixtures/promotion-release/evaluation-oracle.json';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  deriveReplaySummary,
  loadReviewedReplay,
  parseReviewedReplayFixture,
} from './replay';
import {
  EXPECTED_SKUS,
  policyFindingCodeSchema,
  reviewOutcomeSchema,
  skuSchema,
} from './schemas';

const oracleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scenarioId: z.literal('aldertons-promotion-release-v1'),
  fixtureVersion: z.literal('1.0.0'),
  cases: z.array(
    z.strictObject({
      sku: skuSchema,
      expectedOutcome: reviewOutcomeSchema,
      expectedObservationCodes: z.array(policyFindingCodeSchema).min(1),
      acceptableRecommendations: z
        .array(z.enum(['release', 'adjust', 'hold', 'exclude']))
        .min(1),
      acceptableTopUpQuantityUnits: z
        .array(z.number().int().nonnegative())
        .optional(),
    }),
  ),
});

describe('the reviewed promotion-release replay', () => {
  it('loads all sources through the production boundary', () => {
    const replay = loadReviewedReplay();

    console.log(replay);

    expect(replay.lines.map(({ sku }) => sku)).toEqual(EXPECTED_SKUS);
    expect(replay.summary).toEqual({
      total: 27,
      ready: 17,
      needsAttention: 6,
      held: 2,
      excluded: 1,
      unverifiable: 1,
      potentiallyReleasable: 23,
      nonReleasable: 4,
    });
  });

  it('derives summary values from the supplied lines rather than constants', () => {
    const replay = loadReviewedReplay();
    const firstTwoLines = replay.lines.slice(0, 2);

    expect(deriveReplaySummary(firstTwoLines)).toEqual({
      total: 2,
      ready: 1,
      needsAttention: 0,
      held: 1,
      excluded: 0,
      unverifiable: 0,
      potentiallyReleasable: 1,
      nonReleasable: 1,
    });
  });

  it('keeps source facts, agent judgement, and replayed policy separate', () => {
    const replay = loadReviewedReplay();
    const salmon = findLine(replay.lines, 'ALD-0025');

    expect(salmon.catalogue.costPricePence).toBe(454);
    expect(salmon.agentAssessment.agentRecommendation).toBe('release');
    expect(salmon.policyEvaluation.eligibility).toBe('blocked');
    expect(salmon.outcome).toBe('held');
  });

  it('gives every candidate all seven gates exactly once', () => {
    const replay = loadReviewedReplay();
    const expectedGates = [
      'forecast',
      'inventory',
      'supplier',
      'financial',
      'logistics',
      'business_rules',
      'external_signals',
    ].sort();

    for (const line of replay.lines) {
      expect(
        line.agentAssessment.gateAssessments.map(({ gate }) => gate).sort(),
      ).toEqual(expectedGates);
      expect(
        line.policyEvaluation.gateObligations.map(({ gate }) => gate).sort(),
      ).toEqual(expectedGates);
    }
  });

  it('uses internally reproducible timing and seeded arithmetic', () => {
    const replay = loadReviewedReplay();
    const campaign = replay.scenario.promotionBrief.campaign;
    const deadlineMilliseconds =
      Date.parse(campaign.labelDeadlineAt) - Date.parse(campaign.reviewAt);
    expect(deadlineMilliseconds / (60 * 60 * 1_000)).toBe(21.25);

    const blueberries = findLine(replay.lines, 'ALD-0003');
    const blueberrySupply = requireAvailableSupply(blueberries.supply);
    const blueberryDemand = requireAvailableDemand(blueberries.demand);
    const blueberryShortfall = remainingShortfall({
      forecastUnits: blueberryDemand.promotionAdjustedForecastUnits,
      supply: blueberrySupply,
    });
    expect(blueberryDemand.upliftAlreadyIncluded).toBe(true);
    expect(
      roundToOrderConstraint({
        shortfallUnits: blueberryShortfall,
        minimumUnits: blueberries.supplier.minimumOrderQuantityUnits,
        multipleUnits: blueberries.supplier.orderMultipleUnits,
      }),
    ).toBe(blueberries.agentAssessment.proposed?.recommendedTopUpQuantityUnits);

    const grapes = findLine(replay.lines, 'ALD-0004');
    expect(
      remainingShortfall({
        forecastUnits: requireAvailableDemand(grapes.demand)
          .promotionAdjustedForecastUnits,
        supply: requireAvailableSupply(grapes.supply),
      }),
    ).toBe(0);
    expect(grapes.agentAssessment.proposed?.recommendedTopUpQuantityUnits).toBe(
      0,
    );

    const avocados = findLine(replay.lines, 'ALD-0008');
    const avocadoShortfall = remainingShortfall({
      forecastUnits: requireAvailableDemand(avocados.demand)
        .promotionAdjustedForecastUnits,
      supply: requireAvailableSupply(avocados.supply),
    });
    expect(avocadoShortfall).toBe(430);
    expect(
      roundToOrderConstraint({
        shortfallUnits: avocadoShortfall,
        minimumUnits: avocados.supplier.minimumOrderQuantityUnits,
        multipleUnits: avocados.supplier.orderMultipleUnits,
      }),
    ).toBe(480);

    const salmon = findLine(replay.lines, 'ALD-0025');
    const salmonProposal = requireProposal(salmon);
    const confirmedFunding =
      salmon.supplier.fundingStatus === 'confirmed'
        ? salmon.supplier.fundingPencePerUnit
        : 0;
    const marginPercent =
      ((salmonProposal.promotionalSellingPricePence -
        salmon.catalogue.costPricePence +
        confirmedFunding) /
        salmonProposal.promotionalSellingPricePence) *
      100;
    expect(marginPercent).toBeCloseTo(9.2);
    expect(marginPercent).toBeLessThan(
      replay.scenario.policyRules.minimumMarginPercent,
    );

    const plantSausages = findLine(replay.lines, 'ALD-0026');
    const plantSausageProposal = requireProposal(plantSausages);
    const priceReductionPercent =
      ((plantSausages.catalogue.regularSellingPricePence -
        plantSausageProposal.promotionalSellingPricePence) /
        plantSausages.catalogue.regularSellingPricePence) *
      100;
    expect(priceReductionPercent).toBeGreaterThan(
      replay.scenario.policyRules.individualApprovalPriceChangePercent,
    );
  });

  it('keeps every releasable proposal inside price, quantity, and allocation constraints', () => {
    const replay = loadReviewedReplay();

    for (const line of replay.lines) {
      const proposal = line.agentAssessment.proposed;
      if (!proposal || line.policyEvaluation.eligibility === 'blocked')
        continue;

      expect(proposal.promotionalSellingPricePence).toBeLessThan(
        line.catalogue.regularSellingPricePence,
      );
      expect(Date.parse(proposal.startsAt)).toBeLessThan(
        Date.parse(proposal.endsAt),
      );

      if (proposal.recommendedTopUpQuantityUnits > 0) {
        expect(proposal.recommendedTopUpQuantityUnits).toBeGreaterThanOrEqual(
          line.supplier.minimumOrderQuantityUnits,
        );
        expect(
          proposal.recommendedTopUpQuantityUnits %
            line.supplier.orderMultipleUnits,
        ).toBe(0);
        expect(proposal.recommendedTopUpQuantityUnits).toBeLessThanOrEqual(
          line.supplier.confirmedAdditionalAllocationUnits,
        );
      }

      const confirmedFunding =
        line.supplier.fundingStatus === 'confirmed'
          ? line.supplier.fundingPencePerUnit
          : 0;
      const marginPercent =
        ((proposal.promotionalSellingPricePence -
          line.catalogue.costPricePence +
          confirmedFunding) /
          proposal.promotionalSellingPricePence) *
        100;
      expect(marginPercent).toBeGreaterThanOrEqual(
        replay.scenario.policyRules.minimumMarginPercent,
      );
    }
  });

  it('matches every seeded case in the test-only oracle', () => {
    const replay = loadReviewedReplay();
    const oracle = oracleSchema.parse(evaluationOracleJson);

    for (const oracleCase of oracle.cases) {
      const line = findLine(replay.lines, oracleCase.sku);
      expect(line.outcome).toBe(oracleCase.expectedOutcome);
      expect(oracleCase.acceptableRecommendations).toContain(
        line.agentAssessment.agentRecommendation,
      );
      expect(line.policyEvaluation.findings.map(({ code }) => code)).toEqual(
        expect.arrayContaining(oracleCase.expectedObservationCodes),
      );

      if (oracleCase.acceptableTopUpQuantityUnits) {
        expect(oracleCase.acceptableTopUpQuantityUnits).toContain(
          line.agentAssessment.proposed?.recommendedTopUpQuantityUnits,
        );
      }
    }
  });
});

describe('invalid replay fixtures', () => {
  it('rejects a missing candidate', () => {
    const fixture = mutableRawFixture();
    fixture.scenario.shortlistProvenance.records.pop();
    expect(() => parseReviewedReplayFixture(fixture)).toThrow();
  });

  it('rejects a duplicate candidate', () => {
    const fixture = mutableRawFixture();
    const firstCandidate = fixture.proposal.candidates.at(0);
    if (!firstCandidate)
      throw new Error('The fixture must contain candidates.');
    fixture.proposal.candidates.splice(1, 1, firstCandidate);
    expect(() => parseReviewedReplayFixture(fixture)).toThrow();
  });

  it('rejects an invented candidate', () => {
    const fixture = mutableRawFixture();
    const firstCandidate = fixture.proposal.candidates.at(0);
    if (!firstCandidate)
      throw new Error('The fixture must contain candidates.');
    firstCandidate.sku = 'ALD-9999';
    expect(() => parseReviewedReplayFixture(fixture)).toThrow();
  });

  it('rejects an unknown evidence reference', () => {
    const fixture = mutableRawFixture();
    fixture.proposal.evidenceRefs.push('ev-does-not-exist');
    expect(() => parseReviewedReplayFixture(fixture)).toThrow(
      'Unknown evidence reference',
    );
  });

  it('rejects malformed time and contradictory proposal state', () => {
    const badTime = mutableRawFixture();
    badTime.proposal.generatedAt = 'tomorrow';
    expect(() => parseReviewedReplayFixture(badTime)).toThrow();

    const contradictory = mutableRawFixture();
    const releaseCandidate = contradictory.proposal.candidates.find(
      ({ agentRecommendation }) => agentRecommendation === 'release',
    );
    if (!releaseCandidate)
      throw new Error('The fixture must contain a release.');
    releaseCandidate.proposed = null;
    expect(() => parseReviewedReplayFixture(contradictory)).toThrow();
  });

  it('rejects unsupported semantic actions', () => {
    const fixture = mutableRawFixture();
    const proposedCandidate = fixture.proposal.candidates.find(
      ({ proposed }) => proposed !== null,
    );
    if (!proposedCandidate?.proposed) {
      throw new Error('The fixture must contain a proposed release.');
    }
    proposedCandidate.proposed.semanticActions.push('delete_product');
    expect(() => parseReviewedReplayFixture(fixture)).toThrow();
  });

  it('rejects numeric values attached to unavailable evidence', () => {
    const fixture = mutableRawFixture();
    const unavailable = fixture.scenario.supplyPosition.records.find(
      ({ sku }) => sku === 'ALD-0009',
    );
    if (!unavailable) throw new Error('The fixture must contain ALD-0009.');
    Object.assign(unavailable, { stockOnHandUnits: 0 });
    expect(() => parseReviewedReplayFixture(fixture)).toThrow();
  });
});

function mutableRawFixture() {
  return structuredClone({
    scenario: {
      promotionBrief: promotionBriefJson,
      shortlistProvenance: shortlistProvenanceJson,
      cataloguePricebook: cataloguePricebookJson,
      demandEvidence: demandEvidenceJson,
      supplyPosition: supplyPositionJson,
      supplierTerms: supplierTermsJson,
      operationalNotes: operationalNotesJson,
      channelState: channelStateJson,
      policyRules: policyRulesJson,
    },
    proposal: promotionReleasePlanJson,
    policy: policyEvaluationJson,
  });
}

function findLine(
  lines: ReturnType<typeof loadReviewedReplay>['lines'],
  sku: (typeof EXPECTED_SKUS)[number],
) {
  const line = lines.find((candidate) => candidate.sku === sku);
  if (!line) throw new Error(`Missing replay line ${sku}.`);
  return line;
}

function requireAvailableSupply(
  supply: ReturnType<typeof loadReviewedReplay>['lines'][number]['supply'],
) {
  if (supply.kind !== 'available') {
    throw new Error(`Supply evidence for ${supply.sku} is unavailable.`);
  }
  return supply;
}

function requireAvailableDemand(
  demand: ReturnType<typeof loadReviewedReplay>['lines'][number]['demand'],
) {
  if (demand.kind !== 'available') {
    throw new Error(`Demand evidence for ${demand.sku} is unavailable.`);
  }
  return demand;
}

function requireProposal(line: ReturnType<typeof findLine>) {
  const proposal = line.agentAssessment.proposed;
  if (!proposal) throw new Error(`Line ${line.sku} has no proposal.`);
  return proposal;
}

function remainingShortfall({
  forecastUnits,
  supply,
}: {
  forecastUnits: number;
  supply: ReturnType<typeof requireAvailableSupply>;
}) {
  const availableUnits =
    supply.stockOnHandUnits -
    supply.reservedUnits +
    supply.confirmedInboundBeforeLaunchUnits +
    supply.earlierPromotionOrderUnits +
    supply.openTopUpAmendmentUnits;
  return Math.max(0, forecastUnits + supply.safetyStockUnits - availableUnits);
}

function roundToOrderConstraint({
  shortfallUnits,
  minimumUnits,
  multipleUnits,
}: {
  shortfallUnits: number;
  minimumUnits: number;
  multipleUnits: number;
}) {
  if (shortfallUnits === 0) return 0;
  return Math.max(
    minimumUnits,
    Math.ceil(shortfallUnits / multipleUnits) * multipleUnits,
  );
}
