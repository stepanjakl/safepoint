import {
  EXPECTED_SKUS,
  type ReviewedReplay,
  type ReviewLine,
  type ReviewOutcome,
  type Sku,
} from '../promotion-release';

/*
  The presenter turns the validated replay into serialisable strings and
  numbers for the interface. It performs display arithmetic that the fixture
  README documents (projected margin, available supply) and labels every such
  value as derived. It never decides eligibility: the policy result is always
  the replayed finding.
*/

export type ReviewPresentation = {
  batch: BatchPresentation;
  categories: CategoryGroup[];
  candidates: CandidateRow[];
  details: Record<Sku, LineDetail>;
};

export type BatchPresentation = {
  title: string;
  mode: 'replay';
  fixtureVersion: string;
  reviewedAtLabel: string;
  labelDeadlineLabel: string;
  topUpCutoffLabel: string;
  remainingLabel: string;
  counts: {
    evaluated: number;
    ready: number;
    needsAttention: number;
    nonReleasable: number;
    held: number;
    excluded: number;
    unverifiable: number;
  };
  reviewer: {
    approved: number;
    held: number;
    rejected: number;
    pending: number;
  };
};

export type CategoryGroup = {
  id: ReviewLine['catalogue']['category'];
  label: string;
  skus: Sku[];
};

export type CandidateRow = {
  sku: Sku;
  name: string;
  unit: string;
  categoryLabel: string;
  outcome: ReviewOutcome;
  outcomeLabel: string;
  reason: string;
};

export type AgentRecommendation =
  ReviewLine['agentAssessment']['agentRecommendation'];
export type PolicyEligibility = ReviewLine['policyEvaluation']['eligibility'];
export type Gate =
  ReviewLine['agentAssessment']['gateAssessments'][number]['gate'];
export type GateResult =
  ReviewLine['agentAssessment']['gateAssessments'][number]['result'];
export type GateObligation =
  ReviewLine['policyEvaluation']['gateObligations'][number]['obligation'];
export type AdapterMode = 'live_sandbox' | 'simulated' | 'preview_only';

export type PresentedFinding = {
  id: string;
  title: string;
  severity: 'info' | 'warning' | 'blocking';
  consequence: 'none' | 'individual_approval' | 'block';
  explanation: string;
  evidence: EvidenceRef[];
};

export type EvidenceRef = {
  id: string;
  sourceLabel: string;
  observedAtLabel: string;
};

export type ValueRow = {
  label: string;
  current: string | null;
  proposed: string;
  note: string | null;
};

export type EffectNode = {
  id: string;
  destination: string;
  mode: AdapterMode;
  modeLabel: string;
  state: 'planned';
  stateLabel: string;
  undo: string;
};

export type PresentedGate = {
  gate: Gate;
  label: string;
  result: GateResult;
  resultLabel: string;
  obligation: GateObligation;
  obligationLabel: string;
  explanation: string;
  obligationReason: string;
  evidence: EvidenceRef[];
  openByDefault: boolean;
};

export type SourceRecord = {
  id: string;
  sourceLabel: string;
  observedAtLabel: string;
  facts: string[];
};

export type LineDetail = {
  sku: Sku;
  name: string;
  unit: string;
  categoryLabel: string;
  supplierLabel: string;
  outcome: ReviewOutcome;
  outcomeLabel: string;
  agent: {
    recommendation: AgentRecommendation;
    recommendationLabel: string;
    rationale: string;
    uncertainties: string[];
  };
  policy: {
    eligibility: PolicyEligibility;
    eligibilityLabel: string;
    summary: string;
    findings: PresentedFinding[];
    reviewerConsequence: string;
    nextAction: string;
  };
  margin: {
    projectedPercent: number;
    projectedLabel: string;
    floorPercent: number;
    floorLabel: string;
    meetsFloor: boolean;
    basis: string;
  } | null;
  values: ValueRow[] | null;
  effects: EffectNode[] | null;
  noProposalReason: string | null;
  gates: PresentedGate[];
  gateSummary: string;
  evidence: {
    note: {
      sourceLabel: string;
      observedAtLabel: string;
      text: string;
    } | null;
    agentInterpretation: string;
    sourceFact: string;
    policyConsequence: string;
    sources: SourceRecord[];
  };
  actionNote: string;
};

const CATEGORY_LABELS: Record<CategoryGroup['id'], string> = {
  fruit: 'Fruit',
  vegetables_and_salad: 'Vegetables and salad',
  bakery: 'Bakery',
  dairy_and_chilled: 'Dairy and chilled',
  meat_fish_and_plant: 'Meat, fish and plant',
};

const OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  ready: 'Ready',
  needs_attention: 'Needs attention',
  held: 'Held',
  excluded: 'Excluded',
  unverifiable: 'Unverifiable',
};

const RECOMMENDATION_LABELS: Record<AgentRecommendation, string> = {
  release: 'Release',
  adjust: 'Adjust',
  hold: 'Hold',
  exclude: 'Exclude',
};

const ELIGIBILITY_LABELS: Record<PolicyEligibility, string> = {
  eligible: 'Eligible',
  blocked: 'Blocked',
};

