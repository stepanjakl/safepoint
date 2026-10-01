import { notFound } from 'next/navigation';

import { loadReviewedReplay } from '@/lib/promotion-release';

import { PolicyWorkbench } from './workbench';

export const dynamic = 'force-dynamic';

export default function PolicyWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const replay = loadReviewedReplay();
  return (
    <PolicyWorkbench
      sourceScenario={replay.scenario}
      sourceProposal={replay.proposal}
      baselines={replay.lines.map((line) => ({
        sku: line.sku,
        eligibility: line.policyEvaluation.eligibility,
        findingCodes: line.policyEvaluation.findings.map(({ code }) => code),
        findings: line.policyEvaluation.findings,
        gateObligations: line.policyEvaluation.gateObligations.map(
          ({ gate, obligation }) => ({ gate, obligation }),
        ),
      }))}
      todayAt={new Date().toISOString()}
    />
  );
}
