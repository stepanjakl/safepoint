import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from './replay';
import { evaluateLinePolicy } from './line-policy';
import {
  applyConfirmedFacts,
  evaluateLabLine,
  simulateLocalApproval,
  previewLocalEffects,
  captureLocalReview,
  createSimulationTarget,
} from './review-lab';
import { deriveFindingCodes } from './review-policy';
import {
  evaluateReviewRules,
  reviewRuleSetSchema,
  seedReviewRules,
  type RuleFacts,
  describeRuleChanges,
} from './review-rules';

const replay = loadReviewedReplay();
const scenario = replay.scenario;

function proposalFor(sku: (typeof replay.proposal.candidates)[number]['sku']) {
  const candidate = replay.proposal.candidates.find((line) => line.sku === sku);
  if (!candidate) throw new Error(`Missing ${sku}.`);
  return {
    sku,
    proposedPricePence:
      candidate.proposed?.promotionalSellingPricePence ?? null,
    proposedTopUpUnits:
      candidate.proposed?.recommendedTopUpQuantityUnits ?? null,
    proposedStartsAt: candidate.proposed?.startsAt ?? null,
    proposedEndsAt: candidate.proposed?.endsAt ?? null,
  };
}

describe('local review rules experiment', () => {
  it('keeps seeded rule verdicts and finding codes aligned with all 27 reviewed cases', () => {
    for (const candidate of replay.proposal.candidates) {
      const proposal = proposalFor(candidate.sku);
      const result = evaluateLabLine({
        scenario,
        proposal,
        rules: seedReviewRules,
      });
      const expected = replay.policy.candidates.find(
        ({ sku }) => sku === candidate.sku,
      );
      expect(expected?.eligibility, candidate.sku).toBe(
        result.policy.verdict === 'blocked' ? 'blocked' : 'eligible',
      );
      expect(result.findingCodes.slice().sort(), candidate.sku).toEqual(
        expected?.findings.map(({ code }) => code).sort(),
      );
      expect(
        result.policy.checks.filter(({ code }) => !code.startsWith('gate_')),
      ).toEqual(evaluateLinePolicy(scenario, proposal, seedReviewRules).checks);
      const semantics = (findings: typeof result.findings) =>
        findings
          .map(({ code, severity, approvalConsequence, affectedFields }) => ({
            code,
            severity,
            approvalConsequence,
            affectedFields,
          }))
          .sort((a, b) => a.code.localeCompare(b.code));
      expect(semantics(result.findings), candidate.sku).toEqual(
        semantics(expected?.findings ?? []),
      );
      expect(result.policy.verdict === 'review_required', candidate.sku).toBe(
        expected?.eligibility !== 'blocked' &&
          Boolean(
            expected?.findings.some(
              ({ approvalConsequence }) =>
                approvalConsequence === 'individual_approval',
            ),
          ),
      );
      expect(result.findingCodes).toEqual(
        deriveFindingCodes(scenario, proposal, seedReviewRules),
      );
    }
  });

  it('does not confirm an unverified funding amount by changing status alone', () => {
    const proposal = proposalFor('ALD-0025');
    const incomplete = evaluateLabLine({
      scenario,
      proposal,
      rules: seedReviewRules,
      confirmedFacts: { fundingStatus: 'confirmed' },
      localEvidenceId: 'ev-local-text-ald-0025',
    });
    expect(incomplete.policy.marginPercent).toBe(9.2);
    expect(incomplete.policy.verdict).toBe('blocked');
    expect(incomplete.policy.checks).toContainEqual(
      expect.objectContaining({
        code: 'funding_confirmation_incomplete',
        status: 'block',
      }),
    );
    const complete = evaluateLabLine({
      scenario,
      proposal,
      rules: seedReviewRules,
      confirmedFacts: { fundingStatus: 'confirmed', fundingPencePerUnit: 60 },
      localEvidenceId: 'ev-local-text-ald-0025',
    });
    expect(complete.policy.marginPercent).toBe(21.2);
    expect(complete.policy.verdict).toBe('passes_checks');
    expect(
      complete.policy.checks.find(({ code }) => code === 'minimum_margin')
        ?.evidenceRefs,
    ).toEqual(
      expect.arrayContaining(['ev-supplier-0025', 'ev-local-text-ald-0025']),
    );
    expect(
      scenario.supplierTerms.records.find(({ sku }) => sku === 'ALD-0025')
        ?.fundingStatus,
    ).toBe('unverified');
  });

  it('compares equivalent date strings by instant across all candidates', () => {
    for (const candidate of replay.proposal.candidates) {
      const proposal = proposalFor(candidate.sku);
      const canonical = evaluateLabLine({
        scenario,
        proposal,
        rules: seedReviewRules,
      });
      const normalized = evaluateLabLine({
        scenario,
        proposal: {
          ...proposal,
          proposedStartsAt: proposal.proposedStartsAt
            ? new Date(proposal.proposedStartsAt).toISOString()
            : null,
          proposedEndsAt: proposal.proposedEndsAt
            ? new Date(proposal.proposedEndsAt).toISOString()
            : null,
        },
        rules: seedReviewRules,
      });
      expect(normalized.policy.verdict, candidate.sku).toBe(
        canonical.policy.verdict,
      );
      expect(
        normalized.policy.checks.map(({ code, status }) => ({ code, status })),
        candidate.sku,
      ).toEqual(
        canonical.policy.checks.map(({ code, status }) => ({ code, status })),
      );
      expect(normalized.findings, candidate.sku).toEqual(canonical.findings);
    }
  });

  it('blocks required gates that the model failed or did not evaluate', () => {
    const candidate = replay.proposal.candidates.find(
      ({ sku }) => sku === 'ALD-0002',
    );
    if (!candidate) throw new Error('Missing clean proposal.');
    for (const result of [
      'failed',
      'not_checked',
      'evidence_unavailable',
      'not_applicable',
    ] as const) {
      const proposal = {
        ...proposalFor(candidate.sku),
        gateAssessments: candidate.gateAssessments.map((gate) =>
          gate.gate === 'financial' ? { ...gate, result } : gate,
        ),
      };
      const checked = evaluateLabLine({
        scenario,
        proposal,
        rules: seedReviewRules,
      });
      expect(checked.policy.verdict, result).toBe('blocked');
      expect(checked.policy.checks).toContainEqual(
        expect.objectContaining({ code: 'gate_financial', status: 'block' }),
      );
    }
    const unchecked = evaluateLabLine({
      scenario,
      rules: seedReviewRules,
      proposal: {
        ...proposalFor(candidate.sku),
        gateAssessments: candidate.gateAssessments.map((gate) =>
          ['forecast', 'financial'].includes(gate.gate)
            ? { ...gate, result: 'not_checked' }
            : gate,
        ),
      },
    });
    expect(unchecked.findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['gate_forecast', 'gate_financial']),
    );
    expect(
      unchecked.gateReviews.find(({ gate }) => gate === 'financial'),
    ).toMatchObject({
      modelResult: 'not_checked',
      trustedResult: 'passed',
      result: 'not_checked',
    });
  });

  it('rejects missing or weakened core rules, invalid enums and fractional pack sizes', () => {
    const without = {
      ...seedReviewRules,
      rules: seedReviewRules.rules.slice(1),
    };
    expect(reviewRuleSetSchema.safeParse(without).success).toBe(false);
    const weakened = structuredClone(seedReviewRules);
    const margin = weakened.rules.find(({ code }) => code === 'minimum_margin');
    if (!margin) throw new Error('Missing margin rule.');
    margin.failure = 'attention';
    expect(reviewRuleSetSchema.safeParse(weakened).success).toBe(false);
    for (const clause of [
      { left: 'fundingStatus', operator: 'eq', right: { value: 'confrimed' } },
      { left: 'topUpUnits', operator: 'multiple_of', right: { value: 1.5 } },
      { left: 'topUpUnits', operator: 'multiple_of', right: { value: 0 } },
    ]) {
      expect(
        reviewRuleSetSchema.safeParse({
          ...seedReviewRules,
          rules: [
            ...seedReviewRules.rules,
            {
              code: 'custom_invalid',
              title: 'Test invalid',
              source: 'Test source',
              failure: 'block',
              emitPass: true,
              assert: { mode: 'all', clauses: [clause] },
            },
          ],
        }).success,
      ).toBe(false);
    }
    const relaxed = structuredClone(seedReviewRules);
    const threshold = relaxed.rules[0]?.assert.clauses[0];
    if (!threshold) throw new Error('Missing threshold.');
    threshold.right = { value: 12 };
    expect(reviewRuleSetSchema.safeParse(relaxed).success).toBe(true);
    expect(
      describeRuleChanges(seedReviewRules, relaxed, scenario.policyRules),
    ).toContainEqual(
      expect.objectContaining({ code: 'minimum_margin', direction: 'loosens' }),
    );
  });

  it('detects target drift and unsuccessful application through independent simulation reads', () => {
    const proposal = proposalFor('ALD-0002');
    const checkedResult = evaluateLabLine({
      scenario,
      proposal,
      rules: seedReviewRules,
    });
    const params = {
      scenario,
      proposal,
      rules: seedReviewRules,
      input: { instructions: '', text: '', role: 'case_evidence' as const },
      confirmedFacts: {},
      checkedResult,
    };
    const target = createSimulationTarget(scenario, proposal.sku);
    const effects = previewLocalEffects(scenario, proposal);
    const first = effects[0];
    if (!first) throw new Error('Missing effect.');
    if (!('promotionalSellingPricePence' in first.proposed))
      throw new Error('Missing channel effect.');
    first.proposed.promotionalSellingPricePence = 1;
    target.apply(first);
    expect(() => simulateLocalApproval({ ...params, target })).toThrow(
      'target changed',
    );
    const unchanged = createSimulationTarget(scenario, proposal.sku);
    expect(() =>
      simulateLocalApproval({
        ...params,
        target: { ...unchanged, apply: () => {} },
      }),
    ).toThrow('read-back failed');
    const reordered = structuredClone(checkedResult);
    const { checks, verdict, marginPercent, topUpUnits, pricePence, basis } =
      reordered.policy;
    reordered.policy = {
      checks,
      verdict,
      marginPercent,
      topUpUnits,
      pricePence,
      basis,
    };
    expect(
      simulateLocalApproval({ ...params, checkedResult: reordered }).kind,
    ).toBe('simulation');
    const restricted = {
      ...proposal,
      semanticActions: ['record_top_up_recommendation'] as const,
    };
    expect(
      previewLocalEffects(scenario, {
        ...restricted,
        semanticActions: [...restricted.semanticActions],
      }).map(({ target }) => target),
    ).toEqual(['local top-up recommendation']);
  });

  it('validates authored JSON and blocks unknown facts instead of passing', () => {
    const invalid = structuredClone(seedReviewRules);
    const firstRule = invalid.rules[0];
    const firstClause = firstRule?.assert.clauses[0];
    if (!firstRule || !firstClause) throw new Error('Missing seed rule.');
    Object.assign(firstClause, { left: 'notARegisteredFact' });
    expect(reviewRuleSetSchema.safeParse(invalid).success).toBe(false);
    const duplicate = structuredClone(seedReviewRules);
    const duplicateRule = duplicate.rules[0];
    if (!duplicateRule) throw new Error('Missing seed rule.');
    duplicate.rules.push(structuredClone(duplicateRule));
    expect(reviewRuleSetSchema.safeParse(duplicate).success).toBe(false);
    const facts: RuleFacts = {
      marginPercent: 20,
      minimumMarginPercent: 15,
      shortfallUnits: null,
      topUpUnits: 0,
      minimumOrderQuantityUnits: 60,
      orderMultipleUnits: 12,
      priceChangePercent: 5,
      individualApprovalPriceChangePercent: 25,
      confirmedAdditionalAllocationUnits: 0,
      fundingPencePerUnit: 0,
      fundingStatus: 'unverified',
      candidateStatus: 'approved',
    };
    expect(
      evaluateReviewRules(seedReviewRules, facts).find(
        ({ code }) => code === 'stock_coverage',
      ),
    ).toMatchObject({
      status: 'block',
      detail: expect.stringContaining('Cannot evaluate'),
    });
  });

  it('changes a rule across candidates and keeps an accepted fact local to one product', () => {
    const strict = structuredClone(seedReviewRules);
    const marginClause = strict.rules[0]?.assert.clauses[0];
    if (!marginClause) throw new Error('Missing margin rule.');
    marginClause.right = { value: 100 };
    const changed = replay.proposal.candidates.filter((candidate) => {
      const proposal = proposalFor(candidate.sku);
      return (
        evaluateLinePolicy(scenario, proposal, strict).verdict !==
        evaluateLinePolicy(scenario, proposal, seedReviewRules).verdict
      );
    });
    expect(changed.length).toBeGreaterThan(0);

    const original = scenario.supplierTerms.records.find(
      ({ sku }) => sku === 'ALD-0001',
    );
    const revised = applyConfirmedFacts(scenario, 'ALD-0001', {
      fundingStatus: 'unverified',
      fundingPencePerUnit: 0,
    });
    expect(original?.fundingStatus).toBe('confirmed');
    expect(
      revised.supplierTerms.records.find(({ sku }) => sku === 'ALD-0001')
        ?.fundingStatus,
    ).toBe('unverified');
    expect(
      revised.supplierTerms.records.find(({ sku }) => sku === 'ALD-0002'),
    ).toEqual(
      scenario.supplierTerms.records.find(({ sku }) => sku === 'ALD-0002'),
    );
    const result = evaluateLabLine({
      scenario,
      proposal: proposalFor('ALD-0001'),
      rules: seedReviewRules,
      confirmedFacts: { fundingStatus: 'unverified', fundingPencePerUnit: 0 },
      localEvidenceId: 'ev-local-text-ald-0001',
    });
    expect(
      result.policy.checks.find(({ code }) => code === 'funding_unverified')
        ?.evidenceRefs,
    ).toContain('ev-local-text-ald-0001');
  });

  it('simulates only a nonblocked proposal in memory', () => {
    const eligible = replay.proposal.candidates.find((candidate) => {
      const proposal = proposalFor(candidate.sku);
      return (
        proposal.proposedPricePence !== null &&
        evaluateLabLine({ scenario, proposal, rules: seedReviewRules }).policy
          .verdict !== 'blocked'
      );
    });
    if (!eligible) throw new Error('Expected a nonblocked fixture.');
    const proposal = proposalFor(eligible.sku);
    const checkedResult = evaluateLabLine({
      scenario,
      proposal,
      rules: seedReviewRules,
    });
    if (checkedResult.policy.verdict === 'blocked')
      throw new Error('Expected nonblocked fixture.');
    const before = structuredClone(scenario.channelState.records);
    const result = simulateLocalApproval({
      scenario,
      proposal,
      rules: seedReviewRules,
      input: {
        instructions: 'Review promotion.',
        text: '',
        role: 'case_evidence',
      },
      confirmedFacts: {},
      checkedResult,
    });
    expect(result.sourceSnapshot).toEqual(scenario);
    expect(result.rules).toEqual(seedReviewRules);
    expect(result.preflight).toBe('passed_in_memory');
    const mismatched = previewLocalEffects(scenario, proposal);
    const target = mismatched[0];
    if (!target) throw new Error('Missing preview.');
    target.target = 'unregistered-target';
    expect(() =>
      simulateLocalApproval({
        scenario,
        proposal,
        rules: seedReviewRules,
        input: { instructions: '', text: '', role: 'case_evidence' },
        confirmedFacts: {},
        checkedResult,
        expectedEffects: mismatched,
      }),
    ).toThrow('preflight');
    expect(() =>
      simulateLocalApproval({
        scenario,
        proposal: { ...proposal, proposedPricePence: 1 },
        rules: seedReviewRules,
        input: { instructions: '', text: '', role: 'case_evidence' },
        confirmedFacts: {},
        checkedResult,
      }),
    ).toThrow('currently checked');
    const snapshot = captureLocalReview({
      scenario,
      proposal,
      rules: seedReviewRules,
      input: { instructions: '', text: '', role: 'case_evidence' },
    });
    expect(snapshot.checkedResult).toEqual(checkedResult);
    expect(result.effects).toHaveLength(4);
    expect(
      result.effects.every(({ verifiedInMemory }) => verifiedInMemory),
    ).toBe(true);
    expect(scenario.channelState.records).toEqual(before);
    const blockedCandidate = replay.proposal.candidates.find(
      (candidate) =>
        evaluateLabLine({
          scenario,
          proposal: proposalFor(candidate.sku),
          rules: seedReviewRules,
        }).policy.verdict === 'blocked',
    );
    if (!blockedCandidate) throw new Error('Expected a blocked fixture.');
    const blockedProposal = proposalFor(blockedCandidate.sku);
    const blocked = evaluateLabLine({
      scenario,
      proposal: blockedProposal,
      rules: seedReviewRules,
    });
    expect(() =>
      simulateLocalApproval({
        scenario,
        proposal: blockedProposal,
        rules: seedReviewRules,
        input: { instructions: '', text: '', role: 'case_evidence' },
        confirmedFacts: {},
        checkedResult: blocked,
      }),
    ).toThrow();
  });
});
