import 'server-only';

import {
  batchesStep,
  batchStep,
  finishStep,
  settleProposal,
} from './proposal-steps';
import type { ProposalRun } from './types';
import { said } from './said';

/*
  Server-only. A proposal as a Vercel Workflow run (server/jobs/proposal.ts
  starts it): the records left to answer, each batch answered in a step of
  its own, then the whole kept. Each step's result is kept by the run, so a
  proposal a restart or a redeploy interrupted carries on from the last batch
  that finished. Only orchestration is here, as in draft.ts.
*/

export async function proposalWorkflow(run: ProposalRun) {
  'use workflow';
  try {
    const batches = await batchesStep(run);
    if ('stopped' in batches)
      return await settleProposal(run, { step: null, error: batches.stopped });
    for (const [index, keys] of batches.done.entries()) {
      const answered = await batchStep(run, keys, {
        index,
        of: batches.done.length,
      });
      if ('stopped' in answered)
        return await settleProposal(run, {
          step: null,
          error: answered.stopped,
        });
    }
    // The instant it is proposed at, chosen by the run: the same if the
    // step that keeps it runs twice, so it is kept once.
    const finished = await finishStep(run, new Date().toISOString());
    await settleProposal(
      run,
      'stopped' in finished
        ? { step: null, error: finished.stopped }
        : { step: finished.done, error: null },
    );
  } catch (error) {
    await settleProposal(run, { step: null, error: said(error) });
  }
}
