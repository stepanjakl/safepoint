import 'server-only';

import type { Asking } from '@/lib/definitions/find';
import { hashOf } from '@/lib/definitions/fingerprint';
import { fitting, type KeptRead } from '@/lib/definitions/records';
import {
  draftProgressSchema,
  type DefinitionProcess,
  type DraftProgress,
} from '@/lib/definitions/types';
import { findDefinitions } from '@/server/operations/find';
import { writeAgreed } from '@/server/operations/write';
import {
  attemptRecorder,
  type Recorder,
} from '@/server/storage/model-attempts';
import { ownerToDraft } from '@/server/storage/rulebooks';

import { jobProgress, runningJob, startJob } from './run-job';

/*
  Server-only. A whole draft: the definitions found again, then each written
  in order, on the server, so it carries on when the page is closed. Writing
  one definition again is the same kind of job, for the same reason. One job
  per version of the instructions. Its progress is held while the server runs
  and kept in the `jobs` table as it goes, so a job the server stopped part
  way through says so, rather than vanishing.
*/

const INTERRUPTED =
  'The server stopped while this was being written, so it did not finish. Try it again.';

const jobFor = (owner: DefinitionProcess, text: string) => ({
  kind: 'drafts' as const,
  process: owner.id,
  key: hashOf(text),
  schema: draftProgressSchema,
  interrupted: INTERRUPTED,
});

export const draftProgress = (owner: DefinitionProcess, text: string) =>
  jobProgress(jobFor(owner, text));

// Runs a job unless one is running for these instructions, recording its
// progress; what it resolves to is its last word.
function startDraftJob(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  step: string,
  work: (
    progress: DraftProgress,
    note: () => Promise<void>,
    record: Recorder,
  ) => Promise<string>,
): Promise<DraftProgress> {
  const job = jobFor(owner, text);
  return startJob({
    ...job,
    initial: { step, error: null, running: true, writing: null },
    work: async (progress, note) => {
      // Each model call, as part of this job; written before the job ends.
      const record = attemptRecorder({
        process: job.process,
        jobKind: job.kind,
        jobKey: job.key,
        instructionsHash: job.key,
        readId: read.id,
      });
      try {
        progress.step = await work(progress, note, record);
      } finally {
        await record.settled();
      }
    },
    settle: (progress) => {
      progress.writing = null;
    },
  });
}

// Starts a draft unless a job is running for these instructions, here or in
// another process; the read must fit the process's declaration first, and
// that is refused at once, not by the promise.
export function startDraft(
  owner: DefinitionProcess,
  text: string,
  version: string,
  read: KeptRead,
  asking: Asking = {},
): Promise<DraftProgress> {
  const running = runningJob<DraftProgress>(jobFor(owner, text));
  if (running) return Promise.resolve(running);
  fitting(read, owner.subject.data);
  return startDraftJob(
    owner,
    text,
    read,
    'Finding the definitions in the instructions…',
    async (progress, note, record) => {
      // On the confirmed data profile, when one is kept; the set records it.
      const drafting = await ownerToDraft(owner);
      const found = await findDefinitions(drafting, text, version, read, {
        ...asking,
        record,
      });
      for (const [index, definition] of found.definitions.entries()) {
        progress.writing = definition.id;
        await writeAgreed(drafting, text, read, definition.id, {
          ...asking,
          record,
          onRun: async (run) => {
            progress.step = `Writing ${index + 1} of ${found.definitions.length}: ${definition.name}${run > 1 ? `, write ${run}` : ''}…`;
            await note();
          },
        });
      }
      const count = found.definitions.length;
      return `Drafted ${count} definition${count === 1 ? '' : 's'}.`;
    },
  );
}

// Writes one definition again, as a job, so a person can leave or reload the
// page and still find out it is being written, and what came of it.
export function startRewrite(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
  asking: Asking = {},
): Promise<DraftProgress> {
  return startDraftJob(
    owner,
    text,
    read,
    'Writing it again…',
    async (progress, note, record) => {
      progress.writing = id;
      await writeAgreed(owner, text, read, id, {
        ...asking,
        record,
        onRun: async (run) => {
          progress.step = `Writing it again${run > 1 ? `, write ${run}` : ''}…`;
          await note();
        },
      });
      return 'Written again.';
    },
  );
}
