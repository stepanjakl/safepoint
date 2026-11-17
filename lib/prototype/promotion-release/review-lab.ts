import { z } from 'zod';

import { evaluateLinePolicy, type LinePolicyProposal } from './line-policy';
import {
  deriveFindingCodes,
  deriveGateObligations,
  deriveReviewFindings,
  evaluateGateReviews,
  gateAssessmentsSchema,
  localSemanticActionsSchema,
  type ReviewFinding,
} from './review-policy';
import {
  scenarioEvidencePackSchema,
  skuSchema,
  type ScenarioEvidencePack,
} from './schemas';
import { reviewRuleSetSchema, type ReviewRuleSet } from './review-rules';
import { sameJsonValue } from './comparison';

const localTextRoleSchema = z.enum([
  'case_evidence',
  'policy_excerpt',
  'background_context',
]);
export const localInputSchema = z.strictObject({
  instructions: z.string().max(4_000),
  text: z.string().max(6_000),
  role: localTextRoleSchema,
});
export type LocalInput = z.infer<typeof localInputSchema>;

export const supplierFactSchema = z.discriminatedUnion('field', [
  z.strictObject({
    field: z.literal('fundingStatus'),
    value: z.enum(['confirmed', 'unverified', 'not_offered']),
    quote: z.string().trim().min(1).max(500),
  }),
  z.strictObject({
    field: z.literal('fundingPencePerUnit'),
    value: z.number().int().min(0).max(10_000),
    quote: z.string().trim().min(1).max(500),
  }),
  z.strictObject({
    field: z.literal('confirmedAdditionalAllocationUnits'),
    value: z.number().int().min(0).max(1_000_000),
    quote: z.string().trim().min(1).max(500),
  }),
]);
export const extractedFactsSchema = z.strictObject({
  claims: z.array(supplierFactSchema).max(3),
  uncertainties: z.array(z.string().max(300)).max(5),
});
export type SupplierFact = z.infer<typeof supplierFactSchema>;
export type ConfirmedFacts = Partial<{
  fundingStatus: 'confirmed' | 'unverified' | 'not_offered';
  fundingPencePerUnit: number;
  confirmedAdditionalAllocationUnits: number;
}>;
export const confirmedFactsSchema = z.strictObject({
  fundingStatus: z.enum(['confirmed', 'unverified', 'not_offered']).optional(),
  fundingPencePerUnit: z.number().int().min(0).max(10_000).optional(),
  confirmedAdditionalAllocationUnits: z
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .optional(),
});

export function inspectConfirmedClaims({
  input,
  confirmedFacts,
  confirmedClaims,
}: {
  input: LocalInput;
  confirmedFacts: ConfirmedFacts;
  confirmedClaims: SupplierFact[];
}) {
  const issues: string[] = [];
  if (
    new Set(confirmedClaims.map(({ field }) => field)).size !==
    confirmedClaims.length
  )
    issues.push('Accepted claims must not contain duplicate fields.');
  for (const [field, value] of Object.entries(confirmedFacts)) {
    if (
      input.role !== 'case_evidence' ||
      !confirmedClaims.some(
        (claim) =>
          claim.field === field &&
          claim.value === value &&
          input.text.includes(claim.quote),
      )
    )
      issues.push(
        `Confirmed ${field} needs an accepted claim with a supporting quote in case evidence.`,
      );
  }
  return issues;
}

export function applyConfirmedFacts(
  scenario: ScenarioEvidencePack,
  sku: z.infer<typeof skuSchema>,
  facts: ConfirmedFacts,
): ScenarioEvidencePack {
  if (Object.keys(facts).length === 0) return scenario;
  return {
    ...scenario,
    supplierTerms: {
      ...scenario.supplierTerms,
      records: scenario.supplierTerms.records.map((record) => {
        if (record.sku !== sku) return record;
        const updated = { ...record, ...facts };
        // Confirmation of status does not confirm an amount from another source.
        if (
          record.fundingStatus !== 'confirmed' &&
          facts.fundingStatus === 'confirmed' &&
          facts.fundingPencePerUnit === undefined
        )
          updated.fundingStatus = 'unverified';
        return updated;
      }),
    },
  };
}

