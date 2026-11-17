import {
  DISPOSITIONS,
  type Disposition,
  type Effect,
  type ReleasePlan,
} from './plan-contract';

export type DispositionCounts = Record<Disposition, number>;

function emptyCounts(): DispositionCounts {
  return { blocked: 0, needs_decision: 0, deferred: 0, will_apply: 0 };
}

// What the engine found, which is all the menu's status counts and `planState`
// read. It ignores any selection a person makes: excluding the last blocker
// must not turn a blocked plan into "all clear".
export function evaluationCounts(effects: Effect[]): DispositionCounts {
  const counts = emptyCounts();
  for (const effect of effects) counts[effect.disposition] += 1;
  return counts;
}

export function nonEmptyDispositions(counts: DispositionCounts): Disposition[] {
  return DISPOSITIONS.filter((key) => counts[key] > 0);
}

export type PlanState =
  | 'incomplete'
  | 'stale'
  | 'applied'
  | 'partially_applied'
  | 'empty'
  | 'fully_blocked'
  | 'all_clear'
  | 'mixed';

// Precedence matters and is asserted in tests. An incomplete run with zero
// effects is "Run incomplete", never "Nothing to do": the run's failure
// explains the absence, and the quieter message would hide it.
export function planState(plan: ReleasePlan): PlanState {
  if (plan.status.kind === 'incomplete') return 'incomplete';
  if (plan.status.kind === 'stale') return 'stale';
  if (plan.status.kind === 'applied') return 'applied';
  if (plan.status.kind === 'partially_applied') return 'partially_applied';
  if (plan.effects.length === 0) return 'empty';

  const counts = evaluationCounts(plan.effects);
  const present = nonEmptyDispositions(counts);
  if (present.length === 1 && present[0] === 'blocked') return 'fully_blocked';
  if (present.length === 1 && present[0] === 'will_apply') return 'all_clear';
  return 'mixed';
}
