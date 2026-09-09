import {
  releasePlanSchema,
  type Disposition,
  type PlanStatus,
  type ReleasePlan,
} from './plan-contract';
import { reviewDetailSchema } from './contracts';
const reasons = [
  { key: 'margin_floor', label: 'Below the margin floor' },
  { key: 'evidence_stale', label: 'Evidence is out of date' },
  { key: 'within_policy', label: 'Within policy' },
];

function effect(id: string, disposition: Disposition, reasonKey: string) {
  return {
    id,
    subject: `Line ${id}`,
    subtitle: 'Each · Bakery',
    deltas: [
      {
        label: 'Promotional price',
        kind: 'scalar' as const,
        before: 250,
        after: 199,
        display: { prefix: '£', scale: 100, precision: 2 },
        derived: '−20.4% vs regular',
        derivedDirection: 'down' as const,
      },
    ],
    reasonKey,
    findingIds: [`finding-${id}`],
    evidenceIds: [`ev-${id}`],
    disposition,
  };
}

function build(
  title: string,
  effects: ReturnType<typeof effect>[],
  status: PlanStatus = { kind: 'preview' },
) {
  return releasePlanSchema.parse({
    id: 'gallery',
    revision: '1.0.0',
    title,
    source: 'Rendering harness · replay',
    context: 'Synthetic · Europe/London',
    evaluatedAt: 'Mon 7 Sep 09:00',
    mode: 'replay',
    noun: { one: 'item', other: 'items' },
    reviewLabel: 'Review release',
    reasons,
    effects,
    status,
  });
}

const mixed = [
  effect('a', 'blocked', 'margin_floor'),
  effect('b', 'blocked', 'evidence_stale'),
  effect('c', 'needs_decision', 'evidence_stale'),
  effect('d', 'deferred', 'margin_floor'),
  effect('e', 'will_apply', 'within_policy'),
  effect('f', 'will_apply', 'within_policy'),
];

// Item counts are unbounded; reason counts are not. The card must stay the same
// height here and roll the evidence zone up by reason.
const bulk = Array.from({ length: 2000 }, (_, i) =>
  effect(
    `bulk-${i}`,
    i % 3 === 0 ? 'blocked' : i % 3 === 1 ? 'needs_decision' : 'will_apply',
    i % 2 === 0 ? 'margin_floor' : 'evidence_stale',
  ),
);

export const galleryPlans = [
  ['Mixed', build('Fresh Food Weekend', mixed)],
  [
    'All clear',
    build('Fresh Food Weekend', [
      effect('a', 'will_apply', 'within_policy'),
      effect('b', 'will_apply', 'within_policy'),
    ]),
  ],
  ['Nothing to do', build('Fresh Food Weekend', [])],
  [
    'Fully blocked',
    build('Fresh Food Weekend', [
      effect('a', 'blocked', 'margin_floor'),
      effect('b', 'blocked', 'evidence_stale'),
    ]),
  ],
  [
    'Applied',
    build('Fresh Food Weekend', mixed, {
      kind: 'applied',
      at: 'Mon 7 Sep 09:14',
      appliedIds: ['e', 'f'],
      undoAvailableUntil: 'Mon 7 Sep 09:44',
    }),
  ],
  [
    'Partially applied',
    build('Fresh Food Weekend', mixed, {
      kind: 'partially_applied',
      at: 'Mon 7 Sep 09:14',
      appliedIds: ['e'],
      failures: [
        { effectId: 'f', reason: 'The pricebook connector timed out.' },
      ],
    }),
  ],
  [
    'Stale',
    build('Fresh Food Weekend', mixed, {
      kind: 'stale',
      changedEffectIds: ['a', 'c'],
    }),
  ],
  [
    'Run incomplete',
    build('Fresh Food Weekend', [], { kind: 'incomplete', step: 3, of: 7 }),
  ],
  ['High volume · 2,000 items', build('Fresh Food Weekend', bulk)],
] as const;

export function galleryDetail(plan: ReleasePlan, id: string) {
  const effect = plan.effects.find((entry) => entry.id === id);
  if (!effect) throw new Error('Gallery item not found');
  const reason =
    plan.reasons.find((entry) => entry.key === effect.reasonKey)?.label ??
    'No recorded reason';
  return reviewDetailSchema.parse({
    id,
    title: effect.subject,
    subtitle: effect.subtitle,
    revision: plan.revision,
    disposition: effect.disposition,
    outcome: effect.disposition,
    reason,
    conclusion: reason,
    explanation:
      'Synthetic evaluation for the state gallery. No external record changed.',
    nextAction: 'Inspect the recorded proposal and evidence.',
    deltas: effect.deltas,
    facts: [],
    findings: effect.findingIds.map((findingId) => ({
      id: findingId,
      title: reason,
      explanation: 'Synthetic gallery finding.',
      evidenceIds: effect.evidenceIds,
    })),
    checks: [],
    checkSummary: 'No checks recorded',
    agent: {
      recommendation: 'Review',
      rationale: 'Synthetic gallery proposal.',
      uncertainties: [],
    },
    sources: effect.evidenceIds.map((sourceId) => ({
      id: sourceId,
      label: 'Synthetic gallery source',
      observedAt: plan.evaluatedAt,
      facts: ['Rendering fixture; no external observation.'],
    })),
    narrative: null,
    effects: [],
  });
}
