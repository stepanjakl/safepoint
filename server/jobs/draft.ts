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
import {
  runOf,
  textOf,
  type RulebookAt,
} from '@/server/storage/rules/rulebooks';

import { jobProgress, startJob } from './run-job';

/*
  Server-only. A whole draft: the definitions found again, then each written
  in order, on the server, so it carries on when the page is closed, and
  after a restart or a redeploy (a workflow run, server/workflows/draft.ts).
  Writing one definition again is the same kind of job, for the same reason.
  One job per version of the instructions, and one per run that keeps its
  own rulebook, so such runs draft side by side. Its progress is kept in the `jobs`
  table as it goes, so a job that stopped part way and was not carried on
  says so, rather than vanishing.
*/

const INTERRUPTED =
  'The server stopped while this was being written, so it did not finish. Try it again.';

// A draft's key: its instructions' hash, and the run whose own rulebook it is.
const draftKey = (hash: string, run: string | null) =>
  run ? `${hash}:${run}` : hash;

const jobFor = (owner: DefinitionProcess, at: RulebookAt) => ({
  kind: 'drafts' as const,
  process: owner.id,
  key: draftKey(hashOf(textOf(at)), runOf(at)),
  schema: draftProgressSchema,
  interrupted: INTERRUPTED,
});

export const draftProgress = (owner: DefinitionProcess, at: RulebookAt) =>
  jobProgress(jobFor(owner, at));

// The same job by the hash of its instructions, as a run keeps them.
export const draftProgressByHash = (
  owner: DefinitionProcess,
  hash: string,
  run: string | null = null,
) => jobProgress({ ...jobFor(owner, ''), key: draftKey(hash, run) });

// What every draft job's run is given: ids, never what they name.
const draftRunOf = (
  job: ReturnType<typeof jobFor>,
  at: RulebookAt,
  holder: string,
  read: KeptRead,
  asking: Asking,
): DraftRun => ({
  job: { kind: job.kind, process: job.process, key: job.key },
  instructions: hashOf(textOf(at)),
  rulebookRun: runOf(at),
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
  at: RulebookAt,
  version: string,
  read: KeptRead,
  asking: Asking = {},
): Promise<DraftProgress> {
  fitting(read, owner.subject.data);
  const job = jobFor(owner, at);
  const since = Date.now();
  return startJob({
    ...job,
    initial: initial('Finding the definitions in the instructions…'),
    workflow: draftWorkflow,
    input: (holder) => ({
      ...draftRunOf(job, at, holder, read, asking),
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
  at: RulebookAt,
  read: KeptRead,
  id: string,
  asking: Asking = {},
): Promise<DraftProgress> {
  const job = jobFor(owner, at);
  // What the definition is now: written by this job once it is not.
  const before = await writtenNow(owner, at, id);
  return startJob({
    ...job,
    initial: initial('Writing it again…'),
    workflow: rewriteWorkflow,
    input: (holder) => ({
      ...draftRunOf(job, at, holder, read, asking),
      found: { id, name: id },
      before,
    }),
    held: standIns(asking),
  });
}
