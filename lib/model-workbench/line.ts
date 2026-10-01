import { z } from 'zod';

import {
  SCENARIO_ID,
  skuSchema,
  type ScenarioEvidencePack,
  type Sku,
} from '@/lib/promotion-release/schemas';

const certaintySchema = z.enum(['low', 'medium', 'high']);

export const lineSuggestionSchema = z
  .strictObject({
    sku: skuSchema,
    recommendation: z.enum(['release', 'adjust', 'hold', 'exclude']),
    proposedPricePence: z.number().int().positive().nullable(),
    proposedTopUpUnits: z.number().int().nonnegative().nullable(),
    rationale: z.string().trim().min(1).max(1_000),
    uncertainties: z.array(z.string().trim().min(1).max(500)).max(5),
    evidenceRefs: z
      .array(z.string().regex(/^ev-[a-z0-9-]+$/))
      .min(1)
      .max(20),
    selfReportedCertainty: certaintySchema,
  })
  .superRefine((suggestion, context) => {
    const proposes =
      suggestion.recommendation === 'release' ||
      suggestion.recommendation === 'adjust';
    const hasPrice = suggestion.proposedPricePence !== null;
    const hasTopUp = suggestion.proposedTopUpUnits !== null;
    if (proposes ? !hasPrice || !hasTopUp : hasPrice || hasTopUp) {
      context.addIssue({
        code: 'custom',
        path: ['proposedPricePence'],
        message:
          'Release and adjust need a price and top-up; hold and exclude need neither.',
      });
    }
  });

export type LineSuggestion = z.infer<typeof lineSuggestionSchema>;

function requiredRecord<T extends { sku: Sku }>(records: T[], sku: Sku): T {
  const record = records.find((item) => item.sku === sku);
  if (!record) throw new Error(`Validated scenario is missing ${sku}.`);
  return record;
}

export function buildLinePreview(scenario: ScenarioEvidencePack, sku: Sku) {
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

  const input = {
    schemaVersion: 1,
    scenarioId: SCENARIO_ID,
    fixtureVersion: scenario.promotionBrief.fixtureVersion,
    sku,
    campaign: {
      reviewAt: scenario.promotionBrief.campaign.reviewAt,
      startsAt: scenario.promotionBrief.campaign.startsAt,
      endsAt: scenario.promotionBrief.campaign.endsAt,
      topUpCutoffAt: scenario.promotionBrief.campaign.topUpCutoffAt,
      objective: scenario.promotionBrief.campaign.objective,
      evidenceId: scenario.promotionBrief.evidenceId,
    },
    candidate: {
      status: brief.status,
      statusReason: brief.statusReason,
      intendedPricePence: brief.intendedPromotionalSellingPricePence,
      expectedUpliftPercent: brief.expectedUpliftPercent,
      approvalReference: shortlist.approvalReference,
      evidenceId: shortlist.evidenceId,
    },
    product: {
      name: catalogue.productName,
      unit: catalogue.unitDescription,
      regularPricePence: catalogue.regularSellingPricePence,
      costPence: catalogue.costPricePence,
      evidenceId: catalogue.evidenceId,
    },
    demand:
      demand.kind === 'available'
        ? {
            kind: demand.kind,
            recentWeeklySalesUnits: demand.recentWeeklySalesUnits,
            forecastUnits: demand.promotionAdjustedForecastUnits,
            sourceConfidence: demand.forecastConfidence,
            upliftAlreadyIncluded: demand.upliftAlreadyIncluded,
            evidenceId: demand.evidenceId,
          }
        : {
            kind: demand.kind,
            reason: demand.reason,
            evidenceId: demand.evidenceId,
          },
    supply:
      supply.kind === 'available'
        ? {
            kind: supply.kind,
            stockOnHandUnits: supply.stockOnHandUnits,
            reservedUnits: supply.reservedUnits,
            confirmedInboundUnits: supply.confirmedInboundBeforeLaunchUnits,
            earlierOrderUnits: supply.earlierPromotionOrderUnits,
            openAmendmentUnits: supply.openTopUpAmendmentUnits,
            safetyStockUnits: supply.safetyStockUnits,
            availableBeforeLaunchUnits,
            requiredUnits,
            shortfallUnits,
            evidenceId: supply.evidenceId,
          }
        : {
            kind: supply.kind,
            reason: supply.reason,
            evidenceId: supply.evidenceId,
          },
    supplier: {
      leadTimeHours: supplier.leadTimeHours,
      minimumTopUpUnits: supplier.minimumOrderQuantityUnits,
      orderMultipleUnits: supplier.orderMultipleUnits,
      confirmedAllocationUnits: supplier.confirmedAdditionalAllocationUnits,
      topUpCutoffAt: supplier.topUpCutoffAt,
      fundingStatus: supplier.fundingStatus,
      fundingPencePerUnit: supplier.fundingPencePerUnit,
      evidenceId: supplier.evidenceId,
    },
    channels: {
      states: channel.channels,
      evidenceId: channel.evidenceId,
    },
    rules: {
      minimumMarginPercent: scenario.policyRules.minimumMarginPercent,
      individualApprovalPriceChangePercent:
        scenario.policyRules.individualApprovalPriceChangePercent,
      maximumEvidenceAgeHours: scenario.policyRules.maximumEvidenceAgeHours,
      evidenceId: scenario.policyRules.evidenceId,
    },
    notes: notes.map(({ evidenceId, noteType, text }) => ({
      evidenceId,
      noteType,
      text,
    })),
  };

  const sources = [
    {
      name: 'Promotion brief',
      value: {
        evidenceId: scenario.promotionBrief.evidenceId,
        sourceLabel: scenario.promotionBrief.sourceLabel,
        observedAt: scenario.promotionBrief.observedAt,
        campaign: scenario.promotionBrief.campaign,
        candidate: brief,
      },
    },
    { name: 'Approved shortlist', value: shortlist },
    { name: 'Catalogue and pricebook', value: catalogue },
    { name: 'Demand', value: demand },
    { name: 'Supply', value: supply },
    { name: 'Supplier terms', value: supplier },
    { name: 'Channel state', value: channel },
    { name: 'Policy rules', value: scenario.policyRules },
    ...notes.map((note) => ({ name: `Note: ${note.noteType}`, value: note })),
  ];
  return { sku, productName: catalogue.productName, input, sources };
}

