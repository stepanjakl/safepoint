import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from './replay';
import { evaluateLinePolicy } from './line-policy';
import {
  applyConfirmedFacts,
  evaluateLabLine,
  simulateLocalApproval,
  previewLocalEffects,
  captureLocalReview,
} from './review-lab';
import { deriveFindingCodes } from './review-policy';
import {
  evaluateReviewRules,
  reviewRuleSetSchema,
  seedReviewRules,
  type RuleFacts,
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
      expect(result.policy).toEqual(
        evaluateLinePolicy(scenario, proposal, seedReviewRules),
      );
      expect(result.findingCodes).toEqual(
        deriveFindingCodes(scenario, proposal, seedReviewRules),
      );
    }
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
