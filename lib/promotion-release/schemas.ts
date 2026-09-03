import { z } from 'zod';

export const SCENARIO_ID = 'aldertons-promotion-release-v1';
export const FIXTURE_VERSION = '1.0.0';

export const skuSchema = z.enum([
  'ALD-0001',
  'ALD-0002',
  'ALD-0003',
  'ALD-0004',
  'ALD-0005',
  'ALD-0006',
  'ALD-0007',
  'ALD-0008',
  'ALD-0009',
  'ALD-0010',
  'ALD-0011',
  'ALD-0012',
  'ALD-0013',
  'ALD-0014',
  'ALD-0015',
  'ALD-0016',
  'ALD-0017',
  'ALD-0018',
  'ALD-0019',
  'ALD-0020',
  'ALD-0021',
  'ALD-0022',
  'ALD-0023',
  'ALD-0024',
  'ALD-0025',
  'ALD-0026',
  'ALD-0027',
]);

export const EXPECTED_SKUS = skuSchema.options;

const utcTimestampSchema = z.iso.datetime({ offset: false });
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const positiveIntegerSchema = z.number().int().positive();
const shortTextSchema = z.string().trim().min(1).max(500);
const explanationSchema = z.string().trim().min(1).max(1_000);
const evidenceIdSchema = z.string().regex(/^ev-[a-z0-9-]+$/);

const fixtureHeaderShape = {
  schemaVersion: z.literal(1),
  scenarioId: z.literal(SCENARIO_ID),
  fixtureVersion: z.literal(FIXTURE_VERSION),
};

const evidenceMetadataShape = {
  evidenceId: evidenceIdSchema,
  sourceLabel: shortTextSchema,
  observedAt: utcTimestampSchema,
};

export const promotionBriefSchema = z.strictObject({
  ...fixtureHeaderShape,
  evidenceId: evidenceIdSchema,
  sourceLabel: shortTextSchema,
  observedAt: utcTimestampSchema,
  campaign: z.strictObject({
    id: z.literal('fresh-food-weekend-2026-09'),
    name: z.literal("Alderton's Fresh Food Weekend"),
    timezone: z.literal('Europe/London'),
    reviewAt: utcTimestampSchema,
    topUpCutoffAt: utcTimestampSchema,
    labelDeadlineAt: utcTimestampSchema,
    startsAt: utcTimestampSchema,
    endsAt: utcTimestampSchema,
    objective: shortTextSchema,
  }),
  candidates: z
    .array(
      z.strictObject({
        sku: skuSchema,
        intendedPromotionalSellingPricePence: positiveIntegerSchema,
        expectedUpliftPercent: nonNegativeIntegerSchema.max(500),
        status: z.enum(['approved', 'withdrawn']),
        statusReason: shortTextSchema.nullable(),
      }),
    )
    .length(27),
});

export const shortlistProvenanceSchema = z.strictObject({
  ...fixtureHeaderShape,
  records: z
    .array(
      z.strictObject({
        ...evidenceMetadataShape,
        sku: skuSchema,
        cycleId: z.literal('FW-2026-09'),
        upstreamScore: z.number().int().min(0).max(100),
        selectionReason: shortTextSchema,
        approvalReference: z.string().regex(/^APR-FW-\d{4}$/),
        approvedAt: utcTimestampSchema,
      }),
    )
    .length(27),
});

export const cataloguePricebookSchema = z.strictObject({
  ...fixtureHeaderShape,
  records: z
    .array(
      z.strictObject({
        ...evidenceMetadataShape,
        sku: skuSchema,
        productName: shortTextSchema,
        category: z.enum([
          'fruit',
          'vegetables_and_salad',
          'bakery',
          'dairy_and_chilled',
          'meat_fish_and_plant',
        ]),
        unitDescription: shortTextSchema,
        regularSellingPricePence: positiveIntegerSchema,
        currentPromotionalSellingPricePence: positiveIntegerSchema.nullable(),
        costPricePence: positiveIntegerSchema,
        casePackUnits: positiveIntegerSchema,
      }),
    )
    .length(27),
});

const availableDemandRecordSchema = z.strictObject({
  kind: z.literal('available'),
  ...evidenceMetadataShape,
  sku: skuSchema,
  recentWeeklySalesUnits: z.array(nonNegativeIntegerSchema).length(4),
  baselineForecastUnits: nonNegativeIntegerSchema,
  promotionAdjustedForecastUnits: nonNegativeIntegerSchema,
  forecastConfidence: z.enum(['high', 'medium', 'low']),
  upliftAlreadyIncluded: z.boolean(),
  analystCommentary: shortTextSchema.nullable(),
});