export type LinePreview = ReturnType<typeof buildLinePreview>;

export function inspectLineSuggestion(
  output: unknown,
  preview: LinePreview,
): { suggestion: LineSuggestion | null; issues: string[] } {
  const parsed = lineSuggestionSchema.safeParse(output);
  if (!parsed.success) {
    return {
      suggestion: null,
      issues: parsed.error.issues.map(
        ({ path, message }) => `${path.join('.') || 'suggestion'}: ${message}`,
      ),
    };
  }
  const issues: string[] = [];
  if (parsed.data.sku !== preview.sku) {
    issues.push(`Expected ${preview.sku}, received ${parsed.data.sku}.`);
  }
  const known = new Set([
    preview.input.campaign.evidenceId,
    preview.input.candidate.evidenceId,
    preview.input.product.evidenceId,
    preview.input.demand.evidenceId,
    preview.input.supply.evidenceId,
    preview.input.supplier.evidenceId,
    preview.input.channels.evidenceId,
    preview.input.rules.evidenceId,
    ...preview.input.notes.map(({ evidenceId }) => evidenceId),
  ]);
  const unknownRefs = parsed.data.evidenceRefs.filter((id) => !known.has(id));
  if (unknownRefs.length > 0) {
    issues.push(`Unknown evidence references: ${unknownRefs.join(', ')}.`);
  }
  if (
    new Set(parsed.data.evidenceRefs).size !== parsed.data.evidenceRefs.length
  ) {
    issues.push('Evidence references contain duplicates.');
  }
  return { suggestion: issues.length === 0 ? parsed.data : null, issues };
}

type Check = {
  code: string;
  status: 'pass' | 'attention' | 'block';
  message: string;
  evidenceRefs: string[];
};