export function evaluateLabLine({
  scenario,
  proposal,
  rules,
  confirmedFacts = {},
  localEvidenceId,
}: {
  scenario: ScenarioEvidencePack;
  proposal: LinePolicyProposal;
  rules: ReviewRuleSet;
  confirmedFacts?: ConfirmedFacts;
  localEvidenceId?: string;
}) {
  const effective = applyConfirmedFacts(scenario, proposal.sku, confirmedFacts);
  const result = evaluateLinePolicy(effective, proposal, rules);
  const supplier = scenario.supplierTerms.records.find(
    ({ sku }) => sku === proposal.sku,
  );
  if (
    supplier?.fundingStatus !== 'confirmed' &&
    confirmedFacts.fundingStatus === 'confirmed' &&
    confirmedFacts.fundingPencePerUnit === undefined
  ) {
    result.checks.push({
      code: 'funding_confirmation_incomplete',
      status: 'block',
      message:
        'Cannot evaluate confirmed funding: confirm the funding amount as well as its status. The original unverified amount is not counted.',
      evidenceRefs: [
        supplier?.evidenceId ?? scenario.promotionBrief.evidenceId,
        ...(localEvidenceId ? [localEvidenceId] : []),
      ],
    });
    result.verdict = 'blocked';
  }
  const findings: ReviewFinding[] = deriveReviewFindings(
    effective,
    proposal,
    rules,
  );
  const gateReviews = evaluateGateReviews(effective, proposal, result);
  for (const gate of gateReviews) {
    if (
      gate.obligation !== 'required' ||
      gate.result === 'passed' ||
      gate.trustedResult === 'failed'
    )
      continue;
    result.checks.push({
      code: `gate_${gate.gate}`,
      status: 'block',
      message: `Required ${gate.gate.replaceAll('_', ' ')} gate is ${gate.result.replaceAll('_', ' ')}. ${gate.explanation}`,
      evidenceRefs: gate.evidenceRefs,
    });
  }
  for (const check of result.checks) {
    const gate = gateReviews.find(({ gate }) => check.code === `gate_${gate}`);
    if (
      check.status === 'block' &&
      (check.code === 'funding_confirmation_incomplete' ||
        (gate && gate.trustedResult !== 'failed'))
    )
      findings.push({
        id: `finding-${proposal.sku.toLowerCase()}-${check.code.replaceAll('_', '-')}`,
        code: check.code,
        severity: 'blocking',
        approvalConsequence: 'block',
        explanation: check.message,
        affectedFields: ['releaseProposal'],
        evidenceRefs: check.evidenceRefs,
      });
  }
  if (result.checks.some(({ status }) => status === 'block'))
    result.verdict = 'blocked';
  else if (
    findings.some(
      ({ approvalConsequence }) =>
        approvalConsequence === 'individual_approval',
    )
  )
    result.verdict = 'review_required';
  const sourceId = scenario.supplierTerms.records.find(
    ({ sku }) => sku === proposal.sku,
  )?.evidenceId;
  const policy =
    localEvidenceId && sourceId && Object.keys(confirmedFacts).length
      ? {
          ...result,
          checks: result.checks.map((check) =>
            check.evidenceRefs.includes(sourceId)
              ? {
                  ...check,
                  evidenceRefs: [
                    ...new Set([...check.evidenceRefs, localEvidenceId]),
                  ],
                }
              : check,
          ),
        }
      : result;
  return {
    policy,
    findingCodes: deriveFindingCodes(effective, proposal, rules),
    findings: findings.map((finding) =>
      localEvidenceId &&
      sourceId &&
      finding.evidenceRefs.includes(sourceId) &&
      Object.keys(confirmedFacts).length
        ? {
            ...finding,
            evidenceRefs: [
              ...new Set([...finding.evidenceRefs, localEvidenceId]),
            ],
          }
        : finding,
    ),
    gateObligations: deriveGateObligations(effective, proposal),
    gateReviews: gateReviews.map((gate) =>
      localEvidenceId &&
      sourceId &&
      gate.evidenceRefs.includes(sourceId) &&
      Object.keys(confirmedFacts).length
        ? {
            ...gate,
            evidenceRefs: [
              ...new Set([sourceId, localEvidenceId, ...gate.evidenceRefs]),
            ].slice(0, 12),
          }
        : gate,
    ),
  };
}

