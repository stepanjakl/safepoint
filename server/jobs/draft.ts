import 'server-only';

import type { Asking } from '@/lib/engine/find';
import { hashOf } from '@/lib/engine/fingerprint';
import { fitting, type KeptRead } from '@/lib/engine/records';
import {
  draftProgressSchema,
  type DefinitionProcess,
  type DraftProgress,
} from '@/lib/engine/types';
import { draftWorkflow, rewriteWorkflow } from '@/server/workflows/draft';
import { writtenNow } from '@/server/workflows/draft-work';
import type { DraftRun } from '@/server/workflows/types';
import { holdStandIns } from '@/server/workflows/stand-ins';

import { jobProgress, startJob } from './run-job';

/*
  Server-only. A whole draft: the definitions found again, then each written
  in order, on the server, so it carries on when the page is closed, and
  after a restart or a redeploy (a workflow run, server/workflows/draft.ts).
  Writing one definition again is the same kind of job, for the same reason.
  One job per version of the instructions. Its progress is kept in the `jobs`
  table as it goes, so a job that stopped part way and was not carried on
  says so, rather than vanishing.
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

// What every draft job's run is given: ids, never what they name.
const runOf = (
  job: ReturnType<typeof jobFor>,
  holder: string,
  read: KeptRead,
  asking: Asking,
): DraftRun => ({
  job: { kind: job.kind, process: job.process, key: job.key },
  holder,
  readId: read.id,
  model: asking.model ?? null,
});

const initial = (step: string): DraftProgress => ({
  step,
  error: null,
  running: true,
  writing: null,
});

// A test's stand-in models, kept for the start that holds the key.
const standIns = (asking: Asking) =>
  asking.resolve
    ? (holder: string) => holdStandIns(holder, asking.resolve!)
    : undefined;

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
  fitting(read, owner.subject.data);
  const job = jobFor(owner, text);
  const since = Date.now();
  return startJob({
    ...job,
    initial: initial('Finding the definitions in the instructions…'),
    workflow: draftWorkflow,
    input: (holder) => ({
      ...runOf(job, holder, read, asking),
      version,
      since,
    }),
    held: standIns(asking),
  });
}

// Writes one definition again, as a job, so a person can leave or reload the
// page and still find out it is being written, and what came of it.
export async function startRewrite(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
  asking: Asking = {},
): Promise<DraftProgress> {
  const job = jobFor(owner, text);
  // What the definition is now: written by this job once it is not.
  const before = await writtenNow(owner, text, id);
  return startJob({
    ...job,
    initial: initial('Writing it again…'),
    workflow: rewriteWorkflow,
    input: (holder) => ({
      ...runOf(job, holder, read, asking),
      found: { id, name: id },
      before,
    }),
    held: standIns(asking),
  });
}