const unavailableDemandRecordSchema = z.strictObject({
  kind: z.literal('unavailable'),
  ...evidenceMetadataShape,
  sku: skuSchema,
  reason: shortTextSchema,
});

export const demandEvidenceRecordSchema = z.discriminatedUnion('kind', [
  availableDemandRecordSchema,
  unavailableDemandRecordSchema,
]);

export const demandEvidenceSchema = z.strictObject({
  ...fixtureHeaderShape,
  records: z.array(demandEvidenceRecordSchema).length(27),
});

const availableSupplyRecordSchema = z.strictObject({
  kind: z.literal('available'),
  ...evidenceMetadataShape,
  sku: skuSchema,
  stockOnHandUnits: nonNegativeIntegerSchema,
  reservedUnits: nonNegativeIntegerSchema,
  confirmedInboundBeforeLaunchUnits: nonNegativeIntegerSchema,
  earlierPromotionOrderUnits: nonNegativeIntegerSchema,
  openTopUpAmendmentUnits: nonNegativeIntegerSchema,
  safetyStockUnits: nonNegativeIntegerSchema,
  location: shortTextSchema,
});

const unavailableSupplyRecordSchema = z.strictObject({
  kind: z.literal('unavailable'),
  ...evidenceMetadataShape,
  sku: skuSchema,
  reason: shortTextSchema,
});

export const supplyPositionRecordSchema = z.discriminatedUnion('kind', [
  availableSupplyRecordSchema,
  unavailableSupplyRecordSchema,
]);

export const supplyPositionSchema = z.strictObject({
  ...fixtureHeaderShape,
  records: z.array(supplyPositionRecordSchema).length(27),
});

export const supplierTermsSchema = z.strictObject({
  ...fixtureHeaderShape,
  records: z
    .array(
      z.strictObject({
        ...evidenceMetadataShape,
        sku: skuSchema,
        supplierId: z.string().regex(/^SUP-\d{2}$/),
        supplierName: shortTextSchema,
        leadTimeHours: nonNegativeIntegerSchema,
        minimumOrderQuantityUnits: nonNegativeIntegerSchema,
        orderMultipleUnits: positiveIntegerSchema,
        confirmedAdditionalAllocationUnits: nonNegativeIntegerSchema,
        topUpCutoffAt: utcTimestampSchema,
        fundingStatus: z.enum(['confirmed', 'unverified', 'not_offered']),
        fundingPencePerUnit: nonNegativeIntegerSchema,
      }),
    )
    .length(27),
});

export const operationalNotesSchema = z.strictObject({
  ...fixtureHeaderShape,
  records: z.array(
    z.strictObject({
      ...evidenceMetadataShape,
      noteType: z.enum(['buyer', 'forecast', 'supplier', 'campaign']),
      relatedSkus: z.array(skuSchema).min(1).max(27),
      text: explanationSchema,
      trust: z.literal('untrusted_evidence'),
    }),
  ),
});

const channelSchema = z.strictObject({
  channel: z.enum(['pricebook', 'storefront', 'labels']),
  status: z.enum(['ready', 'mismatch', 'not_scheduled']),
  promotionalSellingPricePence: positiveIntegerSchema.nullable(),
  startsAt: utcTimestampSchema.nullable(),
  endsAt: utcTimestampSchema.nullable(),
});

export const channelStateSchema = z.strictObject({
  ...fixtureHeaderShape,
  records: z
    .array(
      z.strictObject({
        ...evidenceMetadataShape,
        sku: skuSchema,
        channels: z.array(channelSchema).length(3),
      }),
    )
    .length(27),
});

export const policyRulesSchema = z.strictObject({
  ...fixtureHeaderShape,
  evidenceId: evidenceIdSchema,
  sourceLabel: shortTextSchema,
  observedAt: utcTimestampSchema,
  policyVersion: z.literal('promotion-release-policy-v1'),
  minimumMarginPercent: z.number().min(0).max(100),
  individualApprovalPriceChangePercent: z.number().min(0).max(100),
  maximumEvidenceAgeHours: positiveIntegerSchema,
  requiredChannels: z
    .array(z.enum(['pricebook', 'storefront', 'labels']))
    .length(3),
});