type FindingCode = ReviewLine['policyEvaluation']['findings'][number]['code'];

const FINDING_TITLES: Record<FindingCode, string> = {
  late_supply: 'Supply arrives after launch',
  unconfirmed_allocation: 'Allocation not confirmed',
  margin_below_floor: 'Margin below floor',
  funding_unverified: 'Funding unverified',
  promotion_withdrawn: 'Withdrawn from the brief',
  required_evidence_unavailable: 'Required evidence unavailable',
  uplift_already_included: 'Uplift already in forecast',
  existing_supply_covers_demand: 'Existing supply covers demand',
  invalid_order_multiple_corrected: 'Order multiple corrected',
  channel_dates_corrected: 'Channel dates corrected',
  alternative_safe_plan: 'Alternative safe plan',
  large_price_change: 'Large price change',
};

const NEXT_ACTIONS: Partial<Record<FindingCode, string>> = {
  margin_below_floor: 'Hold, or obtain written funding confirmation',
  funding_unverified: 'Hold, or obtain written funding confirmation',
  late_supply: 'Hold until supply can arrive before launch',
  unconfirmed_allocation: 'Hold until the allocation is confirmed',
  promotion_withdrawn: 'No action; the line stays excluded',
  required_evidence_unavailable: 'Hold until the supply position is verified',
};

const GATE_LABELS: Record<Gate, string> = {
  forecast: 'Forecast',
  inventory: 'Inventory',
  supplier: 'Supplier',
  financial: 'Financial',
  logistics: 'Logistics',
  business_rules: 'Business rules',
  external_signals: 'External signals',
};

const GATE_RESULT_LABELS: Record<GateResult, string> = {
  passed: 'Passed',
  failed: 'Failed',
  not_checked: 'Not checked',
  evidence_unavailable: 'Evidence unavailable',
  not_applicable: 'Not applicable',
};

const OBLIGATION_LABELS: Record<GateObligation, string> = {
  required: 'Required',
  advisory: 'Advisory',
  not_applicable: 'Not applicable',
};

const MODE_LABELS: Record<AdapterMode, string> = {
  live_sandbox: 'Live sandbox',
  simulated: 'Simulated',
  preview_only: 'Preview only',
};

type SemanticAction = NonNullable<
  ReviewLine['agentAssessment']['proposed']
>['semanticActions'][number];

/*
  Scenario-specific destinations for the Fresh Food Weekend demonstration.
  Stage 3's effect planner replaces this table; it is not a universal mapping.
*/
const EFFECT_DESTINATIONS: Record<
  SemanticAction,
  { destination: string; mode: AdapterMode; undo: string }
> = {
  update_promotion_record: {
    destination: 'Promotion pricebook · Google Sheet',
    mode: 'live_sandbox',
    undo: 'Restores automatically if the row has not changed again.',
  },
  record_top_up_recommendation: {
    destination: 'Top-up order draft · Google Sheet',
    mode: 'live_sandbox',
    undo: 'Restores automatically if the row has not changed again.',
  },
  schedule_storefront_promotion: {
    destination: 'Storefront sandbox',
    mode: 'live_sandbox',
    undo: 'Restores automatically before a later promotion replaces it.',
  },
  queue_labels: {
    destination: 'Label queue · Google Sheet',
    mode: 'live_sandbox',
    undo: 'Can be removed until label production begins at 06:00.',
  },
  release_top_up_amendment: {
    destination: 'Supplier order system',
    mode: 'simulated',
    undo: 'Applied in simulation only; nothing to undo.',
  },
  send_notification: {
    destination: 'Supplier notification',
    mode: 'preview_only',
    undo: 'Cannot be unsent; a correction would be a new message.',
  },
};

export function presentReview(replay: ReviewedReplay): ReviewPresentation {
  const evidenceIndex = buildEvidenceIndex(replay);
  const campaign = replay.scenario.promotionBrief.campaign;
  const floorPercent = replay.scenario.policyRules.minimumMarginPercent;
  const priceChangeThreshold =
    replay.scenario.policyRules.individualApprovalPriceChangePercent;

  const candidates = replay.lines.map(presentCandidateRow);
  const details = Object.fromEntries(
    replay.lines.map((line) => [
      line.sku,
      presentLineDetail(line, {
        evidenceIndex,
        floorPercent,
        priceChangeThreshold,
        campaignStartsAt: campaign.startsAt,
      }),
    ]),
  ) as Record<Sku, LineDetail>;

  const categories: CategoryGroup[] = (
    Object.keys(CATEGORY_LABELS) as CategoryGroup['id'][]
  )
    .map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      skus: replay.lines
        .filter((line) => line.catalogue.category === id)
        .map((line) => line.sku),
    }))
    .filter((group) => group.skus.length > 0);

  const summary = replay.summary;

  return {
    batch: {
      title: campaign.name,
      mode: replay.mode,
      fixtureVersion: replay.fixtureVersion,
      reviewedAtLabel: formatLondonDateTime(campaign.reviewAt),
      labelDeadlineLabel: formatLondonDateTime(campaign.labelDeadlineAt),
      topUpCutoffLabel: formatLondonTime(campaign.topUpCutoffAt),
      remainingLabel: formatDuration(
        Date.parse(campaign.labelDeadlineAt) - Date.parse(campaign.reviewAt),
      ),
      counts: {
        evaluated: summary.total,
        ready: summary.ready,
        needsAttention: summary.needsAttention,
        nonReleasable: summary.nonReleasable,
        held: summary.held,
        excluded: summary.excluded,
        unverifiable: summary.unverifiable,
      },
      reviewer: { approved: 0, held: 0, rejected: 0, pending: summary.total },
    },
    categories,
    candidates,
    details,
  };
}

