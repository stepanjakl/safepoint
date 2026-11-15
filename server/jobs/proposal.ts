import 'server-only';

import { fingerprintOf, hashOf } from '@/lib/definitions/fingerprint';
import { newActivity } from '@/lib/definitions/propose';
import type { KeptRead } from '@/lib/definitions/records';
import {
  draftProgressSchema,
  type DefinitionProcess,
  type DefinitionSet,
  type DraftProgress,
} from '@/lib/definitions/types';
import type { Resolve } from '@/lib/definitions/calls';
import type { DraftingModel } from '@/lib/models';
import { attemptRecorder } from '@/server/storage/model-attempts';
import { propose, runKeyOf } from '@/server/storage/proposals';

import { jobProgress, startJob } from './run-job';

/*
  Server-only. A proposal as a server-side job, as a draft is (draft.ts): it
  carries on when the page is closed, its progress kept in the `jobs` table as
  it goes, so one the server stopped part way through says so.
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

export function startProposal(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  options: { model?: DraftingModel | null; resolve?: Resolve } = {},
): Promise<DraftProgress> {
  const job = jobFor(owner, readId, fingerprintOf(set));
  return startJob({
    ...job,
    initial: {
      step: 'Proposing…',
      error: null,
      running: true,
      activity: newActivity(),
    },
    work: async (progress, note) => {
      // A poll in this process reads the job held in memory; the row is what
      // another process or a restart reads, so a thought arriving word by
      // word is written now and then.
      let noted = 0;
      const changed = () => {
        if (Date.now() - noted < NOTE_EVERY_MS) return;
        noted = Date.now();
        void note();
      };
      // Each model call, as part of this job; written before the job ends.
      const record = attemptRecorder({
        process: job.process,
        jobKind: job.kind,
        jobKey: job.key,
        instructionsHash: hashOf(text),
        readId,
        fingerprint: fingerprintOf(set),
      });
      const done = await propose(owner, set, read, readId, text, {
        ...options,
        record,
        watch: { activity: progress.activity!, changed },
        onBatch: (at, of) => {
          progress.step =
            of > 1 ? `Proposing ${at} of ${of} batches…` : 'Proposing…';
          void note();
        },
      }).finally(record.settled);
      progress.step = `Proposed for ${Object.keys(done.records).length} ${owner.subject.record.plural}.`;
    },
    settle: (progress) => {
      progress.activity!.thought = null;
      progress.activity!.writing = 0;
    },
  });
}

const NOTE_EVERY_MS = 2000;
