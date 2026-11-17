import 'server-only';

import type { Outcome, ProposalRun } from './types';

/*
  Server-only. The steps of a proposal (proposal.ts), each a unit whose
  result the run keeps, loading its work (proposal-work.ts) when it runs, as
  draft-steps.ts does and for the same reason.
*/

export async function batchesStep(
  run: ProposalRun,
): Promise<Outcome<string[][]>> {
  'use step';
  return (await import('./proposal-work')).batches(run);
}

export async function batchStep(
  run: ProposalRun,
  keys: string[],
  at: { index: number; of: number },
): Promise<Outcome<null>> {
  'use step';
  return (await import('./proposal-work')).answer(run, keys, at);
}

export async function finishStep(
  run: ProposalRun,
  at: string,
): Promise<Outcome<string>> {
  'use step';
  return (await import('./proposal-work')).finish(run, at);
}

export async function settleProposal(
  run: ProposalRun,
  end: { step: string | null; error: string | null },
): Promise<void> {
  'use step';
  await (await import('./proposal-work')).end(run, end);
}
