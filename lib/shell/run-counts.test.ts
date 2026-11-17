import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from '@/lib/promotion-release';
import { promotionProcess, supportProcess } from './placeholder-process';
import { evaluationCounts } from '@/lib/review/plan-derivations';
import { presentPromotionPlan } from '@/lib/review/promotion-adapter';
import { supportPlan } from '@/lib/review/support-fixture';
import type { ReleasePlan } from '@/lib/review/plan-contract';
import type { ProcessSummary } from './model';

/*
  The runs rail and the process menu's release preview describe the same run,
  in the same words and the same order. They read it from different places --
  the rail from the process fixture, the preview from the plan itself -- so
  nothing but this stops them drifting apart, and a reader who sees the two
  disagree has no way to tell which one is lying.

  Only the current run is held to it. Earlier runs are placeholder data by
  design: there is no recorded plan behind them to check against.
*/
function currentRun(process: ProcessSummary) {
  const run = process.runs.find((entry) => entry.current);
  if (!run) throw new Error(`${process.id} has no current run`);
  return run;
}

describe.each([
  ['promotion', promotionProcess, presentPromotionPlan(loadReviewedReplay())],
  ['support', supportProcess, supportPlan],
] satisfies [string, ProcessSummary, ReleasePlan][])(
  '%s current run',
  (_name, process, plan) => {
    const run = currentRun(process);
    const counts = evaluationCounts(plan.effects);

    it('counts every line the plan does', () => {
      expect(run.counts.items).toBe(plan.effects.length);
    });

    it('carries the plan’s own dispositions', () => {
      expect({
        blocked: run.counts.blocked ?? 0,
        needsDecision: run.counts.needsDecision ?? 0,
        deferred: run.counts.deferred ?? 0,
      }).toEqual({
        blocked: counts.blocked,
        needsDecision: counts.needs_decision,
        deferred: counts.deferred,
      });
    });

    it('leaves a disposition off rather than showing a zero', () => {
      for (const [key, value] of Object.entries(run.counts)) {
        if (key !== 'items') expect(value).not.toBe(0);
      }
    });
  },
);