export const gateSchema = z.enum([
  'forecast',
  'inventory',
  'supplier',
  'financial',
  'logistics',
  'business_rules',
  'external_signals',
]);

export const gateAssessmentSchema = z.strictObject({
  gate: gateSchema,
  result: z.enum([
    'passed',
    'failed',
    'not_checked',
    'evidence_unavailable',
    'not_applicable',
  ]),
  explanation: explanationSchema,
  evidenceRefs: z.array(evidenceIdSchema).min(1).max(12),
});

export const proposedReleaseSchema = z.strictObject({
  promotionalSellingPricePence: positiveIntegerSchema,
  startsAt: utcTimestampSchema,
  endsAt: utcTimestampSchema,
  recommendedTopUpQuantityUnits: nonNegativeIntegerSchema,
  semanticActions: z
    .array(
      z.enum([
        'update_promotion_record',
        'record_top_up_recommendation',
        'schedule_storefront_promotion',
        'queue_labels',
        'release_top_up_amendment',
        'send_notification',
      ]),
    )
    .min(1)
    .max(6),
});

export const promotionLineAssessmentSchema = z
  .strictObject({
    sku: skuSchema,
    agentRecommendation: z.enum(['release', 'adjust', 'hold', 'exclude']),
    proposed: proposedReleaseSchema.nullable(),
    gateAssessments: z.array(gateAssessmentSchema).length(7),
    rationale: explanationSchema,
    uncertainties: z.array(shortTextSchema).max(8),
    evidenceRefs: z.array(evidenceIdSchema).min(1).max(30),
  })
  .superRefine((assessment, context) => {
    const requiresProposal =
      assessment.agentRecommendation === 'release' ||
      assessment.agentRecommendation === 'adjust';

    if (requiresProposal !== (assessment.proposed !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['proposed'],
        message:
          'Release and adjust recommendations require a proposal; hold and exclude recommendations must not contain one.',
      });
    }

    addDuplicateIssues({
      values: assessment.gateAssessments.map(({ gate }) => gate),
      context,
      path: ['gateAssessments'],
      label: 'gate',
    });

    if (assessment.proposed) {
      addDuplicateIssues({
        values: assessment.proposed.semanticActions,
        context,
        path: ['proposed', 'semanticActions'],
        label: 'semantic action',
      });
    }
  });

export const promotionReleasePlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    scenarioId: z.literal(SCENARIO_ID),
    instructionVersion: z
      .string()
      .regex(/^promotion-release-instruction-v\d+$/),
    summary: explanationSchema,
    candidates: z.array(promotionLineAssessmentSchema).length(27),
    evidenceRefs: z.array(evidenceIdSchema).min(1).max(300),
    generatedAt: utcTimestampSchema,
  })
  .superRefine((plan, context) => {
    addDuplicateIssues({
      values: plan.candidates.map(({ sku }) => sku),
      context,
      path: ['candidates'],
      label: 'candidate SKU',
    });
    addDuplicateIssues({
      values: plan.evidenceRefs,
      context,
      path: ['evidenceRefs'],
      label: 'batch evidence reference',
    });
  });

export const gateObligationSchema = z.strictObject({
  gate: gateSchema,
  obligation: z.enum(['required', 'advisory', 'not_applicable']),
  reason: explanationSchema,
});

export const policyFindingCodeSchema = z.enum([
  'late_supply',
  'unconfirmed_allocation',
  'margin_below_floor',
  'funding_unverified',
  'promotion_withdrawn',
  'required_evidence_unavailable',
  'uplift_already_included',
  'existing_supply_covers_demand',
  'invalid_order_multiple_corrected',
  'channel_dates_corrected',
  'alternative_safe_plan',
  'large_price_change',
]);

export const policyLineEvaluationSchema = z
  .strictObject({
    sku: skuSchema,
    eligibility: z.enum(['eligible', 'blocked']),
    gateObligations: z.array(gateObligationSchema).length(7),
    findings: z.array(
      z.strictObject({
        id: z.string().regex(/^finding-[a-z0-9-]+$/),
        code: policyFindingCodeSchema,
        severity: z.enum(['info', 'warning', 'blocking']),
        approvalConsequence: z.enum(['none', 'individual_approval', 'block']),
        explanation: explanationSchema,
        affectedFields: z.array(shortTextSchema).min(1).max(8),
        evidenceRefs: z.array(evidenceIdSchema).min(1).max(12),
      }),
    ),
  })
  .superRefine((evaluation, context) => {
    addDuplicateIssues({
      values: evaluation.gateObligations.map(({ gate }) => gate),
      context,
      path: ['gateObligations'],
      label: 'gate obligation',
    });
    addDuplicateIssues({
      values: evaluation.findings.map(({ id }) => id),
      context,
      path: ['findings'],
      label: 'finding ID',
    });

    const hasBlockingFinding = evaluation.findings.some(
      ({ approvalConsequence }) => approvalConsequence === 'block',
    );
    if ((evaluation.eligibility === 'blocked') !== hasBlockingFinding) {
      context.addIssue({
        code: 'custom',
        path: ['eligibility'],
        message:
          'Blocked eligibility must match the presence of a blocking finding.',
      });
    }
  });

