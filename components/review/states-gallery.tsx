'use client';

import {
  releasePlanSchema,
  type Disposition,
  type PlanStatus,
} from '@/lib/review/plan-contract';
import { planState } from '@/lib/review/plan-derivations';
import { ReleaseCard } from './release-card';

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

const plans = [
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

export function StatesGallery() {
  return (
    <div className="states-gallery">
      {plans.map(([label, plan]) => (
        <section key={label} aria-label={label}>
          <p className="readout states-gallery-label">
            {label} <span aria-hidden="true">·</span> {planState(plan)}
          </p>
          <ReleaseCard plan={plan} onOpen={() => undefined} />
        </section>
      ))}
    </div>
  );
}
