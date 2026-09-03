import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from '../promotion-release';
import {
  formatDuration,
  formatLondonDateTime,
  formatMoney,
  presentReview,
} from './present-review';

const replay = loadReviewedReplay();
const presentation = presentReview(replay);

describe('presentReview', () => {
  it('reconciles the batch counts with the loader summary', () => {
    expect(presentation.batch.counts).toEqual({
      evaluated: 27,
      ready: 17,
      needsAttention: 6,
      nonReleasable: 4,
      held: 2,
      excluded: 1,
      unverifiable: 1,
    });
    expect(presentation.batch.reviewer).toEqual({
      approved: 0,
      held: 0,
      rejected: 0,
      pending: 27,
    });
    expect(presentation.batch.remainingLabel).toBe('21h 15m');
    expect(presentation.candidates).toHaveLength(27);
    expect(
      presentation.categories.reduce(
        (sum, group) => sum + group.skus.length,
        0,
      ),
    ).toBe(27);
  });

  it('keeps every candidate in fixture order with outcome and reason', () => {
    expect(presentation.candidates.map((row) => row.sku)).toEqual(
      replay.lines.map((line) => line.sku),
    );
    for (const row of presentation.candidates) {
      expect(row.outcomeLabel).not.toBe('');
      expect(row.reason).not.toBe('');
    }
  });

  it('presents the salmon disagreement without blending agent and policy', () => {
    const salmon = presentation.details['ALD-0025'];
    expect(salmon.agent.recommendation).toBe('release');
    expect(salmon.agent.recommendationLabel).toBe('Release');
    expect(salmon.policy.eligibility).toBe('blocked');
    expect(salmon.policy.eligibilityLabel).toBe('Blocked');
    expect(salmon.outcome).toBe('held');
    expect(salmon.outcomeLabel).toBe('Held');
    expect(salmon.margin).toMatchObject({
      projectedPercent: 9.2,
      projectedLabel: '9.2%',
      floorPercent: 15,
      floorLabel: '15%',
      meetsFloor: false,
    });
    expect(salmon.margin?.basis).toContain('£5.00 selling − £4.54 cost');
    expect(salmon.gates.filter((g) => g.result === 'failed')).toHaveLength(1);
    expect(salmon.policy.findings.map((f) => f.consequence)).toEqual([
      'block',
      'block',
    ]);
    expect(salmon.actionNote).toContain('Approve item is unavailable');
  });

  it('plans six effects for salmon and marks none as executed', () => {
    const effects = presentation.details['ALD-0025'].effects;
    expect(effects).toHaveLength(6);
    for (const node of effects ?? []) {
      expect(node.state).toBe('planned');
      expect(node.modeLabel).not.toBe('');
      expect(node.undo).not.toBe('');
    }
    expect(effects?.map((node) => node.mode)).toEqual([
      'live_sandbox',
      'live_sandbox',
      'live_sandbox',
      'live_sandbox',
      'simulated',
      'preview_only',
    ]);
  });

  it('plans no effects for lines without a proposal', () => {
    for (const sku of ['ALD-0001', 'ALD-0009', 'ALD-0027'] as const) {
      const detail = presentation.details[sku];
      expect(detail.effects).toBeNull();
      expect(detail.values).toBeNull();
      expect(detail.margin).toBeNull();
      expect(detail.noProposalReason).not.toBeNull();
    }
  });

  it('keeps outcome and eligibility as separate fields on every line', () => {
    for (const line of replay.lines) {
      const detail = presentation.details[line.sku];
      expect(detail.outcome).toBe(line.outcome);
      expect(detail.policy.eligibility).toBe(line.policyEvaluation.eligibility);
    }
    expect(presentation.details['ALD-0003'].outcome).toBe('needs_attention');
    expect(presentation.details['ALD-0003'].policy.eligibility).toBe(
      'eligible',
    );
  });

  it('resolves gate evidence to source labels and observed times', () => {
    const financial = presentation.details['ALD-0025'].gates.find(
      (g) => g.gate === 'financial',
    );
    expect(financial?.result).toBe('failed');
    expect(financial?.obligation).toBe('required');
    expect(financial?.openByDefault).toBe(true);
    expect(financial?.evidence.map((e) => e.sourceLabel)).toContain(
      'Supplier trading terms',
    );
  });
});

describe('formatting', () => {
  it('formats London times, money, and durations', () => {
    expect(formatLondonDateTime('2026-09-03T07:45:00Z')).toBe(
      'Thu 3 Sep 08:45',
    );
    expect(formatLondonDateTime('2026-09-06T22:59:59Z')).toBe(
      'Sun 6 Sep 23:59',
    );
    expect(formatMoney(500)).toBe('£5.00');
    expect(formatDuration(21.25 * 60 * 60 * 1000)).toBe('21h 15m');
  });
});
