import {
  evaluateLinePolicy,
  getLineFacts,
  type LinePolicyProposal,
} from './line-policy';
import {
  gateSchema,
  gateAssessmentSchema,
  policyLineEvaluationSchema,
  type PolicyEvaluationReplay,
  type ScenarioEvidencePack,
} from './schemas';
import { z } from 'zod';
import { seedReviewRules, type ReviewRuleSet } from './review-rules';
import { sameInstant } from './comparison';

type GateObligation =
  PolicyEvaluationReplay['candidates'][number]['gateObligations'][number];
type FindingCode =
  PolicyEvaluationReplay['candidates'][number]['findings'][number]['code'];

export const reviewFindingSchema =
  policyLineEvaluationSchema.shape.findings.element.extend({
    code: z.string().min(1),
  });
export const localSemanticActionsSchema = z
  .array(
    z.enum([
      'update_promotion_record',
      'record_top_up_recommendation',
      'schedule_storefront_promotion',
      'queue_labels',
    ]),
  )
  .max(4)
  .refine(
    (actions) => new Set(actions).size === actions.length,
    'Semantic actions must not contain duplicates.',
  );
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export const gateAssessmentsSchema = z
  .array(gateAssessmentSchema)
  .length(7)
  .superRefine((assessments, context) => {
    if (new Set(assessments.map(({ gate }) => gate)).size !== 7)
      context.addIssue({
        code: 'custom',
        message: 'Assess each of the seven gates exactly once.',
      });
  });

const findingMetadata: Record<
  FindingCode,
  { check?: string; fields: string[]; explanation: string }
> = {
  late_supply: {
    check: 'supplier_timing',
    fields: ['leadTimeHours', 'startsAt'],
    explanation: 'Supplier lead time extends beyond launch.',
  },
  unconfirmed_allocation: {
    check: 'supplier_allocation',
    fields: ['confirmedAdditionalAllocationUnits'],
    explanation: 'The proposal exceeds confirmed supplier allocation.',
  },
  margin_below_floor: {
    check: 'minimum_margin',
    fields: ['promotionalSellingPricePence', 'costPricePence'],
    explanation: 'Confirmed funding does not produce the required margin.',
  },
  funding_unverified: {
    check: 'funding_unverified',
    fields: ['fundingStatus'],
    explanation: 'Funding is unverified and excluded from the margin.',
  },
  promotion_withdrawn: {
    check: 'candidate_status',
    fields: ['status'],
    explanation: 'The promotion candidate has been withdrawn.',
  },
  required_evidence_unavailable: {
    check: 'source_availability',
    fields: ['supplyPosition'],
    explanation: 'Required source evidence is unavailable.',
  },
  uplift_already_included: {
    fields: ['promotionAdjustedForecastUnits', 'recommendedTopUpQuantityUnits'],
    explanation:
      'The forecast already includes promotional uplift. Review the top-up without adding uplift again.',
  },
  existing_supply_covers_demand: {
    fields: ['earlierPromotionOrderUnits', 'recommendedTopUpQuantityUnits'],
    explanation:
      'Existing supply covers forecast and safety stock. Confirm that no further order is needed.',
  },
  invalid_order_multiple_corrected: {
    check: 'order_terms',
    fields: ['recommendedTopUpQuantityUnits'],
    explanation:
      'A previous quantity violated supplier order terms. This proposal corrects it and needs individual approval.',
  },
  channel_dates_corrected: {
    check: 'channel_staging',
    fields: ['startsAt', 'endsAt'],
    explanation:
      'This proposal corrects staged channel dates to the campaign window.',
  },
  alternative_safe_plan: {
    fields: ['promotionalSellingPricePence', 'recommendedTopUpQuantityUnits'],
    explanation:
      'More than one evidenced plan passes numerical checks. A reviewer must choose the trade-off.',
  },
  large_price_change: {
    check: 'large_price_change',
    fields: ['promotionalSellingPricePence'],
    explanation: 'The price change exceeds the individual approval threshold.',
  },
};

