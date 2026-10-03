import { z } from 'zod';

import { evaluateLinePolicy, type LinePolicyProposal } from './line-policy';
import { deriveFindingCodes, deriveGateObligations } from './review-policy';
import {
  scenarioEvidencePackSchema,
  skuSchema,
  type ScenarioEvidencePack,
} from './schemas';
import { reviewRuleSetSchema, type ReviewRuleSet } from './review-rules';

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
      records: scenario.supplierTerms.records.map((record) =>
        record.sku === sku ? { ...record, ...facts } : record,
      ),
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
                  evidenceRefs: [...check.evidenceRefs, localEvidenceId],
                }
              : check,
          ),
        }
      : result;
  return {
    policy,
    findingCodes: deriveFindingCodes(effective, proposal, rules),
    gateObligations: deriveGateObligations(effective, proposal),
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
    for (const [field, value] of Object.entries(saved.confirmedFacts)) {
      if (
        !saved.confirmedSku ||
        saved.input.role !== 'case_evidence' ||
        !saved.confirmedClaims.some(
          (claim) =>
            claim.field === field &&
            claim.value === value &&
            saved.input.text.includes(claim.quote),
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['confirmedFacts', field],
          message:
            'Accepted facts need a product and a supporting case-evidence claim.',
        });
    }
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
    reviewedAt: new Date().toISOString(),
    sourceSnapshot: scenario,
    proposal: {
      sku: proposal.sku,
      proposedPricePence: proposal.proposedPricePence,
      proposedTopUpUnits: proposal.proposedTopUpUnits,
      proposedStartsAt: proposal.proposedStartsAt,
      proposedEndsAt: proposal.proposedEndsAt,
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
  return [
    ...candidate.channels.map((channel) => ({
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
    {
      target: 'local top-up recommendation',
      before: { recommendedTopUpQuantityUnits: null },
      proposed: { recommendedTopUpQuantityUnits: proposal.proposedTopUpUnits },
    },
  ];
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
    JSON.stringify(current.policy) !== JSON.stringify(checkedResult.policy) ||
    proposal.proposedPricePence === null ||
    proposal.proposedTopUpUnits === null
  )
    throw new Error(
      'Only a currently checked, nonblocked proposal with release terms can be simulated.',
    );
  const plan = previewLocalEffects(scenario, proposal);
  if (
    expectedEffects &&
    JSON.stringify(plan) !== JSON.stringify(expectedEffects)
  )
    throw new Error(
      'Simulation preflight failed: the target or permitted changes differ from the reviewed preview.',
    );
  const targetCopy = new Map<string, unknown>(
    plan.map(({ target, before }) => [target, structuredClone(before)]),
  );
  for (const effect of plan) {
    if (
      JSON.stringify(targetCopy.get(effect.target)) !==
      JSON.stringify(effect.before)
    )
      throw new Error('Simulation preflight failed: target changed.');
  }
  for (const effect of plan)
    targetCopy.set(effect.target, structuredClone(effect.proposed));
  const effects = plan.map((effect) => {
    const simulatedReadBack = structuredClone(targetCopy.get(effect.target));
    return {
      ...effect,
      simulatedReadBack,
      verifiedInMemory:
        JSON.stringify(simulatedReadBack) === JSON.stringify(effect.proposed),
    };
  });
  return localSimulationSchema.parse({
    kind: 'simulation',
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
