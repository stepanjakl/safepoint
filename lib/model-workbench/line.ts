import { z } from 'zod';

import { getLineFacts } from '@/lib/promotion-release/line-policy';
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

export function buildLinePreview(scenario: ScenarioEvidencePack, sku: Sku) {
  const {
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
  } = getLineFacts(scenario, sku);

  const input = {
    schemaVersion: 2,
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
    notes: notes.map(({ evidenceId, noteType, text, trust, claim }) => ({
      evidenceId,
      noteType,
      text,
      trust,
      claim: claim ?? null,
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
