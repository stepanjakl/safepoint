import 'server-only';

import path from 'node:path';

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
import { ownerToDraft } from '@/server/storage/rulebooks';
import { runDataDir } from '@/server/storage/run-data';

import { jobProgress, runningJob, startJob } from './run-job';

/*
  Server-only. A whole draft: the definitions found again, then each written
  in order, on the server, so it carries on when the page is closed. Writing
  one definition again is the same kind of job, for the same reason. One job
  per version of the instructions. Its progress is held while the server runs
  and written to data/<process>/drafts/ as it goes, so a job the server
  stopped part way through says so, rather than vanishing.
*/

const INTERRUPTED =
  'The server stopped while this was being written, so it did not finish. Try it again.';

const jobFor = (owner: DefinitionProcess, text: string) => ({
  kind: 'drafts',
  key: `${owner.id}:${hashOf(text)}`,
  file: path.join(runDataDir(owner.id, 'drafts'), `${hashOf(text)}.json`),
  schema: draftProgressSchema,
  interrupted: INTERRUPTED,
  compact: true,
});

export const draftProgress = (owner: DefinitionProcess, text: string) =>
  jobProgress(jobFor(owner, text));

// Runs a job unless one is running for these instructions, recording its
// progress; what it resolves to is its last word.
function startDraftJob(
  owner: DefinitionProcess,
  text: string,
  step: string,
  work: (progress: DraftProgress, note: () => Promise<void>) => Promise<string>,
): DraftProgress {
  return startJob({
    ...jobFor(owner, text),
    initial: { step, error: null, running: true, writing: null },
    work: async (progress, note) => {
      progress.step = await work(progress, note);
    },
    settle: (progress) => {
      progress.writing = null;
    },
  });
}

// Starts a draft unless a job is running for these instructions; the read must
// fit the process's declaration first.
export function startDraft(
  owner: DefinitionProcess,
  text: string,
  version: string,
  read: KeptRead,
  asking: Asking = {},
): DraftProgress {
  const running = runningJob<DraftProgress>(jobFor(owner, text));
  if (running) return running;
  fitting(read, owner.subject.data);
  return startDraftJob(
    owner,
    text,
    'Finding the definitions in the instructions…',
    async (progress, note) => {
      // On the confirmed data profile, when one is kept; the set records it.
      const drafting = await ownerToDraft(owner);
      const found = await findDefinitions(
        drafting,
        text,
        version,
        read,
        asking,
      );
      for (const [index, definition] of found.definitions.entries()) {
        progress.writing = definition.id;
        await writeAgreed(drafting, text, read, definition.id, {
          ...asking,
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
): DraftProgress {
  return startDraftJob(
    owner,
    text,
    'Writing it again…',
    async (progress, note) => {
      progress.writing = id;
      await writeAgreed(owner, text, read, id, {
        ...asking,
        onRun: async (run) => {
          progress.step = `Writing it again${run > 1 ? `, write ${run}` : ''}…`;
          await note();
        },
      });
      return 'Written again.';
    },
  );
}
