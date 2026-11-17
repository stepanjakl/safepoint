import { describe, expect, it } from 'vitest';
import type { Disposition, ReleasePlan } from './plan-contract';
import { evaluationCounts } from './plan-derivations';
import {
  landingProcess,
  moveProcess,
  processNavigationItem,
  restoreProcessOrder,
} from './navigation';

const ids = ['alpha', 'beta', 'new-process'];

const effect = (id: string, disposition: Disposition) => ({
  id,
  subject: id,
  subtitle: '',
  deltas: [],
  reasonKey: null,
  findingIds: [],
  evidenceIds: [],
  disposition,
});

// A recorded review with one line in each of three places.
const plan: ReleasePlan = {
  id: 'plan',
  revision: 'r1',
  title: 'Plan',
  source: 'A test',
  context: '',
  evaluatedAt: '2026-09-09T00:00:00Z',
  mode: 'replay',
  noun: { one: 'line', other: 'lines' },
  reviewLabel: 'Review the lines',
  reasons: [],
  effects: [
    effect('a', 'blocked'),
    effect('b', 'needs_decision'),
    effect('c', 'will_apply'),
  ],
  status: { kind: 'preview' },
};

describe('process navigation', () => {
  it('recovers saved order after processes are added, removed, or duplicated', () => {
    expect(
      restoreProcessOrder(ids, '["beta","removed","beta","alpha"]'),
    ).toEqual(['beta', 'alpha', 'new-process']);
  });
  it('ignores malformed browser preferences', () => {
    for (const saved of [null, '{', '{}', '["beta",null]', '42']) {
      expect(restoreProcessOrder(ids, saved)).toEqual(ids);
    }
  });
  it('moves only a known process, clamps destinations, and preserves the original for cancellation', () => {
    expect(moveProcess(ids, 'alpha', 2)).toEqual([
      'beta',
      'new-process',
      'alpha',
    ]);
    expect(moveProcess(ids, 'beta', -1)).toEqual([
      'beta',
      'alpha',
      'new-process',
    ]);
    expect(moveProcess(ids, 'beta', 100)).toEqual([
      'alpha',
      'new-process',
      'beta',
    ]);
    expect(moveProcess(ids, 'removed', 0)).toEqual(ids);
    expect(moveProcess([], 'removed', 0)).toEqual([]);
    expect(ids).toEqual(['alpha', 'beta', 'new-process']);
  });
  it('derives badges from the review and preserves the replay boundary', () => {
    const counts = evaluationCounts(plan.effects);
    const item = processNavigationItem({
      id: 'process',
      href: '/',
      name: 'Process',
      evaluation: 'rules',
      plan,
    });
    expect(item.status.label).toBe(`${counts.blocked} blocked`);
    expect(item.status.description).toContain(
      `${counts.needs_decision} awaiting a decision`,
    );
    expect(item.status.description).toContain('Replay · nothing applied.');
  });
  it('gives run failures precedence over an empty result and never labels a simulated receipt applied', () => {
    const empty = { ...plan, effects: [] };
    const incomplete = processNavigationItem({
      id: 'process',
      href: '/',
      name: 'Process',
      evaluation: 'rules',
      plan: { ...empty, status: { kind: 'incomplete', step: 1, of: 3 } },
    });
    expect(incomplete.status.label).toBe('Incomplete');
    const receipt = processNavigationItem({
      id: 'process',
      href: '/',
      name: 'Process',
      evaluation: 'rules',
      plan: {
        ...plan,
        status: {
          kind: 'applied',
          at: '2026-09-09',
          appliedIds: [],
          undoAvailableUntil: null,
        },
      },
    });
    expect(receipt.status.label).toBe('Simulated');
    expect(receipt.status.description).toContain('no real changes applied');
  });
  it('lands on the last process open, else the first awaiting review in the saved order', () => {
    const processes = [
      { id: 'alpha', awaitingReview: false },
      { id: 'beta', awaitingReview: true },
      { id: 'new-process', awaitingReview: true },
    ];
    expect(landingProcess(processes, null, 'alpha')).toBe('alpha');
    expect(landingProcess(processes, null, null)).toBe('beta');
    expect(landingProcess(processes, '["new-process","beta"]', 'removed')).toBe(
      'new-process',
    );
    expect(
      landingProcess(
        processes.map((p) => ({ ...p, awaitingReview: false })),
        '["beta"]',
        null,
      ),
    ).toBe('beta');
  });
});