export const localModelCallSchema = z.strictObject({
  runId: z.string(),
  model: z.string(),
  input: z.strictObject({
    systemInstructions: z.string(),
    promptInput: z.unknown(),
  }),
});

export const localSimulationSchema = z.strictObject({
  kind: z.literal('simulation'),
  checkerVersion: z.literal('promotion-review-v2').optional(),
  sku: skuSchema,
  simulatedAt: z.iso.datetime(),
  input: localInputSchema,
  rules: reviewRuleSetSchema,
  confirmedFacts: confirmedFactsSchema,
  confirmedClaims: z.array(supplierFactSchema).max(3),
  sourceSnapshot: scenarioEvidencePackSchema,
  preflight: z.literal('passed_in_memory'),
  proposal: z.strictObject({
    sku: skuSchema,
    proposedPricePence: z.number().int().positive(),
    proposedTopUpUnits: z.number().int().nonnegative(),
    proposedStartsAt: z.string(),
    proposedEndsAt: z.string(),
    gateAssessments: gateAssessmentsSchema.optional(),
    semanticActions: localSemanticActionsSchema.optional(),
  }),
  checkedResult: z.unknown(),
  modelOutput: z.unknown().nullable(),
  modelCall: localModelCallSchema.nullable().default(null),
  effects: z.array(
    z.strictObject({
      target: z.string(),
      before: z.unknown(),
      proposed: z.unknown(),
      simulatedReadBack: z.unknown(),
      verifiedInMemory: z.boolean(),
    }),
  ),
});

export const localReviewSnapshotSchema = z.strictObject({
  kind: z.literal('review'),
  checkerVersion: z.literal('promotion-review-v2').optional(),
  reviewedAt: z.iso.datetime(),
  input: localInputSchema,
  rules: reviewRuleSetSchema,
  sourceSnapshot: scenarioEvidencePackSchema,
  confirmedFacts: confirmedFactsSchema,
  confirmedClaims: z.array(supplierFactSchema).max(3),
  proposal: z.strictObject({
    sku: skuSchema,
    proposedPricePence: z.number().int().positive().nullable(),
    proposedTopUpUnits: z.number().int().nonnegative().nullable(),
    proposedStartsAt: z.string().nullable().optional(),
    proposedEndsAt: z.string().nullable().optional(),
    gateAssessments: gateAssessmentsSchema.optional(),
    semanticActions: localSemanticActionsSchema.optional(),
  }),
  checkedResult: z.unknown(),
  modelOutput: z.unknown().nullable(),
  modelCall: localModelCallSchema.nullable().default(null),
});

export const localTrialSchema = z.discriminatedUnion('kind', [
  localReviewSnapshotSchema,
  localSimulationSchema,
]);
export const savedLabSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    input: localInputSchema,
    activeRules: reviewRuleSetSchema,
    confirmedSku: skuSchema.nullable(),
    confirmedFacts: confirmedFactsSchema,
    confirmedClaims: z.array(supplierFactSchema).max(3).default([]),
    latestTrial: localTrialSchema.nullable(),
  })
  .superRefine((saved, context) => {
    const issues = inspectConfirmedClaims(saved);
    if (!saved.confirmedSku && Object.keys(saved.confirmedFacts).length)
      issues.push('Accepted facts need a selected product.');
    for (const message of issues)
      context.addIssue({ code: 'custom', path: ['confirmedFacts'], message });
  });

