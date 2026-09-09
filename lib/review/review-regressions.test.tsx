import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewPanel } from '../../components/review/review-panel';
import { ReviewItemDetail } from '../../components/review/review-item-detail';
import { ReleaseCard } from '../../components/review/release-card';
import { DeltaValue } from '../../components/review/delta';
import { loadReviewedReplay } from '../promotion-release';
import { presentPromotionPlan } from './promotion-adapter';
import { supportDetails } from './support-fixture';
import { galleryDetail, galleryPlans } from './states-fixture';
import {
  initialReviewId,
  reviewEffects,
  reviewPage,
} from './review-navigation';
import { releasePlanSchema } from './plan-contract';

function gallery(label: string) {
  const entry = galleryPlans.find(([name]) => name === label);
  if (!entry) throw new Error(`Missing gallery fixture ${label}`);
  return entry[1];
}

describe('review regressions', () => {
  it('preserves explicit zero top-ups without inventing a before value', () => {
    const replay = loadReviewedReplay();
    const plan = presentPromotionPlan(replay);
    const zeroLines = replay.lines.filter(
      (line) =>
        line.agentAssessment.proposed?.recommendedTopUpQuantityUnits === 0,
    );
    expect(zeroLines.length).toBeGreaterThan(0);
    for (const line of zeroLines) {
      expect(
        plan.effects
          .find((effect) => effect.id === line.sku)
          ?.deltas.find((delta) => delta.label === 'Final top-up'),
      ).toMatchObject({ kind: 'scalar', before: null, after: 0 });
    }
  });
  it('opens promotion on a blocker and honours valid host selections within the filter', () => {
    const plan = presentPromotionPlan(loadReviewedReplay());
    const effects = reviewEffects(plan, 'all');
    const selected = plan.effects.find(
      (effect) => effect.id === initialReviewId(effects),
    );
    expect(selected?.disposition).toBe('blocked');
    expect(initialReviewId(effects, 'ALD-0025')).toBe('ALD-0025');
    const ready = reviewEffects(plan, 'will_apply');
    expect(
      ready.some((effect) => effect.id === initialReviewId(ready, 'ALD-0025')),
    ).toBe(true);
    expect(initialReviewId([], 'missing')).toBeUndefined();
  });

  it('shows exact membership changes in details while keeping the card compact', () => {
    const detail = supportDetails.find((entry) => entry.id === 'CASE-106');
    if (!detail) throw new Error('Missing support case');
    const markup = renderToStaticMarkup(
      <ReviewItemDetail detail={detail} idPrefix="test" />,
    );
    expect(markup).toContain('Added: billing, invoice-copy');
    expect(markup).toContain('Removed: triage');
    const delta = detail.deltas.find((entry) => entry.kind === 'set');
    if (!delta) throw new Error('Missing set delta');
    const compact = renderToStaticMarkup(<DeltaValue delta={delta} />);
    expect(compact).toContain('2 added, 1 removed');
    expect(compact).not.toContain('invoice-copy');
  });

  it('keeps every bulk item reachable with at most 50 mounted rows and loads its detail', () => {
    const plan = gallery('High volume · 2,000 items');
    const effects = reviewEffects(plan, 'all');
    const visited = new Set<string>();
    for (let index = 0; index < effects.length; index += 50) {
      const selected = effects[index];
      if (!selected) throw new Error('Missing bulk item');
      const page = reviewPage(effects, selected.id);
      expect(page.items).toHaveLength(50);
      for (const item of page.items) {
        visited.add(item.id);
        expect(galleryDetail(plan, item.id).revision).toBe(plan.revision);
      }
    }
    expect(visited.size).toBe(2000);
    const markup = renderToStaticMarkup(
      <ReviewPanel
        plan={plan}
        loadDetail={async (id) => galleryDetail(plan, id)}
      />,
    );
    expect(markup.match(/class="review-item-button"/g)).toHaveLength(50);
    expect(markup).toContain('Next page');
    expect(markup).toContain('of 2000 matching items');
  });

  it('shows each execution failure independently of detail loading', () => {
    const plan = releasePlanSchema.parse({
      ...gallery('Partially applied'),
      status: {
        kind: 'partially_applied',
        at: 'today',
        appliedIds: [],
        failures: [
          { effectId: 'e', reason: 'First connector failed' },
          { effectId: 'f', reason: 'Second connector failed' },
        ],
      },
    });
    expect(reviewEffects(plan, 'failures').map((effect) => effect.id)).toEqual([
      'e',
      'f',
    ]);
    const markup = renderToStaticMarkup(
      <ReviewPanel
        plan={plan}
        initialFilter="failures"
        initialItemId="f"
        loadDetail={async (id) => galleryDetail(plan, id)}
      />,
    );
    expect(markup).toContain('First connector failed');
    expect(markup.match(/Second connector failed/g)).toHaveLength(2);
  });

  it('uses replay safety copy in all-clear cards', () => {
    const markup = renderToStaticMarkup(
      <ReleaseCard plan={gallery('All clear')} onOpen={() => {}} />,
    );
    expect(markup).toContain('Reviewing changes nothing.');
    expect(markup).not.toContain('until you apply it');
  });

  it('rejects duplicate, contradictory outcomes and impossible progress', () => {
    const plan = gallery('Mixed');
    const statuses = [
      {
        kind: 'applied',
        at: 'today',
        appliedIds: ['e', 'e'],
        undoAvailableUntil: null,
      },
      {
        kind: 'partially_applied',
        at: 'today',
        appliedIds: ['e'],
        failures: [{ effectId: 'e', reason: 'Failed' }],
      },
      {
        kind: 'partially_applied',
        at: 'today',
        appliedIds: [],
        failures: [
          { effectId: 'f', reason: 'Failed' },
          { effectId: 'f', reason: 'Again' },
        ],
      },
      { kind: 'stale', changedEffectIds: ['a', 'a'] },
      { kind: 'incomplete', step: 8, of: 7 },
    ];
    for (const status of statuses)
      expect(releasePlanSchema.safeParse({ ...plan, status }).success).toBe(
        false,
      );
  });
});
