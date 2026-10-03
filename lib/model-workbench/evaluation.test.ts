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
  EVALUATION_SUITE_VERSION,
  evaluationReportCaseCount,
} from './evaluation';
import { labResponseSchema } from './review-lab-contract';
import type { LineSuggestion } from './line';

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
    const suggestion: LineSuggestion = {
      sku: test.sku,
      recommendation: 'release',
      proposedPricePence: 150,
      proposedTopUpUnits: 0,
      rationale: 'Test unsafe recommendation.',
      uncertainties: ['Stock unavailable.'],
      evidenceRefs: ['ev-supply-0009'],
      selfReportedCertainty: 'high',
      gateAssessments:
        loadReviewedReplay().proposal.candidates.find(
          ({ sku }) => sku === test.sku,
        )?.gateAssessments ?? [],
      semanticActions:
        test.sku === 'ALD-0027' ? [] : ['update_promotion_record'],
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

  it('withholds an unresolved amount while requiring the uncontested allocation and uncertainty', () => {
    const claims = [
      {
        field: 'confirmedAdditionalAllocationUnits',
        value: 60,
        quote: 'additional allocation of 60 units',
      },
    ];
    const output = {
      claims,
      uncertainties: [
        'The two current records disagree on funding; neither takes precedence.',
      ],
    };
    expect(score('conflicting_supplier', output).outcome).toBe('passed');
    expect(
      score('conflicting_supplier', { ...output, uncertainties: [] }).outcome,
    ).toBe('failed');
    for (const value of [8, 12, 10])
      expect(
        score('conflicting_supplier', {
          ...output,
          claims: [
            ...claims,
            {
              field: 'fundingPencePerUnit',
              value,
              quote: `${value} pence per unit`,
            },
          ],
        }).outcome,
      ).toBe('failed');
    expect(
      score('negated_supplier', {
        claims: [
          {
            field: 'fundingStatus',
            value: 'not_offered',
            quote: 'will not offer any funding',
          },
          {
            field: 'confirmedAdditionalAllocationUnits',
            value: 0,
            quote: '0 units',
          },
        ],
        uncertainties: [],
      }).outcome,
    ).toBe('passed');
    expect(
      score('negated_supplier', {
        claims: [
          { field: 'fundingStatus', value: 'confirmed', quote: 'funding' },
        ],
        uncertainties: [],
      }).outcome,
    ).toBe('failed');
  });

  it('checks amendment identity and conditional applicability instead of accepting another threshold rule', () => {
    const amended = getCase('amended_margin_policy');
    const scoped = getCase('scoped_margin_policy');
    const rule = {
      code: 'minimum_margin',
      title: 'Amended margin',
      source: 'Policy excerpt',
      failure: 'block',
      emitPass: true,
      assert: {
        mode: 'all',
        clauses: [
          { left: 'marginPercent', operator: 'gte', right: { value: 12 } },
        ],
      },
    };
    const output = {
      ruleJson: JSON.stringify(rule),
      reason: 'Replace the old rule.',
      sourceQuote: amended.text,
    };
    expect(score(amended.id, output).outcome).toBe('passed');
    expect(
      score(amended.id, {
        ...output,
        ruleJson: JSON.stringify({ ...rule, code: 'custom_other_margin' }),
      }).outcome,
    ).toBe('failed');
    const scopedRule = {
      ...rule,
      code: 'custom_order_margin',
      when: {
        mode: 'all',
        clauses: [{ left: 'topUpUnits', operator: 'gt', right: { value: 0 } }],
      },
      assert: {
        mode: 'all',
        clauses: [
          { left: 'marginPercent', operator: 'gte', right: { value: 22 } },
        ],
      },
    };
    const scopedOutput = {
      ...output,
      ruleJson: JSON.stringify(scopedRule),
      sourceQuote: scoped.text,
    };
    expect(score(scoped.id, scopedOutput).outcome).toBe('passed');
    expect(
      score(scoped.id, {
        ...scopedOutput,
        ruleJson: JSON.stringify({ ...scopedRule, when: undefined }),
      }).outcome,
    ).toBe('failed');
    expect(
      score(amended.id, {
        ...output,
        ruleJson: JSON.stringify({ ...rule, failure: 'attention' }),
      }).outcome,
    ).toBe('failed');
  });

  it('preserves seven-case reports while requiring all sixteen cases for a completed suite 3 report', () => {
    const records = evaluationCases.map((test) =>
      evaluateModelCase(
        test,
        buildEvaluationRequest(test, model, reviewAt),
        { kind: 'error', message: 'Test provider failure.' },
        1,
      ),
    );
    const base = {
      kind: 'model_evaluation',
      model,
      reviewAt,
      startedAt: reviewAt,
      finishedAt: reviewAt,
      state: 'completed',
    };
    const legacy = evaluationReportSchema.parse({
      ...base,
      suiteVersion: 1,
      records: records.slice(0, 7),
    });
    expect(evaluationReportCaseCount(legacy)).toBe(7);
    expect(
      evaluationReportSchema.safeParse({ ...legacy, records }).success,
    ).toBe(false);
    expect(
      evaluationReportSchema.safeParse({
        ...legacy,
        suiteVersion: EVALUATION_SUITE_VERSION,
      }).success,
    ).toBe(false);
    const current = evaluationReportSchema.parse({
      ...base,
      suiteVersion: EVALUATION_SUITE_VERSION,
      records,
    });
    expect(evaluationReportCaseCount(current)).toBe(16);
    expect(
      evaluationReportSchema.safeParse({ ...current, suiteVersion: 4 }).success,
    ).toBe(false);
  });

  it('keeps historical proposal responses readable without accepting their missing gates in current reports', () => {
    const test = getCase('ready_candidate');
    const request = buildEvaluationRequest(test, model, reviewAt);
    const candidate = loadReviewedReplay().proposal.candidates.find(
      ({ sku }) => sku === test.sku,
    );
    if (!candidate) throw new Error('Missing candidate.');
    const suggestion: LineSuggestion = {
      sku: test.sku,
      recommendation: 'release',
      proposedPricePence: 200,
      proposedTopUpUnits: 0,
      rationale: 'Existing supply covers demand.',
      uncertainties: [],
      evidenceRefs: ['ev-supply-0004'],
      selfReportedCertainty: 'medium',
      gateAssessments: candidate.gateAssessments,
      semanticActions: ['update_promotion_record'],
    };
    const checked = evaluateLabLine({
      scenario,
      proposal: suggestion,
      rules: seedReviewRules,
    });
    const response = labResponseSchema.parse({
      ...responseFor(test, suggestion),
      suggestion,
      review: { ...checked, treatment: 'individual_approval' },
      snapshot: captureLocalReview({
        scenario,
        proposal: suggestion,
        rules: seedReviewRules,
        input: request.input,
      }),
    });
    if (response.kind !== 'result' || !response.suggestion || !response.review)
      throw new Error('Missing response.');
    const legacySuggestion = Object.fromEntries(
      Object.entries(response.suggestion).filter(
        ([key]) => !['gateAssessments', 'semanticActions'].includes(key),
      ),
    );
    const legacyReview = Object.fromEntries(
      Object.entries(response.review).filter(
        ([key]) => !['findings', 'gateReviews'].includes(key),
      ),
    );
    const record = {
      ...evaluateModelCase(test, request, response, 1),
      response: {
        ...response,
        output: legacySuggestion,
        suggestion: legacySuggestion,
        review: legacyReview,
      },
    };
    const records = evaluationCases.map((test) =>
      evaluateModelCase(
        test,
        buildEvaluationRequest(test, model, reviewAt),
        { kind: 'error', message: 'Synthetic call failure' },
        1,
      ),
    );
    const historical = evaluationReportSchema.parse({
      kind: 'model_evaluation',
      suiteVersion: 2,
      model,
      reviewAt,
      startedAt: reviewAt,
      finishedAt: reviewAt,
      state: 'completed',
      records: records
        .slice(0, 12)
        .map((item) => (item.caseId === test.id ? record : item)),
    });
    expect(evaluationReportCaseCount(historical)).toBe(12);
    expect(historical.records[4]?.response).toEqual(record.response);
    expect(
      evaluationReportSchema.safeParse({
        ...historical,
        suiteVersion: EVALUATION_SUITE_VERSION,
        records: records.map((item) =>
          item.caseId === test.id ? record : item,
        ),
      }).success,
    ).toBe(false);
  });

  it('accepts either supporting withdrawal source while rejecting an unrelated citation', () => {
    const test = getCase('withdrawn_candidate');
    const request = buildEvaluationRequest(test, model, reviewAt);
    const suggestion: LineSuggestion = {
      sku: test.sku,
      recommendation: 'exclude',
      proposedPricePence: null,
      proposedTopUpUnits: null,
      rationale: 'Withdrawn after artwork delays.',
      uncertainties: [],
      evidenceRefs: ['ev-shortlist-0027', 'ev-note-pizza-withdrawal'],
      selfReportedCertainty: 'high',
      gateAssessments:
        loadReviewedReplay().proposal.candidates.find(
          ({ sku }) => sku === test.sku,
        )?.gateAssessments ?? [],
      semanticActions:
        test.sku === 'ALD-0027' ? [] : ['update_promotion_record'],
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
