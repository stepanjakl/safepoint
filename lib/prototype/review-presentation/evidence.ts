import { type ReviewLine, type ReviewedReplay } from '../promotion-release';
import {
  capitalise,
  formatLondonDateTime,
  formatMoney,
  formatPercent,
  formatUnits,
} from './format';
import { type FindingCode } from './labels';
import { type EvidenceRef, type LineContext, type LineDetail } from './types';

/* The evidence behind a line: which replayed records each finding rests on,
   resolved to citable references. */

export function presentEvidence(
  line: ReviewLine,
  leadCode: FindingCode | null,
  context: LineContext,
): LineDetail['evidence'] {
  const { supplier, supply, demand, catalogue, brief, channel, shortlist } =
    line;
  const lineNote = line.notes.find((note) => note.noteType !== 'campaign');
  const blocking = line.policyEvaluation.findings.find(
    (f) => f.approvalConsequence === 'block',
  );
  const attention = line.policyEvaluation.findings.find(
    (f) => f.approvalConsequence === 'individual_approval',
  );

  const policyConsequence = blocking
    ? `Blocked. ${blocking.explanation}`
    : attention
      ? `Eligible with individual approval. ${attention.explanation}`
      : 'Eligible. No policy finding applies to this line.';

  return {
    note: lineNote
      ? {
          sourceLabel: lineNote.sourceLabel,
          observedAtLabel: formatLondonDateTime(lineNote.observedAt),
          text: lineNote.text,
        }
      : null,
    agentInterpretation:
      line.agentAssessment.uncertainties.length > 0
        ? line.agentAssessment.uncertainties.join(' ')
        : line.agentAssessment.rationale,
    sourceFact: sourceFactFor(line, leadCode, context),
    policyConsequence,
    sources: [
      {
        id: catalogue.evidenceId,
        sourceLabel: catalogue.sourceLabel,
        observedAtLabel: formatLondonDateTime(catalogue.observedAt),
        facts: [
          `Regular ${formatMoney(catalogue.regularSellingPricePence)}`,
          catalogue.currentPromotionalSellingPricePence === null
            ? 'No current promotion'
            : `Current promotion ${formatMoney(catalogue.currentPromotionalSellingPricePence)}`,
          `Cost ${formatMoney(catalogue.costPricePence)}`,
          `Case of ${catalogue.casePackUnits}`,
        ],
      },
      {
        id: shortlist.evidenceId,
        sourceLabel: shortlist.sourceLabel,
        observedAtLabel: formatLondonDateTime(shortlist.observedAt),
        facts: [
          `Cycle ${shortlist.cycleId}`,
          `Upstream score ${shortlist.upstreamScore}`,
          `Approval ${shortlist.approvalReference}`,
          shortlist.selectionReason,
        ],
      },
      {
        id: 'ev-brief',
        sourceLabel: 'Promotion brief',
        observedAtLabel:
          context.evidenceIndex.get('ev-brief')?.observedAtLabel ?? '',
        facts: [
          `Intended price ${formatMoney(brief.intendedPromotionalSellingPricePence)}`,
          `Expected uplift ${formatPercent(brief.expectedUpliftPercent)}`,
          `Status ${brief.status}${brief.statusReason ? ` · ${brief.statusReason}` : ''}`,
        ],
      },
      demand.kind === 'available'
        ? {
            id: demand.evidenceId,
            sourceLabel: demand.sourceLabel,
            observedAtLabel: formatLondonDateTime(demand.observedAt),
            facts: [
              `Recent weekly sales ${demand.recentWeeklySalesUnits.join(' · ')}`,
              `Baseline ${formatUnits(demand.baselineForecastUnits)} · promotion-adjusted ${formatUnits(demand.promotionAdjustedForecastUnits)}`,
              `Confidence ${demand.forecastConfidence}${demand.upliftAlreadyIncluded ? ' · uplift already included' : ''}`,
              ...(demand.analystCommentary ? [demand.analystCommentary] : []),
            ],
          }
        : {
            id: demand.evidenceId,
            sourceLabel: demand.sourceLabel,
            observedAtLabel: formatLondonDateTime(demand.observedAt),
            facts: [`Unavailable: ${demand.reason}`],
          },
      supply.kind === 'available'
        ? {
            id: supply.evidenceId,
            sourceLabel: supply.sourceLabel,
            observedAtLabel: formatLondonDateTime(supply.observedAt),
            facts: [
              `On hand ${formatUnits(supply.stockOnHandUnits)} · reserved ${formatUnits(supply.reservedUnits)}`,
              `Inbound before launch ${formatUnits(supply.confirmedInboundBeforeLaunchUnits)} · earlier promotion order ${formatUnits(supply.earlierPromotionOrderUnits)} · open amendments ${formatUnits(supply.openTopUpAmendmentUnits)}`,
              `Safety stock ${formatUnits(supply.safetyStockUnits)}`,
              supply.location,
            ],
          }
        : {
            id: supply.evidenceId,
            sourceLabel: supply.sourceLabel,
            observedAtLabel: formatLondonDateTime(supply.observedAt),
            facts: [`Unavailable: ${supply.reason}`],
          },
      {
        id: supplier.evidenceId,
        sourceLabel: supplier.sourceLabel,
        observedAtLabel: formatLondonDateTime(supplier.observedAt),
        facts: [
          `${supplier.supplierId} ${supplier.supplierName}`,
          `Lead time ${supplier.leadTimeHours}h · cutoff ${formatLondonDateTime(supplier.topUpCutoffAt)}`,
          `MOQ ${supplier.minimumOrderQuantityUnits} · multiples of ${supplier.orderMultipleUnits}`,
          `Confirmed additional allocation ${formatUnits(supplier.confirmedAdditionalAllocationUnits)}`,
          `Funding ${supplier.fundingStatus.replace('_', ' ')} · ${formatMoney(supplier.fundingPencePerUnit)} per unit`,
        ],
      },
      {
        id: channel.evidenceId,
        sourceLabel: channel.sourceLabel,
        observedAtLabel: formatLondonDateTime(channel.observedAt),
        facts: channel.channels.map(
          (c) =>
            `${capitalise(c.channel)} ${c.status.replace('_', ' ')}${c.promotionalSellingPricePence !== null ? ` · ${formatMoney(c.promotionalSellingPricePence)}` : ''}${c.startsAt && c.endsAt ? ` · ${formatLondonDateTime(c.startsAt)} → ${formatLondonDateTime(c.endsAt)}` : ''}`,
        ),
      },
      ...line.notes.map((note) => ({
        id: note.evidenceId,
        sourceLabel: `${note.sourceLabel} · ${note.noteType} note · untrusted evidence`,
        observedAtLabel: formatLondonDateTime(note.observedAt),
        facts: [`“${note.text}”`],
      })),
    ],
  };
}

