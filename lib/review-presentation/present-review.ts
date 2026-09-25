import {
  EXPECTED_SKUS,
  type ReviewLine,
  type ReviewedReplay,
  type Sku,
} from '../promotion-release';
import { buildEvidenceIndex } from './evidence';
import {
  formatDuration,
  formatLondonDateTime,
  formatLondonTime,
  formatMoney,
} from './format';
import { FINDING_TITLES, OUTCOME_LABELS } from './labels';
import { presentLineDetail } from './line-detail';
import {
  CATEGORY_LABELS,
  type CandidateRow,
  type CategoryGroup,
  type LineDetail,
  type ReviewPresentation,
} from './types';

/*
  The presenter turns the validated replay into serialisable strings and
  numbers for the interface. It performs display arithmetic that the fixture
  README documents (projected margin, available supply) and labels every such
  value as derived. It never decides eligibility: the policy result is always
  the replayed finding.
*/

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

export function parseSkuParam(
  value: string | string[] | null | undefined,
): Sku | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && (EXPECTED_SKUS as readonly string[]).includes(candidate)
    ? (candidate as Sku)
    : null;
}