export function captureLocalReview({
  scenario,
  proposal,
  rules,
  input,
  confirmedFacts = {},
  confirmedClaims = [],
  modelOutput = null,
  modelCall = null,
}: {
  scenario: ScenarioEvidencePack;
  proposal: LinePolicyProposal;
  rules: ReviewRuleSet;
  input: LocalInput;
  confirmedFacts?: ConfirmedFacts;
  confirmedClaims?: SupplierFact[];
  modelOutput?: unknown | null;
  modelCall?: z.infer<typeof localModelCallSchema> | null;
}) {
  const checkedResult = evaluateLabLine({
    scenario,
    proposal,
    rules,
    confirmedFacts,
    localEvidenceId: Object.keys(confirmedFacts).length
      ? `ev-local-text-${proposal.sku.toLowerCase()}`
      : undefined,
  });
  return localReviewSnapshotSchema.parse({
    kind: 'review',
    checkerVersion: 'promotion-review-v2',
    reviewedAt: new Date().toISOString(),
    sourceSnapshot: scenario,
    proposal: {
      sku: proposal.sku,
      proposedPricePence: proposal.proposedPricePence,
      proposedTopUpUnits: proposal.proposedTopUpUnits,
      proposedStartsAt: proposal.proposedStartsAt,
      proposedEndsAt: proposal.proposedEndsAt,
      gateAssessments: proposal.gateAssessments,
      semanticActions: proposal.semanticActions,
    },
    rules,
    input,
    confirmedFacts,
    confirmedClaims,
    checkedResult,
    modelOutput,
    modelCall,
  });
}

export function previewLocalEffects(
  scenario: ScenarioEvidencePack,
  proposal: LinePolicyProposal,
) {
  if (
    proposal.proposedPricePence === null ||
    proposal.proposedTopUpUnits === null
  )
    return [];
  const candidate = scenario.channelState.records.find(
    ({ sku }) => sku === proposal.sku,
  );
  if (!candidate) throw new Error('Missing simulated channel state.');
  const startsAt =
    proposal.proposedStartsAt ?? scenario.promotionBrief.campaign.startsAt;
  const endsAt =
    proposal.proposedEndsAt ?? scenario.promotionBrief.campaign.endsAt;
  const actions = proposal.semanticActions;
  const channelActions = {
    pricebook: 'update_promotion_record',
    storefront: 'schedule_storefront_promotion',
    labels: 'queue_labels',
  };
  return [
    ...candidate.channels
      .filter(
        (channel) =>
          !actions ||
          actions.some((action) => action === channelActions[channel.channel]),
      )
      .map((channel) => ({
        target: channel.channel,
        before: structuredClone(channel),
        proposed: {
          ...structuredClone(channel),
          status: 'ready',
          promotionalSellingPricePence: proposal.proposedPricePence,
          startsAt,
          endsAt,
        },
      })),
    ...(!actions || actions.includes('record_top_up_recommendation')
      ? [
          {
            target: 'local top-up recommendation',
            before: { recommendedTopUpQuantityUnits: null },
            proposed: {
              recommendedTopUpQuantityUnits: proposal.proposedTopUpUnits,
            },
          },
        ]
      : []),
  ];
}

export type SimulationTarget = {
  read: (target: string) => unknown;
  apply: (effect: ReturnType<typeof previewLocalEffects>[number]) => void;
};

export function createSimulationTarget(
  scenario: ScenarioEvidencePack,
  sku: z.infer<typeof skuSchema>,
): SimulationTarget {
  const channels = scenario.channelState.records.find(
    (record) => record.sku === sku,
  )?.channels;
  if (!channels) throw new Error('Missing simulated channel state.');
  const copy = new Map<string, unknown>(
    channels.map((channel) => [channel.channel, structuredClone(channel)]),
  );
  copy.set('local top-up recommendation', {
    recommendedTopUpQuantityUnits: null,
  });
  return {
    read: (target) => structuredClone(copy.get(target)),
    apply: (effect) => {
      const previous = copy.get(effect.target);
      if (!previous || typeof previous !== 'object')
        throw new Error('Unregistered simulation target.');
      if ('recommendedTopUpQuantityUnits' in effect.proposed) {
        if (effect.target !== 'local top-up recommendation')
          throw new Error('Invalid top-up target.');
        copy.set(effect.target, {
          ...previous,
          recommendedTopUpQuantityUnits:
            effect.proposed.recommendedTopUpQuantityUnits,
        });
      } else {
        if (!['pricebook', 'storefront', 'labels'].includes(effect.target))
          throw new Error('Invalid channel target.');
        copy.set(effect.target, {
          ...previous,
          status: 'ready',
          promotionalSellingPricePence:
            effect.proposed.promotionalSellingPricePence,
          startsAt: effect.proposed.startsAt,
          endsAt: effect.proposed.endsAt,
        });
      }
    },
  };
}

