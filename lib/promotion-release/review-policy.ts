import {
  evaluateLinePolicy,
  getLineFacts,
  type LinePolicyProposal,
} from './line-policy';
import {
  gateSchema,
  type PolicyEvaluationReplay,
  type ScenarioEvidencePack,
} from './schemas';

type GateObligation =
  PolicyEvaluationReplay['candidates'][number]['gateObligations'][number];
type FindingCode =
  PolicyEvaluationReplay['candidates'][number]['findings'][number]['code'];

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
): FindingCode[] {
  const facts = getLineFacts(scenario, proposal.sku);
  const result = evaluateLinePolicy(scenario, proposal);
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
    facts.shortfallUnits === priorRequest.requestedUnits &&
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
    proposal.proposedStartsAt === campaign.startsAt &&
    proposal.proposedEndsAt === campaign.endsAt &&
    facts.channel.channels.some(
      (channel) =>
        (channel.startsAt !== null && channel.startsAt !== campaign.startsAt) ||
        (channel.endsAt !== null && channel.endsAt !== campaign.endsAt),
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
        evaluateLinePolicy(scenario, {
          ...proposal,
          proposedPricePence: promotionalSellingPricePence,
          proposedTopUpUnits: topUpUnits,
        }).verdict !== 'blocked',
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
