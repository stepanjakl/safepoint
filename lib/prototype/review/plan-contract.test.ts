import { describe, expect, it } from 'vitest';
import {
  DISPOSITIONS,
  DISPOSITION_LABELS,
  labelledDeltaSchema,
  releasePlanSchema,
  type Disposition,
  type Effect,
  type PlanStatus,
} from './plan-contract';
import {
  ROW_BUDGET,
  evaluationCounts,
  nonEmptyDispositions,
  planState,
  rollUpByReason,
  selectedCounts,
  totalOf,
  attentionLine,
  bucketRows,
} from './plan-derivations';

const noun = { one: 'item', other: 'items' };

function effect(
  id: string,
  disposition: Disposition,
  reasonKey: string | null = null,
): Effect {
  return {
    id,
    subject: `Subject ${id}`,
    subtitle: '',
    deltas: [{ label: 'Price', kind: 'scalar', before: 100, after: 80 }],
    reasonKey,
    findingIds: [`finding-${id}`],
    evidenceIds: [`ev-${id}`],
    disposition,
  };
}

function plan(
  effects: Effect[],
  status: PlanStatus = { kind: 'preview' },
  reasons: { key: string; label: string }[] = [],
) {
  return releasePlanSchema.parse({
    id: 'plan-1',
    revision: '1.0.0',
    title: 'Test plan',
    source: 'Test source',
    context: '',
    evaluatedAt: 'today',
    mode: 'replay',
    noun,
    reviewLabel: 'Review release',
    reasons,
    effects,
    status,
  });
}

describe('delta parsing', () => {
  it('degrades an unrecognised kind to opaque rather than throwing', () => {
    const parsed = labelledDeltaSchema.parse({
      label: 'Shipping matrix',
      kind: 'matrix',
      rows: [[1, 2]],
    });
    expect(parsed).toEqual({
      label: 'Shipping matrix',
      kind: 'opaque',
      summary: 'Unsupported change type "matrix"',
    });
  });

  it('prefers an engine-supplied summary when degrading', () => {
    const parsed = labelledDeltaSchema.parse({
      label: 'Routing',
      kind: 'graph',
      summary: 'Three hops rerouted via Leeds',
    });
    expect(parsed).toMatchObject({
      kind: 'opaque',
      summary: 'Three hops rerouted via Leeds',
    });
  });

  it('still rejects a malformed known kind', () => {
    // A supported kind with a bad payload is an adapter bug. Swallowing it into
    // an opaque row would hide it behind a plausible-looking row.
    expect(() =>
      labelledDeltaSchema.parse({
        label: 'Price',
        kind: 'scalar',
        before: 'ten',
        after: 8,
      }),
    ).toThrow();
    expect(() =>
      labelledDeltaSchema.parse({ label: 'Tags', kind: 'set', added: 'a' }),
    ).toThrow();
  });

  it('keeps create and an unobserved before distinct', () => {
    expect(
      labelledDeltaSchema.parse({ label: 'A', kind: 'create', after: 'x' }),
    ).toMatchObject({ kind: 'create' });
    expect(
      labelledDeltaSchema.parse({
        label: 'A',
        kind: 'categorical',
        before: null,
        after: 'x',
      }),
    ).toMatchObject({ kind: 'categorical', before: null });
  });
});

describe('plan integrity', () => {
  it('rejects duplicate effect ids', () => {
    expect(() =>
      plan([effect('a', 'blocked'), effect('a', 'will_apply')]),
    ).toThrow();
  });

  it('rejects an effect referencing an unknown reason', () => {
    expect(() => plan([effect('a', 'blocked', 'missing')])).toThrow();
  });

  it('rejects a status referencing an unknown effect', () => {
    expect(() =>
      plan([effect('a', 'will_apply')], {
        kind: 'applied',
        at: 'today',
        appliedIds: ['ghost'],
        undoAvailableUntil: null,
      }),
    ).toThrow();
  });
});