export function deriveReviewFindings(
  scenario: ScenarioEvidencePack,
  proposal: LinePolicyProposal,
  rules: ReviewRuleSet = seedReviewRules,
): ReviewFinding[] {
  const facts = getLineFacts(scenario, proposal.sku);
  const policy = evaluateLinePolicy(scenario, proposal, rules);
  const codes = deriveFindingCodes(scenario, proposal, rules);
  const findings = codes.map((code): ReviewFinding => {
    const meta = findingMetadata[code];
    const check = policy.checks.find(
      ({ code: checkCode }) => checkCode === meta.check,
    );
    const blocking =
      check?.status === 'block' ||
      (code === 'funding_unverified' &&
        policy.checks.some(
          ({ code, status }) => code === 'minimum_margin' && status === 'block',
        ));
    const supportingEvidence: Partial<Record<FindingCode, string[]>> = {
      uplift_already_included: [facts.demand.evidenceId],
      existing_supply_covers_demand: [
        facts.demand.evidenceId,
        facts.supply.evidenceId,
      ],
      invalid_order_multiple_corrected: facts.notes
        .filter(({ claim }) => claim?.kind === 'prior_top_up_request')
        .map(({ evidenceId }) => evidenceId),
      channel_dates_corrected: [facts.channel.evidenceId],
      alternative_safe_plan: [
        facts.catalogue.evidenceId,
        facts.demand.evidenceId,
        facts.supply.evidenceId,
        facts.supplier.evidenceId,
        ...facts.notes
          .filter(({ claim }) => claim?.kind === 'candidate_plan_options')
          .map(({ evidenceId }) => evidenceId),
      ],
    };
    const evidenceRefs = [
      ...(supportingEvidence[code] ?? []),
      ...(check?.evidenceRefs.length
        ? check.evidenceRefs
        : [scenario.promotionBrief.evidenceId]),
    ];
    return {
      id: `finding-${proposal.sku.toLowerCase()}-${code.replaceAll('_', '-')}`,
      code,
      severity: blocking ? 'blocking' : 'warning',
      approvalConsequence: blocking ? 'block' : 'individual_approval',
      explanation: meta.explanation,
      affectedFields:
        code === 'required_evidence_unavailable'
          ? [
              ...(facts.demand.kind === 'unavailable'
                ? ['demandEvidence']
                : []),
              ...(facts.supply.kind === 'unavailable'
                ? ['supplyPosition']
                : []),
            ]
          : meta.fields,
      evidenceRefs: [...new Set(evidenceRefs)],
    };
  });
  for (const check of policy.checks) {
    if (
      check.status === 'pass' ||
      codes.some((code) => findingMetadata[code].check === check.code)
    )
      continue;
    if (
      check.code === 'large_price_change' &&
      proposal.proposedPricePence === null
    )
      continue;
    if (
      check.code === 'stock_coverage' &&
      codes.includes('required_evidence_unavailable')
    )
      continue;
    findings.push({
      id: `finding-${proposal.sku.toLowerCase()}-${check.code.replaceAll('_', '-')}`,
      code: check.code,
      severity: check.status === 'block' ? 'blocking' : 'warning',
      approvalConsequence:
        check.status === 'block' ? 'block' : 'individual_approval',
      explanation: check.message,
      affectedFields: ['releaseProposal'],
      evidenceRefs: check.evidenceRefs.length
        ? check.evidenceRefs
        : [scenario.promotionBrief.evidenceId],
    });
  }
  return findings;
}

export const gateReviewSchema = gateAssessmentSchema.extend({
  obligation: z.enum(['required', 'advisory', 'not_applicable']),
  assessmentSource: z.enum(['model', 'trusted_checks']),
  modelResult: gateAssessmentSchema.shape.result.nullable(),
  trustedResult: gateAssessmentSchema.shape.result,
});

