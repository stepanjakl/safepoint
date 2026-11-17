import { type ReviewLine } from '../promotion-release';
import { presentEvidence, resolveEvidence } from './evidence';
import {
  formatLondonDateTime,
  formatLondonTime,
  formatMoney,
  formatPercent,
  formatSignedPercent,
  formatUnits,
} from './format';
import {
  EFFECT_DESTINATIONS,
  ELIGIBILITY_LABELS,
  FINDING_TITLES,
  GATE_LABELS,
  GATE_RESULT_LABELS,
  MODE_LABELS,
  NEXT_ACTIONS,
  OBLIGATION_LABELS,
  OUTCOME_LABELS,
  RECOMMENDATION_LABELS,
} from './labels';
import {
  CATEGORY_LABELS,
  type EvidenceRef,
  type LineContext,
  type LineDetail,
  type PresentedGate,
  type ValueRow,
} from './types';

/* One candidate line in full: its verdict, the values it was judged on, its
   gates and its effects. Display arithmetic is labelled as derived. */

export function presentLineDetail(
  line: ReviewLine,
  context: LineContext,
): LineDetail {
  const { agentAssessment, policyEvaluation, catalogue, supplier } = line;
  const proposed = agentAssessment.proposed;
  const findings = policyEvaluation.findings.map((finding) => ({
    id: finding.id,
    title: FINDING_TITLES[finding.code],
    severity: finding.severity,
    consequence: finding.approvalConsequence,
    explanation: finding.explanation,
    evidence: resolveEvidence(finding.evidenceRefs, context.evidenceIndex),
  }));
  const blockingFinding = policyEvaluation.findings.find(
    (f) => f.approvalConsequence === 'block',
  );
  const attentionFinding = policyEvaluation.findings.find(
    (f) => f.approvalConsequence === 'individual_approval',
  );
  const leadFinding = blockingFinding ?? attentionFinding ?? null;

  const reviewerConsequence =
    policyEvaluation.eligibility === 'blocked'
      ? 'Approval unavailable until the blocking condition changes'
      : attentionFinding
        ? 'Individual approval required'
        : 'Eligible for approval';

  const nextAction =
    policyEvaluation.eligibility === 'blocked'
      ? ((leadFinding && NEXT_ACTIONS[leadFinding.code]) ??
        'Hold until the blocking condition changes')
      : attentionFinding
        ? 'Review the adjustment, then approve individually'
        : 'Approve with the safe remainder';

  const margin = proposed
    ? presentMargin({
        sellingPence: proposed.promotionalSellingPricePence,
        costPence: catalogue.costPricePence,
        fundingStatus: supplier.fundingStatus,
        fundingPence: supplier.fundingPencePerUnit,
        floorPercent: context.floorPercent,
      })
    : null;

  const gates = presentGates(line, context.evidenceIndex);
  const passed = gates.filter((g) => g.result === 'passed').length;
  const failed = gates.filter((g) => g.result === 'failed').length;
  const unavailable = gates.filter(
    (g) => g.result === 'evidence_unavailable',
  ).length;
  const notChecked = gates.filter((g) => g.result === 'not_checked').length;
  const notApplicable = gates.filter(
    (g) => g.result === 'not_applicable',
  ).length;
  const gateSummary = [
    `${passed} passed`,
    failed > 0 ? `${failed} failed` : null,
    unavailable > 0 ? `${unavailable} evidence unavailable` : null,
    notChecked > 0 ? `${notChecked} not checked` : null,
    notApplicable > 0 ? `${notApplicable} not applicable` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const noProposalReason = proposed
    ? null
    : `${RECOMMENDATION_LABELS[agentAssessment.agentRecommendation]}: nothing is planned for this line. ${agentAssessment.rationale}`;

  return {
    sku: line.sku,
    name: catalogue.productName,
    unit: catalogue.unitDescription,
    categoryLabel: CATEGORY_LABELS[catalogue.category],
    supplierLabel: `${supplier.supplierId} · ${supplier.supplierName}`,
    outcome: line.outcome,
    outcomeLabel: OUTCOME_LABELS[line.outcome],
    agent: {
      recommendation: agentAssessment.agentRecommendation,
      recommendationLabel:
        RECOMMENDATION_LABELS[agentAssessment.agentRecommendation],
      rationale: agentAssessment.rationale,
      uncertainties: agentAssessment.uncertainties,
    },
    policy: {
      eligibility: policyEvaluation.eligibility,
      eligibilityLabel: ELIGIBILITY_LABELS[policyEvaluation.eligibility],
      summary:
        findings.length > 0
          ? findings.map((f) => f.title).join(' · ')
          : 'No policy finding',
      findings,
      reviewerConsequence,
      nextAction,
    },
    margin,
    values: proposed
      ? presentValues(line, proposed, context.priceChangeThreshold)
      : null,
    effects: proposed
      ? proposed.semanticActions.map((action) => ({
          id: action,
          destination: EFFECT_DESTINATIONS[action].destination,
          mode: EFFECT_DESTINATIONS[action].mode,
          modeLabel: MODE_LABELS[EFFECT_DESTINATIONS[action].mode],
          state: 'planned' as const,
          stateLabel: 'Planned',
          undo: EFFECT_DESTINATIONS[action].undo,
        }))
      : null,
    noProposalReason,
    gates,
    gateSummary,
    evidence: presentEvidence(line, leadFinding?.code ?? null, context),
    actionNote:
      policyEvaluation.eligibility === 'blocked'
        ? `Approve item is unavailable: policy blocked this line (${leadFinding ? FINDING_TITLES[leadFinding.code].toLowerCase() : 'blocking finding'}). Review actions are not available in this replay preview.`
        : 'Review actions are not available in this replay preview.',
  };
}

function presentMargin({
  sellingPence,
  costPence,
  fundingStatus,
  fundingPence,
  floorPercent,
}: {
  sellingPence: number;
  costPence: number;
  fundingStatus: ReviewLine['supplier']['fundingStatus'];
  fundingPence: number;
  floorPercent: number;
}): NonNullable<LineDetail['margin']> {
  // Funded unit margin per the fixture README: unverified or not-offered
  // funding contributes zero until confirmed.
  const confirmedFundingPence =
    fundingStatus === 'confirmed' ? fundingPence : 0;
  const projected =
    ((sellingPence - costPence + confirmedFundingPence) / sellingPence) * 100;
  const projectedPercent = Math.round(projected * 10) / 10;
  const fundingNote =
    fundingStatus === 'confirmed'
      ? 'confirmed funding'
      : fundingStatus === 'unverified'
        ? 'funding (unverified counts as £0.00)'
        : 'funding (none offered)';

  return {
    projectedPercent,
    projectedLabel: formatPercent(projectedPercent),
    floorPercent,
    floorLabel: formatPercent(floorPercent),
    meetsFloor: projected >= floorPercent,
    basis: `${formatMoney(sellingPence)} selling − ${formatMoney(costPence)} cost + ${formatMoney(confirmedFundingPence)} ${fundingNote}, ÷ ${formatMoney(sellingPence)}`,
  };
}

function presentValues(
  line: ReviewLine,
  proposed: NonNullable<ReviewLine['agentAssessment']['proposed']>,
  priceChangeThreshold: number,
): ValueRow[] {
  const { catalogue, supplier, demand } = line;
  const currentPrice =
    catalogue.currentPromotionalSellingPricePence ??
    catalogue.regularSellingPricePence;
  const currentLabel =
    catalogue.currentPromotionalSellingPricePence === null
      ? `${formatMoney(currentPrice)} regular`
      : `${formatMoney(currentPrice)} current promotion`;
  const changePercent =
    ((proposed.promotionalSellingPricePence -
      catalogue.regularSellingPricePence) /
      catalogue.regularSellingPricePence) *
    100;
  const changeLabel = `${formatSignedPercent(changePercent)} vs regular`;
  const exceedsThreshold = Math.abs(changePercent) > priceChangeThreshold;

  const rows: ValueRow[] = [
    {
      kind: 'change',
      label: 'Promotional price',
      current: currentLabel,
      proposed: formatMoney(proposed.promotionalSellingPricePence),
      note: exceedsThreshold
        ? `${changeLabel} · above the ${formatPercent(priceChangeThreshold)} individual-review threshold`
        : changeLabel,
    },
    {
      kind: 'fact',
      label: 'Cost price',
      current: null,
      proposed: formatMoney(catalogue.costPricePence),
      note: 'Source: catalogue and pricebook',
    },
    {
      kind: 'fact',
      label: 'Supplier funding',
      current: null,
      proposed:
        supplier.fundingStatus === 'not_offered'
          ? 'None offered'
          : `${formatMoney(supplier.fundingPencePerUnit)} per unit`,
      note:
        supplier.fundingStatus === 'confirmed'
          ? 'Confirmed'
          : supplier.fundingStatus === 'unverified'
            ? 'Unverified · counts as £0.00 until confirmed'
            : null,
    },
    {
      kind: 'change',
      label: 'Final top-up',
      current: null,
      proposed:
        proposed.recommendedTopUpQuantityUnits === 0
          ? 'No top-up'
          : `${formatUnits(proposed.recommendedTopUpQuantityUnits)}`,
      note: `MOQ ${supplier.minimumOrderQuantityUnits} · multiples of ${supplier.orderMultipleUnits} · cutoff ${formatLondonTime(supplier.topUpCutoffAt)}`,
    },
    {
      kind: 'change',
      label: 'Promotion window',
      current: null,
      proposed: `${formatLondonDateTime(proposed.startsAt)} → ${formatLondonDateTime(proposed.endsAt)}`,
      note: 'Europe/London',
    },
  ];

  if (demand.kind === 'available') {
    rows.push({
      kind: 'fact',
      label: 'Forecast demand',
      current: `${formatUnits(demand.baselineForecastUnits)} baseline`,
      proposed: `${formatUnits(demand.promotionAdjustedForecastUnits)} promotion-adjusted`,
      note: `Confidence ${demand.forecastConfidence}${demand.upliftAlreadyIncluded ? ' · uplift already included' : ''}`,
    });
  }

  return rows;
}

function presentGates(
  line: ReviewLine,
  evidenceIndex: Map<string, EvidenceRef>,
): PresentedGate[] {
  const obligations = new Map(
    line.policyEvaluation.gateObligations.map((o) => [o.gate, o]),
  );
  return line.agentAssessment.gateAssessments.map((assessment) => {
    const obligation = obligations.get(assessment.gate);
    const result = assessment.result;
    return {
      gate: assessment.gate,
      label: GATE_LABELS[assessment.gate],
      result,
      resultLabel: GATE_RESULT_LABELS[result],
      obligation: obligation?.obligation ?? 'required',
      obligationLabel: OBLIGATION_LABELS[obligation?.obligation ?? 'required'],
      explanation: assessment.explanation,
      obligationReason: obligation?.reason ?? '',
      evidence: resolveEvidence(assessment.evidenceRefs, evidenceIndex),
      openByDefault: result !== 'passed' && result !== 'not_applicable',
    };
  });
}
