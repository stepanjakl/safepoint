import type { LineDetail, ReviewPresentation } from '../review-presentation';
import {
  reviewBatchSchema,
  reviewDetailSchema,
  type ReviewGroup,
} from './contracts';

function groupFor(detail: LineDetail): ReviewGroup {
  if (
    detail.policy.eligibility === 'blocked' ||
    ['held', 'excluded', 'unverifiable'].includes(detail.outcome)
  )
    return 'blocked';
  return detail.outcome === 'needs_attention' ? 'attention' : 'ready';
}

function summaryFor(detail: LineDetail) {
  return {
    id: detail.sku,
    title: detail.name,
    subtitle: `${detail.unit} · ${detail.categoryLabel}`,
    group: groupFor(detail),
    outcome: detail.outcomeLabel,
    reason:
      detail.policy.findings[0]?.title ??
      (detail.outcome === 'ready'
        ? 'No blocking policy finding'
        : detail.outcomeLabel),
  };
}

export function presentPromotionBatch(presentation: ReviewPresentation) {
  return reviewBatchSchema.parse({
    id: 'promotion-release',
    revision: presentation.batch.fixtureVersion,
    title: presentation.batch.title,
    processLabel: 'Promotion release',
    mode: 'replay',
    evaluatedAt: presentation.batch.reviewedAtLabel,
    context: `Supplier top-up cutoff ${presentation.batch.topUpCutoffLabel} · Labels ${presentation.batch.labelDeadlineLabel} · Europe/London`,
    reviewLabel: 'Review release',
    initialItemId: 'ALD-0025',
    items: presentation.candidates.map((item) =>
      summaryFor(presentation.details[item.sku]),
    ),
  });
}

export function presentPromotionDetail(detail: LineDetail, revision: string) {
  const group = groupFor(detail);
  const conclusion =
    group === 'blocked'
      ? detail.outcome === 'excluded'
        ? 'Excluded from this release'
        : 'This item cannot be released'
      : group === 'attention'
        ? 'Review this item individually'
        : 'Ready for your review';
  return reviewDetailSchema.parse({
    ...summaryFor(detail),
    revision,
    conclusion,
    explanation:
      detail.policy.findings[0]?.explanation ??
      detail.noProposalReason ??
      'The recorded policy evaluation found no blocking condition. Approval is still required before any change can be applied.',
    nextAction: detail.policy.nextAction,
    changes: (detail.values ?? [])
      .filter((row) => row.kind === 'change')
      .map((row) => ({
        label: row.label,
        before: row.current,
        after: row.proposed,
        note: row.note,
      })),
    facts: [
      ...(detail.margin
        ? [
            {
              label: 'Projected margin',
              value: `${detail.margin.projectedLabel} · minimum ${detail.margin.floorLabel}`,
              note: `Derived: ${detail.margin.basis}`,
            },
          ]
        : []),
      ...(detail.values ?? [])
        .filter((row) => row.kind === 'fact')
        .map((row) => ({
          label: row.label,
          value: row.current
            ? `${row.current} / ${row.proposed}`
            : row.proposed,
          note: row.note,
        })),
      { label: 'Supplier', value: detail.supplierLabel, note: null },
      { label: 'Source fact', value: detail.evidence.sourceFact, note: null },
    ],
    findings: detail.policy.findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      explanation: finding.explanation,
      evidenceIds: finding.evidence.map((ref) => ref.id),
    })),
    checks: detail.gates.map((gate) => ({
      id: gate.gate,
      label: gate.label,
      result: gate.result,
      resultLabel: gate.resultLabel,
      obligation: gate.obligationLabel,
      explanation: `${gate.explanation} ${gate.obligationReason}`,
      evidenceIds: gate.evidence.map((ref) => ref.id),
    })),
    checkSummary: detail.gateSummary,
    agent: {
      recommendation: detail.agent.recommendationLabel,
      rationale: detail.agent.rationale,
      uncertainties: detail.agent.uncertainties,
    },
    sources: detail.evidence.sources.map((source) => ({
      id: source.id,
      label: source.sourceLabel,
      observedAt: source.observedAtLabel,
      facts: source.facts,
    })),
    narrative: detail.evidence.note
      ? {
          text: detail.evidence.note.text,
          source: `${detail.evidence.note.sourceLabel} · ${detail.evidence.note.observedAtLabel}`,
        }
      : null,
    effects: (detail.effects ?? []).map((effect) => ({
      id: effect.id,
      destination: effect.destination,
      mode: effect.mode,
      modeLabel: effect.modeLabel,
      recovery: effect.undo,
    })),
  });
}
