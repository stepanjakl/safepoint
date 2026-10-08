'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

import type { ChecksReport } from '@/lib/rulebook/checks';
import type { Evaluation } from '@/lib/rulebook/engine';

import { clock, useTrial } from './trial-parts';

/*
  One evaluation, shared by the Calculate and Check steps: Calculate starts it
  and shows the times and facts; Check shows the rules and the owner's checks.
  A what-if reruns the last request with values typed in the Check step;
  pressing Calculate again starts clean.
*/

export type EvaluateResponse =
  | {
      kind: 'result';
      source: string;
      chosen: string;
      // Which rulebook ran: the approved one, or a draft under test.
      rulebook: RulebookUsed;
      evaluation: Evaluation;
      checks: ChecksReport;
      // What-if values that could not be read, left out of this evaluation.
      whatIfIssues: { key: string; name: string; issue: string }[];
      // Checks the approved rulebook no longer passes on this read.
      drift: { where: string; message: string }[];
    }
  | { kind: 'no_rulebook' }
  | { kind: 'not_configured'; missing: string[] }
  | { kind: 'error'; message: string };

export type RulebookUsed =
  | {
      kind: 'approved';
      version: number;
      approved_at: string;
      drafted: { model: string; run_id: string; at: string };
    }
  | { kind: 'draft'; file: string; startedAt: string; model: string };

// How a result names the rulebook it ran, everywhere it is shown.
export const rulebookName = (r: RulebookUsed) =>
  r.kind === 'approved'
    ? `Rulebook v${r.version}`
    : `The draft of ${r.startedAt.slice(0, 10)} ${clock(r.startedAt)} (not approved)`;

// A saved draft the Rules step has on screen, which Calculate can test.
export type Candidate = { file: string; startedAt: string };

// Typed values per item key, then per editable value name.
export type WhatIf = Record<string, Record<string, string>>;

type Value = ReturnType<typeof useTrial<EvaluateResponse>> & {
  whatIf: WhatIf;
  candidate: Candidate | null;
  setCandidate: (candidate: Candidate | null) => void;
  // Reruns the last evaluation with these values; {} clears them.
  runWhatIf: (whatIf: WhatIf) => Promise<EvaluateResponse | null>;
};
const EvaluationContext = createContext<Value | null>(null);

export function EvaluationProvider({ children }: { children: ReactNode }) {
  const trial = useTrial<EvaluateResponse>('/api/dev/brunch/evaluate');
  const trialRun = trial.run;
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [last, setLast] = useState<{ body: object; whatIf: WhatIf } | null>(
    null,
  );
  const run = useCallback(
    (body?: unknown) => {
      setLast({ body: (body ?? {}) as object, whatIf: {} });
      return trialRun(body);
    },
    [trialRun],
  );
  const runWhatIf = useCallback(
    (whatIf: WhatIf) => {
      const body = last?.body ?? {};
      setLast({ body, whatIf });
      return trialRun({ ...body, whatIf });
    },
    [trialRun, last],
  );
  return (
    <EvaluationContext
      value={{
        ...trial,
        run,
        whatIf: last?.whatIf ?? {},
        runWhatIf,
        candidate,
        setCandidate,
      }}
    >
      {children}
    </EvaluationContext>
  );
}

export function useEvaluation() {
  const value = useContext(EvaluationContext);
  if (!value) throw new Error('useEvaluation needs an EvaluationProvider.');
  return value;
}
