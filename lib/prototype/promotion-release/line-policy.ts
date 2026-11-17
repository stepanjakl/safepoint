import type {
  ScenarioEvidencePack,
  Sku,
  PromotionReleasePlan,
} from './schemas';
import { sameInstant } from './comparison';
import {
  evaluateReviewRules,
  seedReviewRules,
  type ReviewRuleSet,
  type RuleFacts,
  type RuleField,
} from './review-rules';

export type LinePolicyProposal = {
  sku: Sku;
  proposedPricePence: number | null;
  proposedTopUpUnits: number | null;
  proposedStartsAt?: string | null;
  proposedEndsAt?: string | null;
  gateAssessments?: PromotionReleasePlan['candidates'][number]['gateAssessments'];
  semanticActions?: (
    | 'update_promotion_record'
    | 'record_top_up_recommendation'
    | 'schedule_storefront_promotion'
    | 'queue_labels'
  )[];
};

export type LinePolicyCheck = {
  code: string;
  status: 'pass' | 'attention' | 'block';
  message: string;
  evidenceRefs: string[];
};

function requiredRecord<T extends { sku: Sku }>(records: T[], sku: Sku): T {
  const record = records.find((item) => item.sku === sku);
  if (!record) throw new Error(`Validated scenario is missing ${sku}.`);
  return record;
}

export function getLineFacts(scenario: ScenarioEvidencePack, sku: Sku) {
  const brief = requiredRecord(scenario.promotionBrief.candidates, sku);
  const shortlist = requiredRecord(scenario.shortlistProvenance.records, sku);
  const catalogue = requiredRecord(scenario.cataloguePricebook.records, sku);
  const demand = requiredRecord(scenario.demandEvidence.records, sku);
  const supply = requiredRecord(scenario.supplyPosition.records, sku);
  const supplier = requiredRecord(scenario.supplierTerms.records, sku);
  const channel = requiredRecord(scenario.channelState.records, sku);
  const notes = scenario.operationalNotes.records.filter((note) =>
    note.relatedSkus.includes(sku),
  );
  const availableBeforeLaunchUnits =
    supply.kind === 'available'
      ? supply.stockOnHandUnits -
        supply.reservedUnits +
        supply.confirmedInboundBeforeLaunchUnits +
        supply.earlierPromotionOrderUnits +
        supply.openTopUpAmendmentUnits
      : null;
  const requiredUnits =
    supply.kind === 'available' && demand.kind === 'available'
      ? demand.promotionAdjustedForecastUnits + supply.safetyStockUnits
      : null;
  const shortfallUnits =
    requiredUnits === null || availableBeforeLaunchUnits === null
      ? null
      : Math.max(0, requiredUnits - availableBeforeLaunchUnits);

  return {
    brief,
    shortlist,
    catalogue,
    demand,
    supply,
    supplier,
    channel,
    notes,
    availableBeforeLaunchUnits,
    requiredUnits,
    shortfallUnits,
  };
}

