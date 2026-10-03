import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from '@/lib/promotion-release/replay';
import {
  captureLocalReview,
  evaluateLabLine,
} from '@/lib/promotion-release/review-lab';
import { seedReviewRules } from '@/lib/promotion-release/review-rules';
import { shiftScenarioToReviewAt } from '@/lib/promotion-release/scenario-clock';
import {
  buildEvaluationRequest,
  evaluateModelCase,
  evaluationCases,
  evaluationReportSchema,
} from './evaluation';
import { labResponseSchema } from './review-lab-contract';

const reviewAt = '2030-05-01T12:00:00.000Z';
const model = 'gemini-3.5-flash-lite';
const scenario = shiftScenarioToReviewAt(
  loadReviewedReplay().scenario,
  reviewAt,
);
function getCase(id: string) {
  const test = evaluationCases.find((test) => test.id === id);
  if (!test) throw new Error(`Unknown test ${id}.`);
  return test;
}
function responseFor(test: ReturnType<typeof getCase>, output: unknown) {
  return labResponseSchema.parse({
    kind: 'result',
    stage: test.stage,
    model,
    runId: `eval-${test.id}`,
    durationMs: 1,
    systemInstructions: 'Test server instructions',
    modelInput: { sku: test.sku },
    output,
    suggestion: null,
    review: null,
    snapshot: null,
    issues: [],
    usage: { inputTokens: 10, outputTokens: 10 },
  });
}
function score(id: string, output: unknown) {
  const test = getCase(id);
  return evaluateModelCase(
    test,
    buildEvaluationRequest(test, model, reviewAt),
    responseFor(test, output),
    2,
  );
}