export const policyEvaluationReplaySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    scenarioId: z.literal(SCENARIO_ID),
    fixtureVersion: z.literal(FIXTURE_VERSION),
    evaluationMode: z.literal('replay'),
    policyVersion: z.literal('promotion-release-policy-v1'),
    evaluatedAt: utcTimestampSchema,
    candidates: z.array(policyLineEvaluationSchema).length(27),
  })
  .superRefine((evaluation, context) => {
    addDuplicateIssues({
      values: evaluation.candidates.map(({ sku }) => sku),
      context,
      path: ['candidates'],
      label: 'policy candidate SKU',
    });
  });

export const scenarioEvidencePackSchema = z.strictObject({
  promotionBrief: promotionBriefSchema,
  shortlistProvenance: shortlistProvenanceSchema,
  cataloguePricebook: cataloguePricebookSchema,
  demandEvidence: demandEvidenceSchema,
  supplyPosition: supplyPositionSchema,
  supplierTerms: supplierTermsSchema,
  operationalNotes: operationalNotesSchema,
  channelState: channelStateSchema,
  policyRules: policyRulesSchema,
});

export const reviewOutcomeSchema = z.enum([
  'ready',
  'needs_attention',
  'held',
  'excluded',
  'unverifiable',
]);

export const reviewLineSchema = z.strictObject({
  sku: skuSchema,
  brief: promotionBriefSchema.shape.candidates.element,
  shortlist: shortlistProvenanceSchema.shape.records.element,
  catalogue: cataloguePricebookSchema.shape.records.element,
  demand: demandEvidenceRecordSchema,
  supply: supplyPositionRecordSchema,
  supplier: supplierTermsSchema.shape.records.element,
  channel: channelStateSchema.shape.records.element,
  notes: operationalNotesSchema.shape.records,
  agentAssessment: promotionLineAssessmentSchema,
  policyEvaluation: policyLineEvaluationSchema,
  outcome: reviewOutcomeSchema,
});

export const replaySummarySchema = z.strictObject({
  total: nonNegativeIntegerSchema,
  ready: nonNegativeIntegerSchema,
  needsAttention: nonNegativeIntegerSchema,
  held: nonNegativeIntegerSchema,
  excluded: nonNegativeIntegerSchema,
  unverifiable: nonNegativeIntegerSchema,
  potentiallyReleasable: nonNegativeIntegerSchema,
  nonReleasable: nonNegativeIntegerSchema,
});

export const reviewedReplaySchema = z.strictObject({
  mode: z.literal('replay'),
  fixtureVersion: z.literal(FIXTURE_VERSION),
  scenario: scenarioEvidencePackSchema,
  proposal: promotionReleasePlanSchema,
  policy: policyEvaluationReplaySchema,
  lines: z.array(reviewLineSchema).length(27),
  summary: replaySummarySchema,
});

export type Sku = z.infer<typeof skuSchema>;
export type ScenarioEvidencePack = z.infer<typeof scenarioEvidencePackSchema>;
export type PromotionReleasePlan = z.infer<typeof promotionReleasePlanSchema>;
export type PolicyEvaluationReplay = z.infer<
  typeof policyEvaluationReplaySchema
>;
export type ReviewLine = z.infer<typeof reviewLineSchema>;
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;
export type ReviewedReplay = z.infer<typeof reviewedReplaySchema>;
export type ReplaySummary = z.infer<typeof replaySummarySchema>;

function addDuplicateIssues({
  values,
  context,
  path,
  label,
}: {
  values: string[];
  context: z.RefinementCtx;
  path: PropertyKey[];
  label: string;
}) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: 'custom',
        path,
        message: `Duplicate ${label}: ${value}.`,
      });
    }
    seen.add(value);
  }
}