export function evaluateLinePolicy(
  scenario: ScenarioEvidencePack,
  proposal: LinePolicyProposal,
  ruleSet: ReviewRuleSet = seedReviewRules,
) {
  const { sku } = proposal;
  const facts = getLineFacts(scenario, sku);
  const { brief, shortlist, catalogue, demand, supply, supplier, channel } =
    facts;
  const campaign = scenario.promotionBrief.campaign;
  const rules = scenario.policyRules;
  const checks: LinePolicyCheck[] = [];
  const add = (
    code: string,
    status: LinePolicyCheck['status'],
    message: string,
    evidenceRefs: string[],
  ) => checks.push({ code, status, message, evidenceRefs });

  const price =
    proposal.proposedPricePence ?? brief.intendedPromotionalSellingPricePence;
  const startsAt = proposal.proposedStartsAt ?? campaign.startsAt;
  const endsAt = proposal.proposedEndsAt ?? campaign.endsAt;
  const shortfall = facts.shortfallUnits;
  const minimum = supplier.minimumOrderQuantityUnits;
  const multiple = supplier.orderMultipleUnits;
  const baselineTopUp =
    shortfall === null || shortfall === 0
      ? 0
      : Math.ceil(Math.max(minimum, shortfall) / multiple) * multiple;
  const topUp = proposal.proposedTopUpUnits ?? baselineTopUp;
  const basis =
    proposal.proposedPricePence === null ? 'brief_baseline' : 'model_proposal';
  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    !Number.isSafeInteger(topUp) ||
    topUp < 0
  )
    add(
      'proposal_values',
      'block',
      'Price must be a positive whole number of pence and top-up a nonnegative whole number of units.',
      [scenario.promotionBrief.evidenceId],
    );
  const confirmedFunding =
    supplier.fundingStatus === 'confirmed' ? supplier.fundingPencePerUnit : 0;
  const marginPercent =
    ((price - catalogue.costPricePence + confirmedFunding) / price) * 100;
  const priceChangePercent =
    ((catalogue.regularSellingPricePence - price) /
      catalogue.regularSellingPricePence) *
    100;
  const ruleFacts: RuleFacts = {
    marginPercent,
    minimumMarginPercent: rules.minimumMarginPercent,
    shortfallUnits: shortfall,
    topUpUnits: topUp,
    minimumOrderQuantityUnits: minimum,
    orderMultipleUnits: multiple,
    priceChangePercent,
    individualApprovalPriceChangePercent:
      rules.individualApprovalPriceChangePercent,
    confirmedAdditionalAllocationUnits:
      supplier.confirmedAdditionalAllocationUnits,
    fundingPencePerUnit: supplier.fundingPencePerUnit,
    fundingStatus: supplier.fundingStatus,
    candidateStatus: brief.status,
  };
  const ruleEvidence: Record<RuleField, string[]> = {
    marginPercent: [catalogue.evidenceId, supplier.evidenceId],
    minimumMarginPercent: [rules.evidenceId],
    shortfallUnits: [demand.evidenceId, supply.evidenceId],
    topUpUnits: [scenario.promotionBrief.evidenceId],
    minimumOrderQuantityUnits: [supplier.evidenceId],
    orderMultipleUnits: [supplier.evidenceId],
    priceChangePercent: [catalogue.evidenceId],
    individualApprovalPriceChangePercent: [rules.evidenceId],
    confirmedAdditionalAllocationUnits: [supplier.evidenceId],
    fundingPencePerUnit: [supplier.evidenceId],
    fundingStatus: [supplier.evidenceId],
    candidateStatus: [scenario.promotionBrief.evidenceId],
  };

  add(
    'candidate_status',
    brief.status === 'approved' ? 'pass' : 'block',
    brief.status === 'approved'
      ? 'Candidate remains approved.'
      : `Candidate was withdrawn: ${brief.statusReason}`,
    [scenario.promotionBrief.evidenceId],
  );

  const unavailable = [demand, supply].filter(
    (record) => record.kind === 'unavailable',
  );
  add(
    'source_availability',
    unavailable.length === 0 ? 'pass' : 'block',
    unavailable.length === 0
      ? 'Demand and supply records are available.'
      : `Required records unavailable: ${unavailable.map((record) => (record.kind === 'unavailable' ? record.reason : '')).join(' ')}`,
    unavailable.map(({ evidenceId }) => evidenceId),
  );

  const reviewTime = Date.parse(campaign.reviewAt);
  const requiredSources = [
    scenario.promotionBrief,
    shortlist,
    catalogue,
    demand,
    supply,
    supplier,
    channel,
  ];
  const stale = requiredSources.filter(
    ({ observedAt }) =>
      reviewTime - Date.parse(observedAt) >
        rules.maximumEvidenceAgeHours * 3_600_000 ||
      Date.parse(observedAt) > reviewTime,
  );
  add(
    'source_freshness',
    stale.length === 0 ? 'pass' : 'block',
    stale.length === 0
      ? 'Required source records are within the configured age limit.'
      : `Stale or future-dated sources: ${stale.map(({ sourceLabel }) => sourceLabel).join(', ')}.`,
    stale.map(({ evidenceId }) => evidenceId),
  );

  const datesValid =
    reviewTime < Date.parse(startsAt) &&
    Date.parse(startsAt) < Date.parse(endsAt);
  add(
    'promotion_dates',
    datesValid ? 'pass' : 'block',
    datesValid
      ? 'Promotion dates are ordered.'
      : 'Promotion dates are invalid.',
    [scenario.promotionBrief.evidenceId],
  );

  add(
    'price_below_regular',
    price < catalogue.regularSellingPricePence ? 'pass' : 'block',
    `${price}p proposed against ${catalogue.regularSellingPricePence}p regular price.`,
    [catalogue.evidenceId, scenario.promotionBrief.evidenceId],
  );

  for (const check of evaluateReviewRules(ruleSet, ruleFacts)) {
    const message =
      check.code === 'minimum_margin'
        ? `Confirmed-funding margin ${marginPercent.toFixed(1)}% = (${price}p price − ${catalogue.costPricePence}p cost + ${confirmedFunding}p confirmed funding) ÷ ${price}p; ${check.detail}`
        : check.code === 'stock_coverage'
          ? `Forecast plus safety stock needs ${facts.requiredUnits} units; ${facts.availableBeforeLaunchUnits} are covered before top-up. Shortfall ${shortfall}, proposed top-up ${topUp}. ${check.detail}`
          : check.code === 'order_terms'
            ? `Top-up ${topUp}; supplier minimum ${minimum}, multiple ${multiple}. ${check.detail}`
            : check.code === 'large_price_change'
              ? `Price change ${priceChangePercent.toFixed(1)}%. ${check.detail}`
              : `${check.title}: ${check.detail}`;
    add(
      check.code,
      check.status,
      check.detail.startsWith('Cannot evaluate')
        ? `${check.title}: ${check.detail}`
        : message,
      [...new Set(check.fields.flatMap((field) => ruleEvidence[field]))],
    );
  }
  if (supplier.fundingStatus === 'unverified') {
    add(
      'funding_unverified',
      'attention',
      'Unverified supplier funding is excluded from the margin calculation.',
      [supplier.evidenceId],
    );
  }

  if (topUp > 0) {
    const arrival = reviewTime + supplier.leadTimeHours * 3_600_000;
    const cutoff = Math.min(
      Date.parse(campaign.topUpCutoffAt),
      Date.parse(supplier.topUpCutoffAt),
    );
    add(
      'supplier_allocation',
      topUp <= supplier.confirmedAdditionalAllocationUnits ? 'pass' : 'block',
      `Top-up ${topUp}; confirmed additional allocation ${supplier.confirmedAdditionalAllocationUnits}.`,
      [supplier.evidenceId],
    );
    add(
      'supplier_timing',
      reviewTime <= cutoff && arrival <= Date.parse(startsAt)
        ? 'pass'
        : 'block',
      `Supplier lead time ${supplier.leadTimeHours} hours from review; launch ${startsAt}.`,
      [supplier.evidenceId, scenario.promotionBrief.evidenceId],
    );
  }

  const mismatched = channel.channels.filter(
    (state) =>
      state.status !== 'ready' ||
      state.promotionalSellingPricePence !== price ||
      !sameInstant(state.startsAt, startsAt) ||
      !sameInstant(state.endsAt, endsAt),
  );
  if (mismatched.length > 0) {
    add(
      'channel_staging',
      'attention',
      `Staged channel values need review: ${mismatched.map(({ channel: name }) => name).join(', ')}.`,
      [channel.evidenceId],
    );
  }

  const verdict = checks.some(({ status }) => status === 'block')
    ? 'blocked'
    : checks.some(({ status }) => status === 'attention')
      ? 'review_required'
      : 'passes_checks';
  return {
    basis,
    pricePence: price,
    topUpUnits: topUp,
    marginPercent: Number(marginPercent.toFixed(1)),
    verdict,
    checks,
  };
}