function presentCandidateRow(line: ReviewLine): CandidateRow {
  return {
    sku: line.sku,
    name: line.catalogue.productName,
    unit: line.catalogue.unitDescription,
    categoryLabel: CATEGORY_LABELS[line.catalogue.category],
    outcome: line.outcome,
    outcomeLabel: OUTCOME_LABELS[line.outcome],
    reason: candidateReason(line),
  };
}

function candidateReason(line: ReviewLine): string {
  const findings = line.policyEvaluation.findings;
  const blocking = findings.find((f) => f.approvalConsequence === 'block');
  const attention = findings.find(
    (f) => f.approvalConsequence === 'individual_approval',
  );
  const proposed = line.agentAssessment.proposed;

  switch (line.outcome) {
    case 'ready':
      return proposed
        ? `Eligible · release at ${formatMoney(proposed.promotionalSellingPricePence)}`
        : 'Eligible';
    case 'needs_attention':
      return attention
        ? FINDING_TITLES[attention.code]
        : 'Individual attention';
    case 'held':
    case 'unverifiable':
    case 'excluded':
      return blocking
        ? FINDING_TITLES[blocking.code]
        : OUTCOME_LABELS[line.outcome];
  }
}

type LineContext = {
  evidenceIndex: Map<string, EvidenceRef>;
  floorPercent: number;
  priceChangeThreshold: number;
  campaignStartsAt: string;
};

function presentLineDetail(line: ReviewLine, context: LineContext): LineDetail {
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
  const other = gates.length - passed - failed;
  const gateSummary = [
    `${passed} passed`,
    failed > 0 ? `${failed} failed` : null,
    other > 0 ? `${other} not checked or not applicable` : null,
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
    meetsFloor: projectedPercent >= floorPercent,
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
      label: 'Promotional price',
      current: currentLabel,
      proposed: formatMoney(proposed.promotionalSellingPricePence),
      note: exceedsThreshold
        ? `${changeLabel} · above the ${formatPercent(priceChangeThreshold)} individual-review threshold`
        : changeLabel,
    },
    {
      label: 'Cost price',
      current: null,
      proposed: formatMoney(catalogue.costPricePence),
      note: 'Source: catalogue and pricebook',
    },
    {
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
      label: 'Final top-up',
      current: null,
      proposed:
        proposed.recommendedTopUpQuantityUnits === 0
          ? 'No top-up'
          : `${formatUnits(proposed.recommendedTopUpQuantityUnits)}`,
      note: `MOQ ${supplier.minimumOrderQuantityUnits} · multiples of ${supplier.orderMultipleUnits} · cutoff ${formatLondonTime(supplier.topUpCutoffAt)}`,
    },
    {
      label: 'Promotion window',
      current: null,
      proposed: `${formatLondonDateTime(proposed.startsAt)} → ${formatLondonDateTime(proposed.endsAt)}`,
      note: 'Europe/London',
    },
  ];

  if (demand.kind === 'available') {
    rows.push({
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

function presentEvidence(
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

function buildEvidenceIndex(replay: ReviewedReplay): Map<string, EvidenceRef> {
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

function resolveEvidence(
  ids: string[],
  index: Map<string, EvidenceRef>,
): EvidenceRef[] {
  return ids.map(
    (id) =>
      index.get(id) ?? { id, sourceLabel: id, observedAtLabel: 'unknown time' },
  );
}

// Formatting

const londonParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partsOf(iso: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of londonParts.formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return parts;
}

export function formatLondonDateTime(iso: string): string {
  const p = partsOf(iso);
  const month = (p.month ?? '').replace(/\.$/, '').slice(0, 3);
  return `${p.weekday} ${p.day} ${month} ${p.hour}:${p.minute}`;
}

export function formatLondonTime(iso: string): string {
  const p = partsOf(iso);
  return `${p.hour}:${p.minute}`;
}

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatPercent(percent: number): string {
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

function formatSignedPercent(percent: number): string {
  const rounded = Math.round(Math.abs(percent) * 10) / 10;
  const sign = percent < 0 ? '−' : percent > 0 ? '+' : '';
  return `${sign}${formatPercent(rounded)}`;
}

function formatUnits(units: number): string {
  return `${units.toLocaleString('en-GB')} units`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Route parameter parsing

export function parseSkuParam(
  value: string | string[] | null | undefined,
): Sku | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && (EXPECTED_SKUS as readonly string[]).includes(candidate)
    ? (candidate as Sku)
    : null;
}
