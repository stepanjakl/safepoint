import {
  severityRank,
  type Disposition,
  type Effect,
  type ReleasePlan,
} from './plan-contract';

export type ReviewFilter = Disposition | 'all' | 'failures';

export function reviewEffects(
  plan: ReleasePlan,
  filter: ReviewFilter,
): Effect[] {
  const failures = new Set(
    plan.status.kind === 'partially_applied'
      ? plan.status.failures.map((failure) => failure.effectId)
      : [],
  );
  return plan.effects
    .filter(
      (effect) =>
        filter === 'all' ||
        (filter === 'failures'
          ? failures.has(effect.id)
          : effect.disposition === filter),
    )
    .toSorted(
      (a, b) => severityRank(a.disposition) - severityRank(b.disposition),
    );
}

export function initialReviewId(
  effects: Effect[],
  preferred?: string,
): string | undefined {
  return (
    effects.find((effect) => effect.id === preferred)?.id ?? effects[0]?.id
  );
}

// Keep the selected row on the rendered page, including host deep links.
export function reviewPage(effects: Effect[], selectedId: string) {
  const size = effects.length > 200 ? 50 : 200;
  const index = Math.max(
    0,
    effects.findIndex((effect) => effect.id === selectedId),
  );
  const page = Math.floor(index / size);
  const start = page * size;
  return {
    page,
    start,
    size,
    totalPages: Math.max(1, Math.ceil(effects.length / size)),
    items: effects.slice(start, start + size),
  };
}