export function evaluateGateReviews(
  scenario: ScenarioEvidencePack,
  proposal: LinePolicyProposal,
  policy: ReturnType<typeof evaluateLinePolicy>,
) {
  const checkCodes: Record<z.infer<typeof gateSchema>, string[]> = {
    forecast: ['source_availability', 'source_freshness'],
    inventory: ['source_availability', 'stock_coverage'],
    supplier: ['supplier_allocation', 'order_terms'],
    financial: ['minimum_margin', 'funding_confirmation_incomplete'],
    logistics: ['supplier_timing'],
    business_rules: [
      'proposal_values',
      'candidate_status',
      'source_freshness',
      'promotion_dates',
      'price_below_regular',
    ],
    external_signals: [],
  };
  return deriveGateObligations(scenario, proposal).map(
    ({ gate, obligation }) => {
      const checks = policy.checks.filter(({ code }) =>
        checkCodes[gate].includes(code),
      );
      const model = proposal.gateAssessments?.find(
        (assessment) => assessment.gate === gate,
      );
      const trustedFailed = checks.some(({ status }) => status === 'block');
      const trustedResult =
        obligation === 'not_applicable'
          ? 'not_applicable'
          : trustedFailed
            ? 'failed'
            : checks.length
              ? 'passed'
              : 'not_checked';
      const result =
        obligation === 'not_applicable'
          ? 'not_applicable'
          : trustedFailed
            ? 'failed'
            : model
              ? model.result
              : proposal.gateAssessments
                ? 'not_checked'
                : obligation === 'advisory'
                  ? 'not_checked'
                  : checks.length
                    ? 'passed'
                    : 'not_checked';
      return gateReviewSchema.parse({
        gate,
        obligation,
        result,
        assessmentSource: model ? 'model' : 'trusted_checks',
        modelResult: model?.result ?? null,
        trustedResult,
        explanation: trustedFailed
          ? checks
              .filter(({ status }) => status === 'block')
              .map(({ message }) => message)
              .join(' ')
          : (model?.explanation ??
            (checks.length
              ? 'Evaluated by the current trusted source and proposal checks.'
              : 'No applicable trusted check or model assessment.')),
        evidenceRefs: [
          ...new Set([
            ...checks.flatMap(({ evidenceRefs }) => evidenceRefs),
            ...(model?.evidenceRefs ?? []),
            scenario.promotionBrief.evidenceId,
          ]),
        ].slice(0, 12),
      });
    },
  );
}

export function reviewTreatment({
  recommendation,
  policy,
  findings,
}: {
  recommendation?: 'release' | 'adjust' | 'hold' | 'exclude';
  policy: ReturnType<typeof evaluateLinePolicy>;
  findings: ReviewFinding[];
}) {
  if (recommendation === 'hold' || recommendation === 'exclude')
    return 'no_release_proposal';
  if (
    policy.verdict === 'blocked' ||
    findings.some(({ approvalConsequence }) => approvalConsequence === 'block')
  )
    return 'blocked';
  if (
    findings.some(
      ({ approvalConsequence }) =>
        approvalConsequence === 'individual_approval',
    )
  )
    return 'individual_approval';
  return policy.verdict;
}

export function deriveGateObligations(
  scenario: ScenarioEvidencePack,
  proposal: LinePolicyProposal,
): GateObligation[] {
  const facts = getLineFacts(scenario, proposal.sku);
  const needsTopUp =
    facts.brief.status === 'approved' &&
    ((facts.shortfallUnits ?? 0) > 0 || (proposal.proposedTopUpUnits ?? 0) > 0);

  return gateSchema.options.map((gate) => {
    if (gate === 'external_signals') {
      return {
        gate,
        obligation: 'advisory',
        reason:
          'External signals inform judgement but do not override required source evidence.',
      };
    }
    if (gate === 'supplier' || gate === 'logistics') {
      return needsTopUp
        ? {
            gate,
            obligation: 'required',
            reason: 'The known supply gap or proposed top-up needs this gate.',
          }
        : {
            gate,
            obligation: 'not_applicable',
            reason:
              facts.brief.status === 'approved'
                ? 'No supplier top-up is needed or proposed for this line.'
                : 'The candidate is withdrawn and has no release proposal.',
          };
    }
    return {
      gate,
      obligation: 'required',
      reason: `The ${gate.replaceAll('_', ' ')} gate is required for this line.`,
    };
  });
}