export function evaluateLineChecks(
  preview: LinePreview,
  suggestion: LineSuggestion,
) {
  const { input, sources } = preview;
  const checks: Check[] = [];
  const add = (
    code: string,
    status: Check['status'],
    message: string,
    evidenceRefs: string[],
  ) => checks.push({ code, status, message, evidenceRefs });
  const price =
    suggestion.proposedPricePence ?? input.candidate.intendedPricePence;
  const shortfall =
    input.supply.kind === 'available' ? input.supply.shortfallUnits : null;
  const minimum = input.supplier.minimumTopUpUnits;
  const multiple = input.supplier.orderMultipleUnits;
  const baselineTopUp =
    shortfall === null || shortfall === 0
      ? 0
      : Math.ceil(Math.max(minimum, shortfall) / multiple) * multiple;
  const topUp = suggestion.proposedTopUpUnits ?? baselineTopUp;
  const basis =
    suggestion.proposedPricePence === null
      ? 'brief_baseline'
      : 'model_proposal';

  add(
    'candidate_status',
    input.candidate.status === 'approved' ? 'pass' : 'block',
    input.candidate.status === 'approved'
      ? 'Candidate remains approved.'
      : `Candidate was withdrawn: ${input.candidate.statusReason}`,
    [input.campaign.evidenceId],
  );

  const unavailable = [input.demand, input.supply].filter(
    (record) => record.kind === 'unavailable',
  );
  add(
    'source_availability',
    unavailable.length === 0 ? 'pass' : 'block',
    unavailable.length === 0
      ? 'Demand and supply records are available.'
      : `Required records unavailable: ${unavailable.map((record) => record.reason).join(' ')}`,
    unavailable.map(({ evidenceId }) => evidenceId),
  );

  const reviewTime = Date.parse(input.campaign.reviewAt);
  const stale = sources
    .filter(({ name }) => name !== 'Policy rules' && !name.startsWith('Note:'))
    .filter(({ value }) => {
      const observedAt = value.observedAt;
      return (
        reviewTime - Date.parse(observedAt) >
          input.rules.maximumEvidenceAgeHours * 3_600_000 ||
        Date.parse(observedAt) > reviewTime
      );
    });
  add(
    'source_freshness',
    stale.length === 0 ? 'pass' : 'block',
    stale.length === 0
      ? 'Required source records are within the configured age limit.'
      : `Stale or future-dated sources: ${stale.map(({ name }) => name).join(', ')}.`,
    stale.map(({ value }) => value.evidenceId),
  );

  const datesValid =
    reviewTime < Date.parse(input.campaign.startsAt) &&
    Date.parse(input.campaign.startsAt) < Date.parse(input.campaign.endsAt);
  add(
    'promotion_dates',
    datesValid ? 'pass' : 'block',
    datesValid
      ? 'Promotion dates are ordered.'
      : 'Promotion dates are invalid.',
    [input.campaign.evidenceId],
  );

  add(
    'price_below_regular',
    price < input.product.regularPricePence ? 'pass' : 'block',
    `${price}p proposed against ${input.product.regularPricePence}p regular price.`,
    [input.product.evidenceId, input.campaign.evidenceId],
  );

  const confirmedFunding =
    input.supplier.fundingStatus === 'confirmed'
      ? input.supplier.fundingPencePerUnit
      : 0;
  const marginPercent =
    ((price - input.product.costPence + confirmedFunding) / price) * 100;
  add(
    'minimum_margin',
    marginPercent >= input.rules.minimumMarginPercent ? 'pass' : 'block',
    `Confirmed-funding margin ${marginPercent.toFixed(1)}%; floor ${input.rules.minimumMarginPercent}%.`,
    [
      input.product.evidenceId,
      input.supplier.evidenceId,
      input.rules.evidenceId,
    ],
  );
  if (input.supplier.fundingStatus === 'unverified') {
    add(
      'funding_unverified',
      'attention',
      'Unverified supplier funding is excluded from the margin calculation.',
      [input.supplier.evidenceId],
    );
  }

  if (shortfall !== null) {
    add(
      'stock_coverage',
      topUp >= shortfall ? 'pass' : 'block',
      `Forecast plus safety stock needs ${input.supply.requiredUnits} units; ${input.supply.availableBeforeLaunchUnits} are covered before top-up. Shortfall ${shortfall}, proposed top-up ${topUp}.`,
      [input.demand.evidenceId, input.supply.evidenceId],
    );
  }

  const validOrder =
    topUp === 0 || (topUp >= minimum && topUp % multiple === 0);
  add(
    'order_terms',
    validOrder ? 'pass' : 'block',
    `Top-up ${topUp}; supplier minimum ${minimum}, multiple ${multiple}.`,
    [input.supplier.evidenceId],
  );
  if (topUp > 0) {
    const arrival = reviewTime + input.supplier.leadTimeHours * 3_600_000;
    const cutoff = Math.min(
      Date.parse(input.campaign.topUpCutoffAt),
      Date.parse(input.supplier.topUpCutoffAt),
    );
    add(
      'supplier_allocation',
      topUp <= input.supplier.confirmedAllocationUnits ? 'pass' : 'block',
      `Top-up ${topUp}; confirmed additional allocation ${input.supplier.confirmedAllocationUnits}.`,
      [input.supplier.evidenceId],
    );
    add(
      'supplier_timing',
      reviewTime <= cutoff && arrival <= Date.parse(input.campaign.startsAt)
        ? 'pass'
        : 'block',
      `Supplier lead time ${input.supplier.leadTimeHours} hours from review; launch ${input.campaign.startsAt}.`,
      [input.supplier.evidenceId, input.campaign.evidenceId],
    );
  }

  const mismatched = input.channels.states.filter(
    (channel) =>
      channel.status !== 'ready' ||
      (channel.status === 'ready' &&
        (channel.promotionalSellingPricePence !== price ||
          channel.startsAt !== input.campaign.startsAt ||
          channel.endsAt !== input.campaign.endsAt)),
  );
  if (mismatched.length > 0) {
    add(
      'channel_staging',
      'attention',
      `Staged channel values need review: ${mismatched.map(({ channel }) => channel).join(', ')}.`,
      [input.channels.evidenceId],
    );
  }

  const priceChangePercent =
    ((input.product.regularPricePence - price) /
      input.product.regularPricePence) *
    100;
  if (priceChangePercent > input.rules.individualApprovalPriceChangePercent) {
    add(
      'large_price_change',
      'attention',
      `Price change ${priceChangePercent.toFixed(1)}% exceeds the ${input.rules.individualApprovalPriceChangePercent}% individual-review threshold.`,
      [input.product.evidenceId, input.rules.evidenceId],
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
