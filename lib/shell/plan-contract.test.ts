import { describe, expect, it } from 'vitest';
import {
  labelledDeltaSchema,
  releasePlanSchema,
  type Disposition,
  type Effect,
  type PlanStatus,
} from './plan-contract';
import {
  evaluationCounts,
  nonEmptyDispositions,
  planState,
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

  it('counts every effect once, in its own bucket', () => {
    expect(evaluationCounts(effects)).toEqual({
      blocked: 1,
      needs_decision: 1,
      deferred: 0,
      will_apply: 2,
    });
    expect(planState(plan(effects))).toBe('mixed');
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
