import { z } from 'zod';

import cataloguePricebookJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/catalogue-pricebook.json';
import channelStateJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/channel-state.json';
import demandEvidenceJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/demand-evidence.json';
import operationalNotesJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/operational-notes.json';
import policyEvaluationJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/policy-evaluation-replay.json';
import policyRulesJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/policy-rules.json';
import promotionBriefJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/promotion-brief.json';
import promotionReleasePlanJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/promotion-release-plan.json';
import shortlistProvenanceJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/shortlist-provenance.json';
import supplierTermsJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/supplier-terms.json';
import supplyPositionJson from '../../fixtures/promotion-release/aldertons-promotion-release-v1/supply-position.json';

import {
  EXPECTED_SKUS,
  FIXTURE_VERSION,
  promotionReleasePlanSchema,
  policyEvaluationReplaySchema,
  reviewLineSchema,
  reviewedReplaySchema,
  scenarioEvidencePackSchema,
  type PolicyEvaluationReplay,
  type PromotionReleasePlan,
  type ReplaySummary,
  type ReviewedReplay,
  type ReviewLine,
  type ReviewOutcome,
  type ScenarioEvidencePack,
  type Sku,
} from './schemas';

const rawReplayFixtureSchema = z.strictObject({
  scenario: z.unknown(),
  proposal: z.unknown(),
  policy: z.unknown(),
});

const rawReplayFixture = {
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
};

export function loadReviewedReplay(): ReviewedReplay {
  return parseReviewedReplayFixture(rawReplayFixture);
}

export function parseReviewedReplayFixture(
  untrustedFixture: unknown,
): ReviewedReplay {
  const rawFixture = rawReplayFixtureSchema.parse(untrustedFixture);
  const scenario = scenarioEvidencePackSchema.parse(rawFixture.scenario);
  const proposal = promotionReleasePlanSchema.parse(rawFixture.proposal);
  const policy = policyEvaluationReplaySchema.parse(rawFixture.policy);

  validateScenarioInvariants({ scenario, proposal, policy });

  const lines = buildReviewLines({ scenario, proposal, policy });
  const summary = deriveReplaySummary(lines);

  return reviewedReplaySchema.parse({
    mode: 'replay',
    fixtureVersion: FIXTURE_VERSION,
    scenario,
    proposal,
    policy,
    lines,
    summary,
  });
}

export function deriveReplaySummary(lines: ReviewLine[]): ReplaySummary {
  const counts: Record<ReviewOutcome, number> = {
    ready: 0,
    needs_attention: 0,
    held: 0,
    excluded: 0,
    unverifiable: 0,
  };

  for (const line of lines) {
    counts[line.outcome] += 1;
  }

  return {
    total: lines.length,
    ready: counts.ready,
    needsAttention: counts.needs_attention,
    held: counts.held,
    excluded: counts.excluded,
    unverifiable: counts.unverifiable,
    potentiallyReleasable: counts.ready + counts.needs_attention,
    nonReleasable: counts.held + counts.excluded + counts.unverifiable,
  };
}

function buildReviewLines({
  scenario,
  proposal,
  policy,
}: {
  scenario: ScenarioEvidencePack;
  proposal: PromotionReleasePlan;
  policy: PolicyEvaluationReplay;
}): ReviewLine[] {
  const briefBySku = indexBySku(scenario.promotionBrief.candidates);
  const shortlistBySku = indexBySku(scenario.shortlistProvenance.records);
  const catalogueBySku = indexBySku(scenario.cataloguePricebook.records);
  const demandBySku = indexBySku(scenario.demandEvidence.records);
  const supplyBySku = indexBySku(scenario.supplyPosition.records);
  const supplierBySku = indexBySku(scenario.supplierTerms.records);
  const channelBySku = indexBySku(scenario.channelState.records);
  const assessmentBySku = indexBySku(proposal.candidates);
  const policyBySku = indexBySku(policy.candidates);

  return EXPECTED_SKUS.map((sku) => {
    const agentAssessment = requireRecord(assessmentBySku, sku);
    const policyEvaluation = requireRecord(policyBySku, sku);
    const notes = scenario.operationalNotes.records.filter(({ relatedSkus }) =>
      relatedSkus.includes(sku),
    );

    return reviewLineSchema.parse({
      sku,
      brief: requireRecord(briefBySku, sku),
      shortlist: requireRecord(shortlistBySku, sku),
      catalogue: requireRecord(catalogueBySku, sku),
      demand: requireRecord(demandBySku, sku),
      supply: requireRecord(supplyBySku, sku),
      supplier: requireRecord(supplierBySku, sku),
      channel: requireRecord(channelBySku, sku),
      notes,
      agentAssessment,
      policyEvaluation,
      outcome: deriveReviewOutcome({ agentAssessment, policyEvaluation }),
    });
  });
}

function deriveReviewOutcome({
  agentAssessment,
  policyEvaluation,
}: {
  agentAssessment: PromotionReleasePlan['candidates'][number];
  policyEvaluation: PolicyEvaluationReplay['candidates'][number];
}): ReviewOutcome {
  if (agentAssessment.agentRecommendation === 'exclude') {
    return 'excluded';
  }

  const evidenceIsUnavailable = policyEvaluation.findings.some(
    ({ code }) => code === 'required_evidence_unavailable',
  );
  if (evidenceIsUnavailable) {
    return 'unverifiable';
  }

  if (policyEvaluation.eligibility === 'blocked') {
    return 'held';
  }

  const needsIndividualAttention = policyEvaluation.findings.some(
    ({ approvalConsequence }) => approvalConsequence === 'individual_approval',
  );
  if (
    agentAssessment.agentRecommendation === 'adjust' ||
    needsIndividualAttention
  ) {
    return 'needs_attention';
  }

  return 'ready';
}

