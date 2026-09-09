import type { ReviewLine, ReviewedReplay } from '../promotion-release';
import {
  presentReview,
  type LineDetail,
  type ReviewPresentation,
} from '../review-presentation';
import {
  labelledDeltaSchema,
  releasePlanSchema,
  type Disposition,
  type Effect,
  type LabelledDelta,
  type Reason,
} from './plan-contract';
import { reviewDetailSchema } from './contracts';

function dispositionFor(detail: LineDetail): Disposition {
  if (
    detail.policy.eligibility === 'blocked' ||
    ['held', 'excluded', 'unverifiable'].includes(detail.outcome)
  )
    return 'blocked';
  return detail.outcome === 'needs_attention' ? 'needs_decision' : 'will_apply';
}

// Scalars are built from the typed source fields, never parsed back out of
// display text: `presentValues` emits strings like "£1.50 regular", and reading
// numbers out of those would break the first time a format changed.
function promotionDeltas(
  line: ReviewLine,
  detail: LineDetail,
): LabelledDelta[] {
  const proposed = line.agentAssessment.proposed;
  if (!proposed) return [];

  const { catalogue } = line;
  const before =
    catalogue.currentPromotionalSellingPricePence ??
    catalogue.regularSellingPricePence;
  const changePercent =
    ((proposed.promotionalSellingPricePence -
      catalogue.regularSellingPricePence) /
      catalogue.regularSellingPricePence) *
    100;

  const deltas: LabelledDelta[] = [
    {
      label: 'Promotional price',
      kind: 'scalar',
      before,
      after: proposed.promotionalSellingPricePence,
      display: { prefix: '£', scale: 100, precision: 2 },
      derived: `${changePercent >= 0 ? '+' : '−'}${Math.abs(changePercent).toFixed(1)}% vs regular`,
      derivedDirection:
        changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'none',
    },
  ];

  // No prior top-up is recorded anywhere, so the before value is genuinely
  // unobserved rather than zero. Preserve an explicit zero recommendation too:
  // without a prior snapshot we cannot conclude that it means no change.
  deltas.push({
    label: 'Final top-up',
    kind: 'scalar',
    before: null,
    after: proposed.recommendedTopUpQuantityUnits,
    display: { suffix: ' units' },
  });

  // A date range is a formatted string in any representation, so taking the
  // presenter's rendering is not the same as parsing a number back out of one.
  const window = (detail.values ?? []).find(
    (row) => row.label === 'Promotion window',
  );
  if (window) {
    deltas.push({
      label: 'Promotion window',
      kind: 'categorical',
      before: window.current,
      after: window.proposed,
    });
  }

  return deltas.map((delta) => labelledDeltaSchema.parse(delta));
}

// A display grouping key. Each effect keeps its own findings and evidence, so
// rolling rows up by reason never implies one item's evidence supports another.
function reasonFor(line: ReviewLine, detail: LineDetail): Reason | null {
  const code = line.policyEvaluation.findings[0]?.code;
  const title = detail.policy.findings[0]?.title;
  if (!code || !title) return null;
  return { key: code, label: title };
}

function effectFor(line: ReviewLine, detail: LineDetail): Effect {
  return {
    id: detail.sku,
    subject: detail.name,
    subtitle: `${detail.unit} · ${detail.categoryLabel}`,
    deltas: promotionDeltas(line, detail),
    reasonKey: reasonFor(line, detail)?.key ?? null,
    findingIds: detail.policy.findings.map((finding) => finding.id),
    evidenceIds: detail.policy.findings.flatMap((finding) =>
      finding.evidence.map((ref) => ref.id),
    ),
    disposition: dispositionFor(detail),
  };
}

export function presentPromotionPlan(replay: ReviewedReplay) {
  const presentation: ReviewPresentation = presentReview(replay);
  const reasons = new Map<string, Reason>();
  const effects = replay.lines.map((line) => {
    const detail = presentation.details[line.sku];
    const reason = reasonFor(line, detail);
    if (reason && !reasons.has(reason.key)) reasons.set(reason.key, reason);
    return effectFor(line, detail);
  });

  return releasePlanSchema.parse({
    id: 'promotion-release',
    revision: presentation.batch.fixtureVersion,
    title: presentation.batch.title,
    source: 'Promotion release · replay',
    context: `Supplier top-up cutoff ${presentation.batch.topUpCutoffLabel} · Labels ${presentation.batch.labelDeadlineLabel} · Europe/London`,
    evaluatedAt: presentation.batch.reviewedAtLabel,
    mode: 'replay',
    noun: { one: 'item', other: 'items' },
    reviewLabel: 'Review release',
    reasons: [...reasons.values()],
    effects,
    status: { kind: 'preview' },
  });
}

export function presentPromotionDetail(
  line: ReviewLine,
  detail: LineDetail,
  revision: string,
) {
  const disposition = dispositionFor(detail);
  const conclusion =
    disposition === 'blocked'
      ? detail.outcome === 'excluded'
        ? 'Excluded from this release'
        : 'This item cannot be released'
      : disposition === 'needs_decision'
        ? 'Review this item individually'
        : 'Ready for your review';
  return reviewDetailSchema.parse({
    id: detail.sku,
    title: detail.name,
    subtitle: `${detail.unit} · ${detail.categoryLabel}`,
    disposition,
    outcome: detail.outcomeLabel,
    reason:
      detail.policy.findings[0]?.title ??
      (detail.outcome === 'ready'
        ? 'No blocking policy finding'
        : detail.outcomeLabel),
    revision,
    conclusion,
    explanation:
      detail.policy.findings[0]?.explanation ??
      detail.noProposalReason ??
      'The recorded policy evaluation found no blocking condition. Approval is still required before any change can be applied.',
    nextAction: detail.policy.nextAction,
    deltas: promotionDeltas(line, detail),
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
