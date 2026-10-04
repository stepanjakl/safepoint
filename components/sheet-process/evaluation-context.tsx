'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { CheckResult } from '@/lib/rulebook/checks';
import type { LocalDate } from '@/lib/rulebook/cycle';
import type { Evaluation } from '@/lib/rulebook/engine';

import { useTrial } from './trial-parts';

/*
  One evaluation, shared by the Calculate and Check steps: Calculate starts it
  and shows the times and facts; Check shows the rules and the store's checks.
*/

export type EvaluateResponse =
  | {
      kind: 'result';
      source: string;
      chosen: string;
      rulebook: {
        version: number;
        approved_at: string;
        drafted: { model: string; run_id: string; at: string };
      };
      evaluation: Evaluation;
      checks: {
        reference: LocalDate;
        results: CheckResult[];
        missingHeaders: string[];
        found: boolean;
      };
    }
  | { kind: 'no_rulebook' }
  | { kind: 'not_configured'; missing: string[] }
  | { kind: 'error'; message: string };

type Value = ReturnType<typeof useTrial<EvaluateResponse>>;
const EvaluationContext = createContext<Value | null>(null);

export function EvaluationProvider({ children }: { children: ReactNode }) {
  const trial = useTrial<EvaluateResponse>('/api/dev/brunch/evaluate');
  return <EvaluationContext value={trial}>{children}</EvaluationContext>;
}

export function useEvaluation() {
  const value = useContext(EvaluationContext);
  if (!value) throw new Error('useEvaluation needs an EvaluationProvider.');
  return value;
}
