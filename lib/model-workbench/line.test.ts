import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from '@/lib/promotion-release';
import { evaluateLinePolicy } from '@/lib/promotion-release/line-policy';
import type { Sku } from '@/lib/promotion-release/schemas';

import {
  buildLinePreview,
  inspectLineSuggestion,
  type LineSuggestion,
} from './line';

const replay = loadReviewedReplay();

function reviewedSuggestion(sku: Sku): LineSuggestion {
  const line = replay.proposal.candidates.find(
    (candidate) => candidate.sku === sku,
  );
  if (!line) throw new Error(`Missing reviewed candidate ${sku}`);
  return {
    sku,
    recommendation: line.agentRecommendation,
    proposedPricePence: line.proposed?.promotionalSellingPricePence ?? null,
    proposedTopUpUnits: line.proposed?.recommendedTopUpQuantityUnits ?? null,
    rationale: line.rationale,
    uncertainties: line.uncertainties,
    evidenceRefs: line.evidenceRefs,
    selfReportedCertainty: 'medium',
    gateAssessments: line.gateAssessments,
    semanticActions: line.proposed
      ? [
          'update_promotion_record',
          'record_top_up_recommendation',
          'schedule_storefront_promotion',
          'queue_labels',
        ]
      : [],
  };
}

describe('single-line model review', () => {
  it('derives a compact input with the source shortfall and only related records', () => {
    const preview = buildLinePreview(replay.scenario, 'ALD-0001');
    expect(preview.input.fixtureVersion).toBe('1.0.2');
    expect(preview.input.supply).toMatchObject({
      availableBeforeLaunchUnits: 325,
      requiredUnits: 550,
      shortfallUnits: 225,
    });
    expect(preview.sources.at(0)?.value).toMatchObject({
      candidate: { sku: 'ALD-0001' },
    });
    expect(
      preview.input.notes.every(({ evidenceId }) =>
        evidenceId.startsWith('ev-'),
      ),
    ).toBe(true);
  });

  it('rejects an invented evidence ID and an invalid proposed value', () => {
    const preview = buildLinePreview(replay.scenario, 'ALD-0002');
    const valid = reviewedSuggestion('ALD-0002');
    expect(inspectLineSuggestion(valid, preview).issues).toEqual([]);
    expect(
      inspectLineSuggestion(
        { ...valid, evidenceRefs: ['ev-invented'] },
        preview,
      ).issues,
    ).toContain('Unknown evidence references: ev-invented.');
    expect(
      inspectLineSuggestion(
        { ...valid, proposedTopUpUnits: null },
        preview,
      ).issues.join(' '),
    ).toMatch(/need a price and top-up/);
    expect(
      inspectLineSuggestion(
        {
          ...valid,
          recommendation: 'hold',
          proposedTopUpUnits: null,
        },
        preview,
      ).issues.join(' '),
    ).toMatch(/need neither/);
  });

  it('requires seven distinct gates, per-gate provenance, and permitted semantic actions', () => {
    const preview = buildLinePreview(replay.scenario, 'ALD-0002');
    const valid = reviewedSuggestion('ALD-0002');
    expect(
      inspectLineSuggestion({ ...valid, gateAssessments: undefined }, preview)
        .suggestion,
    ).toBeNull();
    expect(
      inspectLineSuggestion(
        {
          ...valid,
          gateAssessments: valid.gateAssessments.map(
            () => valid.gateAssessments[0],
          ),
        },
        preview,
      ).suggestion,
    ).toBeNull();
    expect(
      inspectLineSuggestion(
        {
          ...valid,
          gateAssessments: valid.gateAssessments.map((gate) => ({
            ...gate,
            evidenceRefs: ['ev-invented'],
          })),
        },
        preview,
      ).issues,
    ).toContain('Unknown evidence references: ev-invented.');
    expect(
      inspectLineSuggestion(
        { ...valid, semanticActions: ['send_notification'] },
        preview,
      ).suggestion,
    ).toBeNull();
  });

  it('passes a fully supported reviewed line and blocks seeded release risks', () => {
    const safe = evaluateLinePolicy(
      replay.scenario,
      reviewedSuggestion('ALD-0002'),
    );
    expect(safe.verdict).toBe('passes_checks');

    const lateSupply = evaluateLinePolicy(
      replay.scenario,
      reviewedSuggestion('ALD-0001'),
    );
    expect(lateSupply.verdict).toBe('blocked');
    expect(
      lateSupply.checks
        .filter(({ status }) => status === 'block')
        .map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining(['supplier_allocation', 'supplier_timing']),
    );

    const missingSupply = evaluateLinePolicy(
      replay.scenario,
      reviewedSuggestion('ALD-0009'),
    );
    expect(missingSupply.checks).toContainEqual(
      expect.objectContaining({ code: 'source_availability', status: 'block' }),
    );

    const lowMargin = evaluateLinePolicy(
      replay.scenario,
      reviewedSuggestion('ALD-0025'),
    );
    expect(lowMargin.checks).toContainEqual(
      expect.objectContaining({ code: 'minimum_margin', status: 'block' }),
    );
    expect(lowMargin.marginPercent).toBe(9.2);

    const withdrawn = evaluateLinePolicy(
      replay.scenario,
      reviewedSuggestion('ALD-0027'),
    );
    expect(withdrawn.checks).toContainEqual(
      expect.objectContaining({ code: 'candidate_status', status: 'block' }),
    );
  });

  it('keeps eligible reviewed proposals free of current blocking checks', () => {
    const unexpectedBlocks = replay.lines
      .filter(
        ({ policyEvaluation }) => policyEvaluation.eligibility === 'eligible',
      )
      .flatMap(({ sku }) => {
        const checks = evaluateLinePolicy(
          replay.scenario,
          reviewedSuggestion(sku),
        ).checks;
        return checks
          .filter(({ status }) => status === 'block')
          .map(({ code }) => ({ sku, code }));
      });
    expect(unexpectedBlocks).toEqual([]);
  });

  it('supports both reviewed mozzarella alternatives with the corrected supply', () => {
    const preview = buildLinePreview(replay.scenario, 'ALD-0023');
    expect(preview.input.notes).toContainEqual(
      expect.objectContaining({
        trust: 'untrusted_evidence',
        claim: {
          kind: 'candidate_plan_options',
          options: [
            { promotionalSellingPricePence: 225, topUpUnits: 240 },
            { promotionalSellingPricePence: 235, topUpUnits: 320 },
          ],
        },
      }),
    );
    expect(preview.input.supply).toMatchObject({
      earlierOrderUnits: 150,
      availableBeforeLaunchUnits: 420,
      requiredUnits: 660,
      shortfallUnits: 240,
    });
    const reviewed = reviewedSuggestion('ALD-0023');
    for (const proposal of [
      reviewed,
      { ...reviewed, proposedPricePence: 235, proposedTopUpUnits: 320 },
    ]) {
      const checks = evaluateLinePolicy(replay.scenario, proposal).checks;
      expect(checks.filter(({ status }) => status === 'block')).toEqual([]);
    }
  });

  it('checks supplier multiples and surfaces staged channel differences', () => {
    expect(
      buildLinePreview(replay.scenario, 'ALD-0008').input.notes,
    ).toContainEqual(
      expect.objectContaining({
        trust: 'untrusted_evidence',
        claim: { kind: 'prior_top_up_request', requestedUnits: 430 },
      }),
    );
    const invalidQuantity = evaluateLinePolicy(replay.scenario, {
      ...reviewedSuggestion('ALD-0008'),
      proposedTopUpUnits: 430,
    });
    expect(invalidQuantity.checks).toContainEqual(
      expect.objectContaining({ code: 'order_terms', status: 'block' }),
    );

    const channelDifference = evaluateLinePolicy(
      replay.scenario,
      reviewedSuggestion('ALD-0013'),
    );
    expect(channelDifference.checks).toContainEqual(
      expect.objectContaining({ code: 'channel_staging', status: 'attention' }),
    );
  });
});