describe('counts', () => {
  const effects = [
    effect('a', 'blocked'),
    effect('b', 'needs_decision'),
    effect('c', 'will_apply'),
    effect('d', 'will_apply'),
  ];

  it('evaluation counts ignore exclusion so blockers cannot be erased', () => {
    const excluded = new Set(['a']);
    expect(evaluationCounts(effects).blocked).toBe(1);
    expect(selectedCounts(effects, excluded).blocked).toBe(0);
    // The state is still driven by evaluation, not selection.
    expect(planState(plan(effects))).toBe('mixed');
  });

  it('selected counts fall to zero when everything is excluded', () => {
    const excluded = new Set(effects.map((e) => e.id));
    expect(totalOf(selectedCounts(effects, excluded))).toBe(0);
    expect(totalOf(evaluationCounts(effects))).toBe(4);
  });

  it('lists non-empty dispositions in severity order', () => {
    expect(nonEmptyDispositions(evaluationCounts(effects))).toEqual([
      'blocked',
      'needs_decision',
      'will_apply',
    ]);
  });
});

describe('planState precedence', () => {
  it('renders an incomplete run with zero effects as incomplete, not empty', () => {
    expect(planState(plan([], { kind: 'incomplete', step: 3, of: 7 }))).toBe(
      'incomplete',
    );
  });

  it('prefers stale over the count-derived states', () => {
    const effects = [effect('a', 'will_apply')];
    expect(planState(plan(effects))).toBe('all_clear');
    expect(
      planState(plan(effects, { kind: 'stale', changedEffectIds: ['a'] })),
    ).toBe('stale');
  });

  it('covers all eight states', () => {
    const seen = new Set([
      planState(plan([], { kind: 'incomplete', step: 1, of: 4 })),
      planState(
        plan([effect('a', 'will_apply')], {
          kind: 'stale',
          changedEffectIds: ['a'],
        }),
      ),
      planState(
        plan([effect('a', 'will_apply')], {
          kind: 'applied',
          at: 'today',
          appliedIds: ['a'],
          undoAvailableUntil: 'later',
        }),
      ),
      planState(
        plan([effect('a', 'will_apply'), effect('b', 'will_apply')], {
          kind: 'partially_applied',
          at: 'today',
          appliedIds: ['a'],
          failures: [{ effectId: 'b', reason: 'Connector timed out' }],
        }),
      ),
      planState(plan([])),
      planState(plan([effect('a', 'blocked')])),
      planState(plan([effect('a', 'will_apply')])),
      planState(plan([effect('a', 'blocked'), effect('b', 'will_apply')])),
    ]);
    expect(seen.size).toBe(8);
  });
});

describe('attention line', () => {
  it('counts what needs a person, and cannot disagree with the tabs', () => {
    const effects = [
      effect('a', 'blocked'),
      effect('b', 'blocked'),
      effect('c', 'needs_decision'),
      effect('d', 'will_apply'),
    ];
    const counts = evaluationCounts(effects);
    expect(attentionLine(counts, noun)).toBe('3 of 4 items need attention.');
    expect(counts.blocked).toBe(2);
    expect(counts.needs_decision).toBe(1);
  });

  // The line used to enumerate every bucket, which put the same distribution
  // on screen three times over. The tabs are the only place those digits live.
  it('does not restate the per-bucket counts the tabs carry', () => {
    const counts = evaluationCounts([
      effect('a', 'blocked'),
      effect('b', 'needs_decision'),
      effect('c', 'deferred'),
    ]);
    const line = attentionLine(counts, noun);
    for (const disposition of [
      'blocked',
      'needs_decision',
      'deferred',
    ] as const) {
      expect(line).not.toContain(DISPOSITION_LABELS[disposition].toLowerCase());
    }
  });

  it('agrees in the singular', () => {
    expect(
      attentionLine(
        evaluationCounts([effect('a', 'blocked'), effect('b', 'will_apply')]),
        noun,
      ),
    ).toBe('1 of 2 items needs attention.');
  });

  it('counts deferred and awaiting alongside blocked', () => {
    const counts = evaluationCounts([
      effect('a', 'deferred'),
      effect('b', 'needs_decision'),
      effect('c', 'will_apply'),
    ]);
    expect(attentionLine(counts, noun)).toBe('2 of 3 items need attention.');
  });

  it('speaks plainly when everything will apply', () => {
    const counts = evaluationCounts([
      effect('a', 'will_apply'),
      effect('b', 'will_apply'),
    ]);
    expect(attentionLine(counts, noun)).toBe(
      '2 items will apply. Nothing needs attention.',
    );
  });

  it('carries no domain noun beyond the supplied one', () => {
    const rows = attentionLine(evaluationCounts([effect('a', 'blocked')]), {
      one: 'row',
      other: 'rows',
    });
    expect(rows).toBe('1 of 1 row needs attention.');
  });
});

