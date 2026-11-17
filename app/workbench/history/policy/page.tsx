import { loadReviewedReplay } from '@/lib/prototype/promotion-release';
import { parseSkuParam } from '@/lib/prototype/review-presentation';

import { HistoryNote } from '../history-note';
import { PolicyWorkbench } from './workbench';

export const dynamic = 'force-dynamic';

export default async function PolicyWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const replay = loadReviewedReplay();
  return (
    <PolicyWorkbench
      note={
        <HistoryNote made="1 October 2026">
          The policy workbench of the promotion-release prototype: edit a
          product&rsquo;s price and supplier top-up and see its policy findings
          change against the source evidence. It runs on the prototype&rsquo;s
          recorded evidence for a promotion of September 2026.
        </HistoryNote>
      }
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
      initialSku={parseSkuParam((await searchParams).sku) ?? 'ALD-0001'}
    />
  );
}
