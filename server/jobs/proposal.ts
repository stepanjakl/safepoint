import 'server-only';

import { fingerprintOf, hashOf, noRules } from '@/lib/engine/fingerprint';
import { newActivity } from '@/lib/engine/propose';
import type { KeptRead } from '@/lib/engine/records';
import {
  draftProgressSchema,
  type DefinitionProcess,
  type DefinitionSet,
  type DraftProgress,
} from '@/lib/engine/types';
import type { Resolve } from '@/lib/engine/calls';
import type { DraftingModel } from '@/lib/models';
import { runKeyOf } from '@/server/storage/proposals';
import { proposalWorkflow } from '@/server/workflows/proposal';
import { holdStandIns } from '@/server/workflows/stand-ins';

import { jobProgress, startJob } from './run-job';

/*
  Server-only. A proposal as a server-side job, as a draft is (draft.ts): it
  carries on when the page is closed, and after a restart or a redeploy (a
  workflow run, server/workflows/proposal.ts), its progress kept in the
  `jobs` table as it goes, so one that stopped part way and was not carried
  on says so.
*/
export const INTERRUPTED =
  'The server stopped during this proposal, so it did not finish. Propose again to carry on from where it stopped.';

const jobFor = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) => {
  const key = runKeyOf(owner, readId, fingerprint);
  return {
    kind: 'proposals' as const,
    process: key.process,
    key: `${key.readId}:${key.fingerprint}`,
    schema: draftProgressSchema,
    interrupted: INTERRUPTED,
  };
};

export async function proposalProgress(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): Promise<DraftProgress | null> {
  return jobProgress(jobFor(owner, readId, fingerprint));
}

// Starts a proposal on the read `readId` names and the rules `set` is,
// unless one is running for them, here or in another process.
export function startProposal(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  options: { model?: DraftingModel | null; resolve?: Resolve } = {},
): Promise<DraftProgress> {
  const fingerprint = fingerprintOf(set);
  const job = jobFor(owner, readId, fingerprint);
  const { resolve } = options;
  return startJob({
    ...job,
    initial: {
      step: 'Proposing…',
      error: null,
      running: true,
      activity: newActivity(),
    },
    workflow: proposalWorkflow,
    input: (holder) => ({
      job: { kind: job.kind, process: job.process, key: job.key },
      holder,
      instructions: hashOf(text),
      readId,
      fingerprint,
      // No rules: the model proposes from the instructions alone.
      rules: fingerprint !== fingerprintOf(noRules(text)),
      model: options.model ?? null,
    }),
    held: resolve ? (holder) => holdStandIns(holder, resolve) : undefined,
  });
}
