import { describe, expect, it } from 'vitest';
import { loadReviewedReplay } from '../promotion-release';
import { presentPromotionPlan } from '../review/promotion-adapter';
import { supportPlan } from '../review/support-fixture';
import { evaluationCounts } from '../review/plan-derivations';
import {
  moveProcess,
  processNavigationItem,
  restoreProcessOrder,
} from './navigation';

const ids = ['promotion', 'support', 'new-process'];

describe('process navigation', () => {
  it('recovers saved order after processes are added, removed, or duplicated', () => {
    expect(
      restoreProcessOrder(ids, '["support","removed","support","promotion"]'),
    ).toEqual(['support', 'promotion', 'new-process']);
  });
  it('ignores malformed browser preferences', () => {
    for (const saved of [null, '{', '{}', '["support",null]', '42']) {
      expect(restoreProcessOrder(ids, saved)).toEqual(ids);
    }
  });
  it('moves only a known process, clamps destinations, and preserves the original for cancellation', () => {
    expect(moveProcess(ids, 'promotion', 2)).toEqual([
      'support',
      'new-process',
      'promotion',
    ]);
    expect(moveProcess(ids, 'support', -1)).toEqual([
      'support',
      'promotion',
      'new-process',
    ]);
    expect(moveProcess(ids, 'support', 100)).toEqual([
      'promotion',
      'new-process',
      'support',
    ]);
    expect(moveProcess(ids, 'removed', 0)).toEqual(ids);
    expect(moveProcess([], 'removed', 0)).toEqual([]);
    expect(ids).toEqual(['promotion', 'support', 'new-process']);
  });
  it('derives badges from each real review and preserves the replay boundary', () => {
    for (const plan of [
      presentPromotionPlan(loadReviewedReplay()),
      supportPlan,
    ]) {
      const counts = evaluationCounts(plan.effects);
      const item = processNavigationItem({
        id: 'process',
        href: '/',
        name: 'Process',
        plan,
      });
      expect(item.status.label).toBe(`${counts.blocked} blocked`);
      expect(item.status.description).toContain(
        `${counts.needs_decision} awaiting a decision`,
      );
      expect(item.status.description).toContain('Replay · nothing applied.');
    }
  });
  it('gives run failures precedence over an empty result and never labels a simulated receipt applied', () => {
    const empty = { ...supportPlan, effects: [] };
    const incomplete = processNavigationItem({
      id: 'process',
      href: '/',
      name: 'Process',
      plan: { ...empty, status: { kind: 'incomplete', step: 1, of: 3 } },
    });
    expect(incomplete.status.label).toBe('Incomplete');
    const receipt = processNavigationItem({
      id: 'process',
      href: '/',
      name: 'Process',
      plan: {
        ...supportPlan,
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
});
