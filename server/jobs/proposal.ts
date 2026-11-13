import { fingerprintOf } from '@/lib/definitions/fingerprint';
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
import { propose, runKeyOf } from '@/server/storage/proposals';
import { runFile } from '@/server/storage/run-key';

import { jobProgress, startJob } from './run-job';

/*
  Server-only. A proposal as a server-side job, as a draft is (draft.ts): it
  carries on when the page is closed, its progress written as it goes, so one
  the server stopped part way through says so.
*/
const INTERRUPTED =
  'The server stopped during this proposal, so it did not finish. Propose again to carry on from where it stopped.';

const jobFor = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) => {
  const key = runKeyOf(owner, readId, fingerprint);
  return {
    kind: 'proposals',
    key: `${owner.id}:${readId}:${fingerprint}`,
    file: runFile('proposals', key, 'progress'),
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
): DraftProgress {
  return startJob({
    ...jobFor(owner, readId, fingerprintOf(set)),
    initial: {
      step: 'Proposing…',
      error: null,
      running: true,
      activity: newActivity(),
    },
    work: async (progress, note) => {
      // A poll reads the job held in memory; the file only outlives a restart,
      // so a thought arriving word by word is written now and then.
      let noted = 0;
      const changed = () => {
        if (Date.now() - noted < NOTE_EVERY_MS) return;
        noted = Date.now();
        void note();
      };
      const done = await propose(owner, set, read, readId, text, {
        ...options,
        watch: { activity: progress.activity!, changed },
        onBatch: (at, of) => {
          progress.step =
            of > 1 ? `Proposing ${at} of ${of} batches…` : 'Proposing…';
          void note();
        },
      });
      progress.step = `Proposed for ${Object.keys(done.records).length} ${owner.subject.record.plural}.`;
    },
    settle: (progress) => {
      progress.activity!.thought = null;
      progress.activity!.writing = 0;
    },
  });
}

const NOTE_EVERY_MS = 2000;
