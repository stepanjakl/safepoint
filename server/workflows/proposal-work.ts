import 'server-only';

import { fingerprintOf, noRules } from '@/lib/engine/fingerprint';
import type { DefinitionProcess, DefinitionSet } from '@/lib/engine/types';
import {
  answerBatch,
  finishProposal,
  proposalBatches,
} from '@/server/storage/reads/proposals';
import {
  loadRevision,
  loadSet,
  ownerFor,
} from '@/server/storage/rules/rulebooks';

import { inStep, instructionsOf, readOf, settle } from './in-step';
import { standInsFor } from './stand-ins';
import type { Outcome, ProposalRun } from './types';

/*
  Server-only. What the steps of a proposal do (proposal-steps.ts): find the
  records left to answer, in batches; answer one batch; keep the whole; say
  how it ended. Each is handed ids, reads what it works on where it is kept,
  and may be done twice: a batch builds on the part already kept
  (`answer_parts`) and asks only for the records it does not answer, and the
  whole is kept once, at the instant the run chose for it
  (server/storage/reads/proposals.ts).
*/

const STARTING = { step: '', error: null, running: true };

// A thought arriving word by word is written now and then, not every word.
const NOTE_EVERY_MS = 2000;

// The rules the proposal was started on: the ones kept for the instructions
// while they are still the same, or that accepted revision.
async function setOf(
  run: ProposalRun,
  owner: DefinitionProcess,
  text: string,
): Promise<DefinitionSet> {
  if (!run.rules) return noRules(text);
  const current = await loadSet(owner, text);
  if (current && fingerprintOf(current) === run.fingerprint) return current;
  const revision = await loadRevision(owner, text, run.fingerprint);
  if (!revision)
    throw new Error('The rules this proposal was started on are not kept.');
  return revision;
}

async function opened(run: ProposalRun) {
  const { owner, text } = await instructionsOf(
    run.job.process,
    run.instructions,
  );
  const set = await setOf(run, owner, text);
  return {
    owner: await ownerFor(owner, set),
    set,
    text,
    read: await readOf(run.job.process, run.readId),
    asking: { model: run.model, resolve: standInsFor(run.holder) },
  };
}

const context = (run: ProposalRun) => ({
  instructionsHash: run.instructions,
  readId: run.readId,
  fingerprint: run.fingerprint,
});

export function batches(run: ProposalRun): Promise<Outcome<string[][]>> {
  return inStep(run, context(run), STARTING, async () => {
    const { owner, set, read } = await opened(run);
    return proposalBatches(owner, set, read, run.readId);
  });
}

export function answer(
  run: ProposalRun,
  keys: string[],
  at: { index: number; of: number },
): Promise<Outcome<null>> {
  return inStep(run, context(run), STARTING, async (progress, note, record) => {
    const { owner, set, read, text, asking } = await opened(run);
    progress.step =
      at.of > 1
        ? `Proposing ${at.index + 1} of ${at.of} batches…`
        : 'Proposing…';
    void note();
    let noted = 0;
    const changed = () => {
      if (Date.now() - noted < NOTE_EVERY_MS) return;
      noted = Date.now();
      void note();
    };
    await answerBatch(owner, set, read, run.readId, text, keys, {
      ...asking,
      record,
      ...(progress.activity && {
        watch: { activity: progress.activity, changed },
      }),
    });
    return null;
  });
}

// The whole kept, proposed `at`; what it says of the records it answers.
export function finish(run: ProposalRun, at: string): Promise<Outcome<string>> {
  return inStep(run, context(run), STARTING, async () => {
    const { owner, set, read } = await opened(run);
    const done = await finishProposal(owner, set, read, run.readId, at);
    return `Proposed for ${Object.keys(done.records).length} ${owner.subject.record.plural}.`;
  });
}

export function end(
  run: ProposalRun,
  { step, error }: { step: string | null; error: string | null },
): Promise<void> {
  return settle(run, STARTING, (progress) => {
    if (step) progress.step = step;
    progress.error = error;
    if (progress.activity) {
      progress.activity.thought = null;
      progress.activity.writing = 0;
    }
  });
}