describe('synthetic model evaluations', () => {
  it('keeps expected values outside the provider request and anchors every case to the same clock', () => {
    for (const test of evaluationCases) {
      const request = buildEvaluationRequest(test, model, reviewAt);
      expect(request.reviewAt).toBe(reviewAt);
      expect(request.rules).toEqual(seedReviewRules);
      expect(request.confirmedFacts).toEqual({});
      expect(request).not.toHaveProperty('expected');
      expect(request.input.instructions).not.toContain(test.purpose);
      expect(request.input.text).toBe(test.text);
    }
  });

  it('accepts explicit facts and detects omissions, invented amounts, bad quotes and directives treated as facts', () => {
    const text = getCase('confirmed_supplier').text;
    const claims = [
      {
        field: 'fundingStatus',
        value: 'confirmed',
        quote: 'Supplier funding is confirmed',
      },
      { field: 'fundingPencePerUnit', value: 10, quote: '10 pence per unit' },
      {
        field: 'confirmedAdditionalAllocationUnits',
        value: 120,
        quote: 'additional allocation of 120 units',
      },
    ];
    expect(claims.every(({ quote }) => text.includes(quote))).toBe(true);
    expect(
      score('confirmed_supplier', { claims, uncertainties: [] }).outcome,
    ).toBe('passed');
    expect(
      score('confirmed_supplier', { claims: [], uncertainties: [] }).outcome,
    ).toBe('failed');
    expect(
      score('confirmed_supplier', {
        claims: claims.map((claim) => ({
          ...claim,
          quote: 'unsupported quote',
        })),
        uncertainties: [],
      }).outcome,
    ).toBe('failed');
    expect(
      score('tentative_supplier', {
        claims: [],
        uncertainties: ['No quantities confirmed.'],
      }).outcome,
    ).toBe('passed');
    expect(
      score('tentative_supplier', {
        claims: [
          { field: 'fundingPencePerUnit', value: 10, quote: 'The amount' },
        ],
        uncertainties: [],
      }).outcome,
    ).toBe('failed');
    expect(
      score('injected_directive', {
        claims: [
          {
            field: 'fundingPencePerUnit',
            value: 99,
            quote: '99 pence per unit',
          },
        ],
        uncertainties: [],
      }).outcome,
    ).toBe('failed');
  });

  it('tests rule behavior at the boundary and rejects a floor that only applies when ordering', () => {
    const test = getCase('margin_policy');
    const rule = {
      code: 'custom_margin_floor',
      title: 'Minimum funded margin',
      source: 'Local policy excerpt',
      failure: 'block',
      emitPass: true,
      assert: {
        mode: 'all',
        clauses: [
          { left: 'marginPercent', operator: 'gte', right: { value: 30 } },
        ],
      },
    };
    const output = {
      ruleJson: JSON.stringify(rule),
      reason: 'Use the supplied policy.',
      sourceQuote: test.text,
    };
    expect(score(test.id, output).outcome).toBe('passed');
    expect(
      score(test.id, {
        ...output,
        ruleJson: JSON.stringify({
          ...rule,
          when: {
            mode: 'all',
            clauses: [
              { left: 'topUpUnits', operator: 'gt', right: { value: 0 } },
            ],
          },
        }),
      }).outcome,
    ).toBe('failed');
    expect(score(test.id, { ...output, ruleJson: '{' }).outcome).toBe('failed');
  });

  it('records a model miss even when independent checks block the proposed release', () => {
    const test = getCase('missing_stock');
    const request = buildEvaluationRequest(test, model, reviewAt);
    const suggestion = {
      sku: test.sku,
      recommendation: 'release',
      proposedPricePence: 150,
      proposedTopUpUnits: 0,
      rationale: 'Test unsafe recommendation.',
      uncertainties: ['Stock unavailable.'],
      evidenceRefs: ['ev-supply-0009'],
      selfReportedCertainty: 'high',
    };
    const checked = evaluateLabLine({
      scenario,
      proposal: suggestion,
      rules: seedReviewRules,
    });
    const response = labResponseSchema.parse({
      ...responseFor(test, suggestion),
      suggestion,
      review: { ...checked, treatment: 'blocked' },
      snapshot: captureLocalReview({
        scenario,
        proposal: suggestion,
        rules: request.rules,
        input: request.input,
      }),
    });
    const record = evaluateModelCase(test, request, response, 2);
    expect(record.outcome).toBe('failed');
    expect(
      record.checks.find(({ label }) => label === 'Independent checks')?.passed,
    ).toBe(true);
    expect(
      record.checks.find(({ label }) => label === 'Model recommendation')
        ?.passed,
    ).toBe(false);
  });

  it('retains provider failures and validates partial reports without treating them as completed', () => {
    const test = getCase('confirmed_supplier');
    const record = evaluateModelCase(
      test,
      buildEvaluationRequest(test, model, reviewAt),
      { kind: 'error', message: 'Quota exhausted.', runId: 'failed-run' },
      12,
    );
    expect(record.outcome).toBe('call_failed');
    expect(record.response).toHaveProperty('runId', 'failed-run');
    const report = {
      kind: 'model_evaluation',
      suiteVersion: 1,
      model,
      reviewAt,
      startedAt: reviewAt,
      finishedAt: reviewAt,
      state: 'stopped',
      records: [record],
    };
    expect(evaluationReportSchema.safeParse(report).success).toBe(true);
    expect(
      evaluationReportSchema.safeParse({ ...report, state: 'completed' })
        .success,
    ).toBe(false);
    expect(
      evaluationReportSchema.safeParse({ ...report, records: [record, record] })
        .success,
    ).toBe(false);
  });

  it('accepts either supporting withdrawal source while rejecting an unrelated citation', () => {
    const test = getCase('withdrawn_candidate');
    const request = buildEvaluationRequest(test, model, reviewAt);
    const suggestion = {
      sku: test.sku,
      recommendation: 'exclude',
      proposedPricePence: null,
      proposedTopUpUnits: null,
      rationale: 'Withdrawn after artwork delays.',
      uncertainties: [],
      evidenceRefs: ['ev-shortlist-0027', 'ev-note-pizza-withdrawal'],
      selfReportedCertainty: 'high',
    };
    const checked = evaluateLabLine({
      scenario,
      proposal: suggestion,
      rules: request.rules,
    });
    const response = labResponseSchema.parse({
      ...responseFor(test, suggestion),
      suggestion,
      review: { ...checked, treatment: 'no_release_proposal' },
      snapshot: captureLocalReview({
        scenario,
        proposal: suggestion,
        rules: request.rules,
        input: request.input,
      }),
    });
    expect(evaluateModelCase(test, request, response, 1).outcome).toBe(
      'passed',
    );
    if (response.kind !== 'result' || !response.suggestion)
      throw new Error('Missing proposal.');
    expect(
      evaluateModelCase(
        test,
        request,
        {
          ...response,
          suggestion: {
            ...response.suggestion,
            evidenceRefs: ['ev-supply-0004'],
          },
        },
        1,
      ).outcome,
    ).toBe('failed');
  });
});
