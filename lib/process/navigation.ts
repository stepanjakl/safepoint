import type { ReleasePlan } from '@/lib/review/plan-contract';
import {
  evaluationCounts,
  planState,
  type DispositionCounts,
} from '@/lib/review/plan-derivations';

export type ProcessNavigationItem = {
  id: string;
  href: string;
  name: string;
  status: {
    label: string;
    description: string;
    counts: DispositionCounts;
    totalLabel: string;
    modeLabel: string;
    modeDescription: string;
    tone: 'blocked' | 'caution' | 'neutral' | 'verified';
  };
};

export function processNavigationItem({
  id,
  href,
  name,
  plan,
}: {
  id: string;
  href: string;
  name: string;
  plan: ReleasePlan;
}): ProcessNavigationItem {
  const counts = evaluationCounts(plan.effects);
  const state = planState(plan);
  const status = (() => {
    switch (state) {
      case 'incomplete':
        return { label: 'Incomplete', tone: 'caution' };
      case 'stale':
        return { label: 'Out of date', tone: 'caution' };
      case 'partially_applied':
        return { label: 'Partial', tone: 'caution' };
      case 'applied':
        return {
          label: plan.mode === 'replay' ? 'Simulated' : 'Applied',
          tone: 'verified',
        };
      case 'empty':
        return { label: 'No items', tone: 'neutral' };
      case 'all_clear':
        return { label: 'Review', tone: 'neutral' };
      case 'mixed':
      case 'fully_blocked':
        return {
          label: counts.blocked ? `${counts.blocked} blocked` : 'Review',
          tone: counts.blocked ? 'blocked' : 'neutral',
        };
    }
  })() satisfies Pick<ProcessNavigationItem['status'], 'label' | 'tone'>;
  const noun = plan.effects.length === 1 ? plan.noun.one : plan.noun.other;
  const mode =
    plan.mode === 'replay'
      ? state === 'applied' || state === 'partially_applied'
        ? 'Replay · simulated receipt; no real changes applied.'
        : 'Replay · nothing applied.'
      : 'Ready means ready for review, not approved.';
  return {
    id,
    href,
    name,
    status: {
      ...status,
      counts,
      totalLabel: `${plan.effects.length} ${noun}`,
      modeLabel: plan.mode === 'replay' ? 'Replay' : 'Live',
      modeDescription:
        plan.mode === 'replay'
          ? state === 'applied' || state === 'partially_applied'
            ? 'Simulated receipt. No real changes applied.'
            : 'Recorded checks. Nothing applied.'
          : mode,
      description: `Latest available run: ${plan.effects.length} ${noun}; ${counts.blocked} blocked, ${counts.needs_decision} awaiting a decision, ${counts.deferred} deferred. ${mode}`,
    },
  };
}

/** Keep known saved IDs, drop duplicates, and append newly available processes. */
export function restoreProcessOrder(
  ids: string[],
  saved: string | null,
): string[] {
  if (!saved) return ids;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (
      !Array.isArray(parsed) ||
      !parsed.every((id: unknown) => typeof id === 'string')
    )
      return ids;
    const known = parsed.filter((id: string) => ids.includes(id));
    return [...new Set([...known, ...ids])];
  } catch {
    return ids;
  }
}

export function moveProcess(
  order: string[],
  id: string,
  index: number,
): string[] {
  if (!order.includes(id)) return order;
  const next = order.filter((key) => key !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id);
  return next;
}