export function simulateLocalApproval({
  scenario,
  proposal,
  rules,
  input,
  confirmedFacts,
  confirmedClaims = [],
  checkedResult,
  modelOutput = null,
  modelCall = null,
  expectedEffects,
  target,
}: {
  scenario: ScenarioEvidencePack;
  proposal: LinePolicyProposal;
  rules: ReviewRuleSet;
  input: LocalInput;
  confirmedFacts: ConfirmedFacts;
  confirmedClaims?: SupplierFact[];
  checkedResult: ReturnType<typeof evaluateLabLine>;
  modelOutput?: unknown | null;
  modelCall?: z.infer<typeof localModelCallSchema> | null;
  expectedEffects?: ReturnType<typeof previewLocalEffects>;
  target?: SimulationTarget;
}) {
  // Recheck the proposal instead of trusting an earlier UI result.
  const current = evaluateLabLine({
    scenario,
    proposal,
    rules,
    confirmedFacts,
    localEvidenceId: Object.keys(confirmedFacts).length
      ? `ev-local-text-${proposal.sku.toLowerCase()}`
      : undefined,
  });
  if (
    current.policy.verdict === 'blocked' ||
    !sameJsonValue(current, {
      policy: checkedResult.policy,
      findingCodes: checkedResult.findingCodes,
      findings: checkedResult.findings,
      gateObligations: checkedResult.gateObligations,
      gateReviews: checkedResult.gateReviews,
    }) ||
    proposal.proposedPricePence === null ||
    proposal.proposedTopUpUnits === null
  )
    throw new Error(
      'Only a currently checked, nonblocked proposal with release terms can be simulated.',
    );
  const plan = previewLocalEffects(scenario, proposal);
  if (!plan.length)
    throw new Error('No permitted simulated changes were proposed.');
  if (expectedEffects && !sameJsonValue(plan, expectedEffects))
    throw new Error(
      'Simulation preflight failed: the target or permitted changes differ from the reviewed preview.',
    );
  const targetCopy = target ?? createSimulationTarget(scenario, proposal.sku);
  for (const effect of plan) {
    if (!sameJsonValue(targetCopy.read(effect.target), effect.before))
      throw new Error('Simulation preflight failed: target changed.');
  }
  for (const effect of plan) targetCopy.apply(effect);
  const effects = plan.map((effect) => {
    const simulatedReadBack = targetCopy.read(effect.target);
    return {
      ...effect,
      simulatedReadBack,
      verifiedInMemory: sameJsonValue(simulatedReadBack, effect.proposed),
    };
  });
  if (effects.some(({ verifiedInMemory }) => !verifiedInMemory))
    throw new Error(
      'Simulation read-back failed: the applied fields differ from the approved changes.',
    );
  return localSimulationSchema.parse({
    kind: 'simulation',
    checkerVersion: 'promotion-review-v2',
    sku: proposal.sku,
    simulatedAt: new Date().toISOString(),
    input,
    rules,
    confirmedFacts,
    confirmedClaims,
    sourceSnapshot: scenario,
    preflight: 'passed_in_memory',
    proposal: {
      ...proposal,
      proposedStartsAt:
        proposal.proposedStartsAt ?? scenario.promotionBrief.campaign.startsAt,
      proposedEndsAt:
        proposal.proposedEndsAt ?? scenario.promotionBrief.campaign.endsAt,
    },
    checkedResult: current,
    modelOutput,
    modelCall,
    effects,
  });
}
