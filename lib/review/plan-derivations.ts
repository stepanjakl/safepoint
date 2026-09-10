import {
  DISPOSITIONS,
  type Disposition,
  type Effect,
  type Noun,
  type ReleasePlan,
} from './plan-contract';

export type DispositionCounts = Record<Disposition, number>;

function emptyCounts(): DispositionCounts {
  return { blocked: 0, needs_decision: 0, deferred: 0, will_apply: 0 };
}

// What the engine found. This is the only input to the bar, the pills, the
// verdict line and `planState`. It deliberately ignores the user's selection:
// excluding the last blocker must not turn a blocked plan into "all clear".
export function evaluationCounts(effects: Effect[]): DispositionCounts {
  const counts = emptyCounts();
  for (const effect of effects) counts[effect.disposition] += 1;
  return counts;
}

// What the user has currently chosen to apply. Drives the footer counter and
// nothing else.
export function selectedCounts(
  effects: Effect[],
  excluded: ReadonlySet<string>,
): DispositionCounts {
  const counts = emptyCounts();
  for (const effect of effects) {
    if (excluded.has(effect.id)) continue;
    counts[effect.disposition] += 1;
  }
  return counts;
}

export function totalOf(counts: DispositionCounts): number {
  return DISPOSITIONS.reduce((sum, key) => sum + counts[key], 0);
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

function plural(count: number, noun: Noun): string {
  return count === 1 ? noun.one : noun.other;
}

// Everything that is not `will_apply` is something a person has to look at.
// One question, so one derivation: the tabs below the line answer which bucket.
export function needingAttention(counts: DispositionCounts): number {
  return counts.blocked + counts.needs_decision + counts.deferred;
}

// Generated from the counts, never authored per domain. A hand-written summary
// drifts out of sync with the numbers directly beneath it.
//
// Deliberately does not enumerate the buckets. The tabs carry each bucket's
// count and are the only place those digits appear; a line that repeated them
// made the reader check three renderings of one distribution against each other.
export function attentionLine(counts: DispositionCounts, noun: Noun): string {
  const needing = needingAttention(counts);
  const total = totalOf(counts);
  // A large clean count is not news, so the clean case says so and stops.
  if (needing === 0) {
    return `${total} ${plural(total, noun)} will apply. Nothing needs attention.`;
  }
  // The noun agrees with the total it qualifies; the verb agrees with the
  // count in front of it. "1 of 27 items needs attention."
  const verb = needing === 1 ? 'needs' : 'need';
  return `${needing} of ${total} ${plural(total, noun)} ${verb} attention.`;
}

// A bucket at or below the budget shows every one of its items: the common
// case is a handful, and truncating it made the card hide rows for no gain.
// Past the budget the item list stops being readable at all, so the shape of
// the problem -- the reason distribution -- is what the card shows instead.
export const ROW_BUDGET = 8;
export const MAX_REASON_ROWS = 5;

export type ReasonRollUp = { key: string; label: string; count: number };

// Above the threshold the shape of the problem is the reason distribution, and
// item-level detail belongs in the modal. Reason counts are bounded even when
// item counts are not.
export function rollUpByReason(
  effects: Effect[],
  reasons: { key: string; label: string }[],
): ReasonRollUp[] {
  const labels = new Map(reasons.map((reason) => [reason.key, reason.label]));
  // Ties break on the engine's declared reason order, which carries meaning;
  // sorting on the key would order groups by an identifier nobody reads.
  const declared = new Map(reasons.map((reason, index) => [reason.key, index]));
  const counts = new Map<string, number>();
  let unattributed = 0;
  for (const effect of effects) {
    if (effect.reasonKey === null) {
      unattributed += 1;
      continue;
    }
    counts.set(effect.reasonKey, (counts.get(effect.reasonKey) ?? 0) + 1);
  }
  const rows: ReasonRollUp[] = [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: labels.get(key) ?? key,
      count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (declared.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
          (declared.get(b.key) ?? Number.MAX_SAFE_INTEGER),
    );
  if (unattributed > 0) {
    rows.push({
      key: '__unattributed__',
      label: 'No recorded reason',
      count: unattributed,
    });
  }
  return rows;
}

// What one bucket's panel shows. Two shapes, because past the budget the rows
// stop being items at all -- and a caller that has to tell them apart is what
// keeps the card from rendering a reason row as if it were clickable evidence.
export type BucketRows =
  | { kind: 'items'; items: Effect[]; hidden: number }
  | { kind: 'reasons'; reasons: ReasonRollUp[]; hidden: number };

export function bucketRows(
  effects: Effect[],
  reasons: { key: string; label: string }[],
): BucketRows {
  if (effects.length <= ROW_BUDGET) {
    return { kind: 'items', items: effects, hidden: 0 };
  }
  const all = rollUpByReason(effects, reasons);
  const shown = all.slice(0, MAX_REASON_ROWS);
  // Counted in items, not in reason rows: "and 11 more" has to mean eleven
  // things the reader could have looked at, or the number is a lie.
  const covered = shown.reduce((sum, row) => sum + row.count, 0);
  return { kind: 'reasons', reasons: shown, hidden: effects.length - covered };
}

export function effectsByDisposition(
  effects: Effect[],
  disposition: Disposition,
): Effect[] {
  return effects.filter((effect) => effect.disposition === disposition);
}

export function appliedSummary(plan: ReleasePlan): {
  applied: number;
  total: number;
} | null {
  if (
    plan.status.kind === 'applied' ||
    plan.status.kind === 'partially_applied'
  )
    return {
      applied: plan.status.appliedIds.length,
      total: plan.effects.length,
    };
  return null;
}

// The bar's nominal width at the card's narrowest supported layout. Segment
// visibility is decided from this rather than measured, so the same plan always
// produces the same bar.
const NOMINAL_BAR_WIDTH = 320;
const MINIMUM_SEGMENT_WIDTH = 8;

export type BarSegment = { disposition: Disposition; count: number };

// A sliver narrower than the gap between segments reads as noise. Buckets that
// cannot meet the minimum are dropped from the bar and carried by their pill,
// which is never dropped.
export function barSegments(counts: DispositionCounts): BarSegment[] {
  const total = totalOf(counts);
  if (total === 0) return [];
  return nonEmptyDispositions(counts)
    .filter(
      (disposition) =>
        (counts[disposition] / total) * NOMINAL_BAR_WIDTH >=
        MINIMUM_SEGMENT_WIDTH,
    )
    .map((disposition) => ({ disposition, count: counts[disposition] }));
}