export function deriveFindingCodes(
  scenario: ScenarioEvidencePack,
  proposal: LinePolicyProposal,
  rules: ReviewRuleSet = seedReviewRules,
): FindingCode[] {
  const facts = getLineFacts(scenario, proposal.sku);
  const result = evaluateLinePolicy(scenario, proposal, rules);
  const has = (code: string, status: 'block' | 'attention') =>
    result.checks.some(
      (check) => check.code === code && check.status === status,
    );
  const codes: FindingCode[] = [];
  const campaign = scenario.promotionBrief.campaign;

  if (
    has('supplier_timing', 'block') &&
    Date.parse(campaign.reviewAt) + facts.supplier.leadTimeHours * 3_600_000 >
      Date.parse(proposal.proposedStartsAt ?? campaign.startsAt)
  )
    codes.push('late_supply');
  if (has('supplier_allocation', 'block')) codes.push('unconfirmed_allocation');
  if (has('minimum_margin', 'block')) codes.push('margin_below_floor');
  if (facts.supplier.fundingStatus === 'unverified')
    codes.push('funding_unverified');
  if (has('candidate_status', 'block')) codes.push('promotion_withdrawn');
  if (has('source_availability', 'block'))
    codes.push('required_evidence_unavailable');
  if (
    facts.brief.status === 'approved' &&
    facts.demand.kind === 'available' &&
    facts.demand.upliftAlreadyIncluded
  )
    codes.push('uplift_already_included');
  if (
    facts.brief.status === 'approved' &&
    facts.shortfallUnits === 0 &&
    result.topUpUnits === 0
  )
    codes.push('existing_supply_covers_demand');
  const priorRequest = facts.notes.find(
    (note) => note.claim?.kind === 'prior_top_up_request',
  )?.claim;
  if (
    priorRequest?.kind === 'prior_top_up_request' &&
    proposal.proposedTopUpUnits !== null &&
    priorRequest.requestedUnits !== proposal.proposedTopUpUnits &&
    (priorRequest.requestedUnits < facts.supplier.minimumOrderQuantityUnits ||
      priorRequest.requestedUnits % facts.supplier.orderMultipleUnits !== 0) &&
    result.checks.some(
      (check) => check.code === 'order_terms' && check.status === 'pass',
    )
  )
    codes.push('invalid_order_multiple_corrected');
  if (
    proposal.proposedPricePence !== null &&
    proposal.proposedTopUpUnits !== null &&
    sameInstant(
      proposal.proposedStartsAt ?? campaign.startsAt,
      campaign.startsAt,
    ) &&
    sameInstant(proposal.proposedEndsAt ?? campaign.endsAt, campaign.endsAt) &&
    facts.channel.channels.some(
      (channel) =>
        (channel.startsAt !== null &&
          !sameInstant(channel.startsAt, campaign.startsAt)) ||
        (channel.endsAt !== null &&
          !sameInstant(channel.endsAt, campaign.endsAt)),
    )
  )
    codes.push('channel_dates_corrected');
  const optionsClaim = facts.notes.find(
    (note) => note.claim?.kind === 'candidate_plan_options',
  )?.claim;
  if (
    optionsClaim?.kind === 'candidate_plan_options' &&
    proposal.proposedPricePence !== null &&
    proposal.proposedTopUpUnits !== null &&
    optionsClaim.options.some(
      ({ promotionalSellingPricePence, topUpUnits }) =>
        promotionalSellingPricePence === proposal.proposedPricePence &&
        topUpUnits === proposal.proposedTopUpUnits,
    ) &&
    optionsClaim.options.some(
      ({ promotionalSellingPricePence, topUpUnits }) =>
        (promotionalSellingPricePence !== proposal.proposedPricePence ||
          topUpUnits !== proposal.proposedTopUpUnits) &&
        evaluateLinePolicy(
          scenario,
          {
            ...proposal,
            proposedPricePence: promotionalSellingPricePence,
            proposedTopUpUnits: topUpUnits,
          },
          rules,
        ).verdict !== 'blocked',
    ) &&
    result.verdict !== 'blocked'
  )
    codes.push('alternative_safe_plan');
  if (
    facts.brief.status === 'approved' &&
    proposal.proposedPricePence !== null &&
    has('large_price_change', 'attention')
  )
    codes.push('large_price_change');

  return codes;
}