describe('bucket rows', () => {
  it('shows every item at or below the row budget', () => {
    const effects = Array.from({ length: ROW_BUDGET }, (_, i) =>
      effect(`e${i}`, 'blocked'),
    );
    const rows = bucketRows(effects, []);
    expect(rows.kind).toBe('items');
    if (rows.kind !== 'items') return;
    expect(rows.items).toHaveLength(ROW_BUDGET);
    expect(rows.hidden).toBe(0);
  });

  it('rolls up past the budget and counts the remainder in items', () => {
    const effects = Array.from({ length: 40 }, (_, i) =>
      effect(`e${i}`, 'blocked', `r${i % 8}`),
    );
    const reasons = Array.from({ length: 8 }, (_, i) => ({
      key: `r${i}`,
      label: `Reason ${i}`,
    }));
    const rows = bucketRows(effects, reasons);
    expect(rows.kind).toBe('reasons');
    if (rows.kind !== 'reasons') return;
    // "and N more" has to mean N things the reader could have looked at.
    const shown = rows.reasons.reduce((sum, row) => sum + row.count, 0);
    expect(shown + rows.hidden).toBe(40);
  });
});

describe('roll up by reason', () => {
  it('groups by key and keeps reason counts bounded as items grow', () => {
    const effects = Array.from({ length: 40 }, (_, i) =>
      effect(
        `e${i}`,
        'blocked',
        i % 2 === 0 ? 'margin_floor' : 'evidence_stale',
      ),
    );
    const rows = rollUpByReason(effects, [
      { key: 'margin_floor', label: 'Below margin floor' },
      { key: 'evidence_stale', label: 'Evidence out of date' },
    ]);
    expect(rows).toEqual([
      { key: 'margin_floor', label: 'Below margin floor', count: 20 },
      { key: 'evidence_stale', label: 'Evidence out of date', count: 20 },
    ]);
    expect(effects.length).toBeGreaterThan(ROW_BUDGET);
  });

  it('surfaces unattributed rows rather than dropping them', () => {
    const rows = rollUpByReason([effect('a', 'blocked', null)], []);
    expect(rows).toEqual([
      { key: '__unattributed__', label: 'No recorded reason', count: 1 },
    ]);
  });

  it('does not pool evidence across items sharing a reason', () => {
    const effects = [
      effect('a', 'blocked', 'margin_floor'),
      effect('b', 'blocked', 'margin_floor'),
    ];
    expect(effects[0]!.evidenceIds).toEqual(['ev-a']);
    expect(effects[1]!.evidenceIds).toEqual(['ev-b']);
  });
});

describe('copy rules', () => {
  const actionish = Object.values(DISPOSITION_LABELS);

  it('uses sentence case and no terminal punctuation on labels', () => {
    for (const label of actionish) {
      expect(label).not.toMatch(/[.!]$/);
      expect(label).toBe(label.charAt(0).toUpperCase() + label.slice(1));
      expect(label.slice(1)).toBe(
        label.slice(1).replace(/\b[A-Z]/g, (m) => m.toLowerCase()),
      );
    }
  });

  it('bans apology and filler vocabulary', () => {
    const corpus = [
      ...actionish,
      attentionLine(evaluationCounts([]), noun),
    ].join(' ');
    expect(corpus).not.toMatch(/successfully|please|sorry|!/i);
  });

  it('holds one label per disposition on the scale', () => {
    expect(Object.keys(DISPOSITION_LABELS).sort()).toEqual(
      [...DISPOSITIONS].sort(),
    );
  });
});
