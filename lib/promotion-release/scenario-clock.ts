import type { PromotionReleasePlan, ScenarioEvidencePack } from './schemas';

export function shiftScenarioToReviewAt(
  scenario: ScenarioEvidencePack,
  reviewAt: string,
): ScenarioEvidencePack {
  const target = Date.parse(reviewAt);
  if (!Number.isFinite(target))
    throw new Error('Invalid scenario review time.');
  const offset = target - Date.parse(scenario.promotionBrief.campaign.reviewAt);
  const shift = (timestamp: string) =>
    new Date(Date.parse(timestamp) + offset).toISOString();
  const observed = <T extends { observedAt: string }>(record: T): T => ({
    ...record,
    observedAt: shift(record.observedAt),
  });
  const campaign = scenario.promotionBrief.campaign;

  return {
    ...scenario,
    promotionBrief: {
      ...observed(scenario.promotionBrief),
      campaign: {
        ...campaign,
        reviewAt: shift(campaign.reviewAt),
        topUpCutoffAt: shift(campaign.topUpCutoffAt),
        labelDeadlineAt: shift(campaign.labelDeadlineAt),
        startsAt: shift(campaign.startsAt),
        endsAt: shift(campaign.endsAt),
      },
    },
    shortlistProvenance: {
      ...scenario.shortlistProvenance,
      records: scenario.shortlistProvenance.records.map((record) => ({
        ...observed(record),
        approvedAt: shift(record.approvedAt),
      })),
    },
    cataloguePricebook: {
      ...scenario.cataloguePricebook,
      records: scenario.cataloguePricebook.records.map(observed),
    },
    demandEvidence: {
      ...scenario.demandEvidence,
      records: scenario.demandEvidence.records.map(observed),
    },
    supplyPosition: {
      ...scenario.supplyPosition,
      records: scenario.supplyPosition.records.map(observed),
    },
    supplierTerms: {
      ...scenario.supplierTerms,
      records: scenario.supplierTerms.records.map((record) => ({
        ...observed(record),
        topUpCutoffAt: shift(record.topUpCutoffAt),
      })),
    },
    operationalNotes: {
      ...scenario.operationalNotes,
      records: scenario.operationalNotes.records.map(observed),
    },
    channelState: {
      ...scenario.channelState,
      records: scenario.channelState.records.map((record) => ({
        ...observed(record),
        channels: record.channels.map((channel) => ({
          ...channel,
          startsAt: channel.startsAt === null ? null : shift(channel.startsAt),
          endsAt: channel.endsAt === null ? null : shift(channel.endsAt),
        })),
      })),
    },
    policyRules: observed(scenario.policyRules),
  };
}

export function shiftProposalToReviewAt(
  proposal: PromotionReleasePlan,
  scenarioReviewAt: string,
  reviewAt: string,
): PromotionReleasePlan {
  const offset = Date.parse(reviewAt) - Date.parse(scenarioReviewAt);
  if (!Number.isFinite(offset))
    throw new Error('Invalid scenario review time.');
  const shift = (timestamp: string) =>
    new Date(Date.parse(timestamp) + offset).toISOString();
  return {
    ...proposal,
    generatedAt: shift(proposal.generatedAt),
    candidates: proposal.candidates.map((candidate) => ({
      ...candidate,
      proposed:
        candidate.proposed === null
          ? null
          : {
              ...candidate.proposed,
              startsAt: shift(candidate.proposed.startsAt),
              endsAt: shift(candidate.proposed.endsAt),
            },
    })),
  };
}