function sourceFactFor(
  line: ReviewLine,
  code: FindingCode | null,
  context: LineContext,
): string {
  const { supplier, supply, demand, catalogue, brief, channel } = line;
  const funding = `Funding status: ${supplier.fundingStatus.replace('_', ' ')} · ${formatMoney(supplier.fundingPencePerUnit)} per unit offered`;

  switch (code) {
    case 'margin_below_floor':
    case 'funding_unverified':
      return funding;
    case 'late_supply':
      return `Lead time ${supplier.leadTimeHours}h · promotion starts ${formatLondonDateTime(context.campaignStartsAt)}`;
    case 'unconfirmed_allocation':
    case 'alternative_safe_plan':
      return `Confirmed additional allocation: ${formatUnits(supplier.confirmedAdditionalAllocationUnits)}`;
    case 'required_evidence_unavailable':
      return supply.kind === 'unavailable'
        ? `Supply position unavailable: ${supply.reason}`
        : demand.kind === 'unavailable'
          ? `Demand evidence unavailable: ${demand.reason}`
          : 'Required evidence unavailable';
    case 'promotion_withdrawn':
      return `Brief status: ${brief.status}${brief.statusReason ? ` · ${brief.statusReason}` : ''}`;
    case 'uplift_already_included':
      return demand.kind === 'available'
        ? `Promotion-adjusted forecast ${formatUnits(demand.promotionAdjustedForecastUnits)} · uplift already included: ${demand.upliftAlreadyIncluded ? 'yes' : 'no'}`
        : 'Demand evidence unavailable';
    case 'existing_supply_covers_demand':
      if (supply.kind !== 'available' || demand.kind !== 'available') {
        return 'Supply or demand evidence unavailable';
      }
      // Available supply per the fixture README arithmetic (derived display value).
      return `Available before launch ${formatUnits(
        supply.stockOnHandUnits -
          supply.reservedUnits +
          supply.confirmedInboundBeforeLaunchUnits +
          supply.earlierPromotionOrderUnits +
          supply.openTopUpAmendmentUnits,
      )} (derived) · forecast ${formatUnits(demand.promotionAdjustedForecastUnits)} + safety ${formatUnits(supply.safetyStockUnits)}`;
    case 'invalid_order_multiple_corrected':
      return `Order multiple ${supplier.orderMultipleUnits} · MOQ ${supplier.minimumOrderQuantityUnits} · case of ${catalogue.casePackUnits}`;
    case 'channel_dates_corrected':
      return channel.channels
        .map((c) => `${capitalise(c.channel)} ${c.status.replace('_', ' ')}`)
        .join(' · ');
    case 'large_price_change':
      return `Regular ${formatMoney(catalogue.regularSellingPricePence)} · brief intended ${formatMoney(brief.intendedPromotionalSellingPricePence)} · threshold ${formatPercent(context.priceChangeThreshold)}`;
    case null:
      return `${funding} · confirmed allocation ${formatUnits(supplier.confirmedAdditionalAllocationUnits)}`;
  }
}

export function buildEvidenceIndex(
  replay: ReviewedReplay,
): Map<string, EvidenceRef> {
  const scenario = replay.scenario;
  const refs: Array<{
    evidenceId: string;
    sourceLabel: string;
    observedAt: string;
  }> = [
    {
      evidenceId: scenario.promotionBrief.evidenceId,
      sourceLabel: scenario.promotionBrief.sourceLabel,
      observedAt: scenario.promotionBrief.observedAt,
    },
    {
      evidenceId: scenario.policyRules.evidenceId,
      sourceLabel: scenario.policyRules.sourceLabel,
      observedAt: scenario.policyRules.observedAt,
    },
    ...scenario.shortlistProvenance.records,
    ...scenario.cataloguePricebook.records,
    ...scenario.demandEvidence.records,
    ...scenario.supplyPosition.records,
    ...scenario.supplierTerms.records,
    ...scenario.operationalNotes.records,
    ...scenario.channelState.records,
  ];
  return new Map(
    refs.map((ref) => [
      ref.evidenceId,
      {
        id: ref.evidenceId,
        sourceLabel: ref.sourceLabel,
        observedAtLabel: formatLondonDateTime(ref.observedAt),
      },
    ]),
  );
}

export function resolveEvidence(
  ids: string[],
  index: Map<string, EvidenceRef>,
): EvidenceRef[] {
  return ids.map(
    (id) =>
      index.get(id) ?? { id, sourceLabel: id, observedAtLabel: 'unknown time' },
  );
}