function validateScenarioInvariants({
  scenario,
  proposal,
  policy,
}: {
  scenario: ScenarioEvidencePack;
  proposal: PromotionReleasePlan;
  policy: PolicyEvaluationReplay;
}) {
  const expectedSkus = new Set<string>(EXPECTED_SKUS);
  const candidateCollections = [
    scenario.promotionBrief.candidates,
    scenario.shortlistProvenance.records,
    scenario.cataloguePricebook.records,
    scenario.demandEvidence.records,
    scenario.supplyPosition.records,
    scenario.supplierTerms.records,
    scenario.channelState.records,
    proposal.candidates,
    policy.candidates,
  ];

  for (const records of candidateCollections) {
    const actualSkus = new Set(records.map(({ sku }) => sku));
    if (
      actualSkus.size !== expectedSkus.size ||
      EXPECTED_SKUS.some((sku) => !actualSkus.has(sku))
    ) {
      throw new Error(
        'Every candidate collection must contain the exact 27-SKU set.',
      );
    }
  }

  const evidenceIds = collectEvidenceIds(scenario);
  if (evidenceIds.size !== countEvidenceRecords(scenario)) {
    throw new Error(
      'Evidence IDs must be unique across the complete scenario.',
    );
  }

  const referencedEvidenceIds = [
    ...proposal.evidenceRefs,
    ...proposal.candidates.flatMap(({ evidenceRefs, gateAssessments }) => [
      ...evidenceRefs,
      ...gateAssessments.flatMap((gate) => gate.evidenceRefs),
    ]),
    ...policy.candidates.flatMap(({ findings }) =>
      findings.flatMap(({ evidenceRefs }) => evidenceRefs),
    ),
  ];
  const missingReference = referencedEvidenceIds.find(
    (evidenceId) => !evidenceIds.has(evidenceId),
  );
  if (missingReference) {
    throw new Error(`Unknown evidence reference: ${missingReference}.`);
  }

  const campaign = scenario.promotionBrief.campaign;
  const reviewTime = Date.parse(campaign.reviewAt);
  const cutoffTime = Date.parse(campaign.topUpCutoffAt);
  const labelDeadlineTime = Date.parse(campaign.labelDeadlineAt);
  const promotionStartTime = Date.parse(campaign.startsAt);
  const promotionEndTime = Date.parse(campaign.endsAt);
  if (
    reviewTime >= cutoffTime ||
    cutoffTime >= labelDeadlineTime ||
    labelDeadlineTime >= promotionStartTime ||
    promotionStartTime >= promotionEndTime
  ) {
    throw new Error(
      'Review, cutoff, label deadline, promotion start, and promotion end must be strictly ordered.',
    );
  }

  const reviewToLabelMilliseconds = labelDeadlineTime - reviewTime;
  if (reviewToLabelMilliseconds !== 21.25 * 60 * 60 * 1_000) {
    throw new Error(
      'The review-to-label interval must be 21 hours and 15 minutes.',
    );
  }

  if (
    Date.parse(proposal.generatedAt) > Date.parse(campaign.reviewAt) ||
    Date.parse(policy.evaluatedAt) < Date.parse(proposal.generatedAt) ||
    Date.parse(policy.evaluatedAt) > Date.parse(campaign.reviewAt)
  ) {
    throw new Error(
      'Proposal and policy replay timestamps must precede review in order.',
    );
  }

  for (const record of scenario.channelState.records) {
    const channels = new Set(record.channels.map(({ channel }) => channel));
    if (channels.size !== 3) {
      throw new Error(
        `Channel evidence for ${record.sku} must contain each channel once.`,
      );
    }
  }

  for (const candidate of scenario.promotionBrief.candidates) {
    const hasReason = candidate.statusReason !== null;
    if ((candidate.status === 'withdrawn') !== hasReason) {
      throw new Error(
        `Brief status and status reason are inconsistent for ${candidate.sku}.`,
      );
    }
  }
}

function collectEvidenceIds(scenario: ScenarioEvidencePack): Set<string> {
  return new Set([
    scenario.promotionBrief.evidenceId,
    scenario.policyRules.evidenceId,
    ...scenario.shortlistProvenance.records.map(({ evidenceId }) => evidenceId),
    ...scenario.cataloguePricebook.records.map(({ evidenceId }) => evidenceId),
    ...scenario.demandEvidence.records.map(({ evidenceId }) => evidenceId),
    ...scenario.supplyPosition.records.map(({ evidenceId }) => evidenceId),
    ...scenario.supplierTerms.records.map(({ evidenceId }) => evidenceId),
    ...scenario.operationalNotes.records.map(({ evidenceId }) => evidenceId),
    ...scenario.channelState.records.map(({ evidenceId }) => evidenceId),
  ]);
}

function countEvidenceRecords(scenario: ScenarioEvidencePack): number {
  return (
    2 +
    scenario.shortlistProvenance.records.length +
    scenario.cataloguePricebook.records.length +
    scenario.demandEvidence.records.length +
    scenario.supplyPosition.records.length +
    scenario.supplierTerms.records.length +
    scenario.operationalNotes.records.length +
    scenario.channelState.records.length
  );
}

function indexBySku<T extends { sku: Sku }>(records: T[]): Map<Sku, T> {
  return new Map(records.map((record) => [record.sku, record]));
}

function requireRecord<T>(records: ReadonlyMap<Sku, T>, sku: Sku): T {
  const record = records.get(sku);
  if (record === undefined) {
    throw new Error(`Missing record for ${sku}.`);
  }
  return record;
}
