import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import type { RecordAttempt } from '@/lib/engine/attempts';
import { calculate } from '@/lib/engine/calculate';
import { DRAFT_MODELS, type Resolve } from '@/lib/engine/calls';
import { fingerprintOf } from '@/lib/engine/fingerprint';
import { profiledFor } from '@/lib/engine/profile';
import { proposeBatch, type Watch } from '@/lib/engine/propose';
import { fitting, type KeptRead } from '@/lib/engine/records';
import {
  proposalPartSchema,
  proposalSchema,
  type DefinitionProcess,
  type DefinitionSet,
  type Proposal,
} from '@/lib/engine/types';
import { fallbackChain, type DraftingModel } from '@/lib/models';

import { database, type Database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { proposals } from '@/server/db/schema';

import { readProcessOf } from './run-reads';
import { dropPart, keepPart, keptPart } from './answer-parts';
import type { RunKey } from './run-key';
import { parseStored } from './stored';

/*
  Kept in the `proposals` table by read and rulebook, each written whole and
  never changed: a proposal made again is a new row and the latest is the one
  kept. One still being answered is kept as a part, batch by batch, so a
  proposal that stops part way asks only for the rest.
*/
export const runKeyOf = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) => ({
  process: owner.id,
  readId,
  fingerprint,
});

/*
  The proposal in use for a run key, with the row it is: the latest by when
  it was proposed, which `proposals_by_run_key` serves. One that cannot be
  read is reported, never taken for none kept. A decision points at the row.
*/
export async function currentProposalOf(
  key: RunKey,
  db?: Database,
): Promise<{ id: number; proposal: Proposal } | null> {
  db ??= await database();
  const [row] = await db
    .select({ id: proposals.id, body: proposals.body })
    .from(proposals)
    .where(
      and(
        eq(proposals.process, key.process),
        eq(proposals.readId, key.readId),
        eq(proposals.fingerprint, key.fingerprint),
      ),
    )
    .orderBy(desc(proposals.proposedAt))
    .limit(1);
  return row
    ? {
        id: row.id,
        proposal: parseStored(
          row.body,
          proposalSchema,
          `The kept proposal ${key.process}/${key.readId}.${key.fingerprint}`,
        ),
      }
    : null;
}

// The latest proposal for the run key, as above, without its row.
export async function keptProposal(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): Promise<Proposal | null> {
  return (
    (await currentProposalOf(runKeyOf(owner, readId, fingerprint)))?.proposal ??
    null
  );
}

// Keeps a whole proposal and removes the part that led to it in one
// transaction, so a crash leaves both or neither. Written once: the same
// proposal again (same instant) leaves the first as it was.
export async function keepProposal(
  owner: DefinitionProcess,
  proposal: Proposal,
): Promise<Proposal> {
  const body = proposalSchema.parse(proposal);
  const key = runKeyOf(owner, body.readId, body.fingerprint);
  const db = await database();
  await ensureProcess(db, owner.id);
  await db.transaction(async (tx) => {
    await tx
      .insert(proposals)
      .values({
        process: owner.id,
        readProcess: readProcessOf(owner),
        readId: body.readId,
        fingerprint: body.fingerprint,
        proposedAt: new Date(body.at),
        model: body.model,
        body,
      })
      .onConflictDoNothing();
    await dropPart(tx, 'proposal', key);
  });
  return body;
}

// Records a call proposes for: few enough that its answer fits.
const BATCH = 25;

// How the model is asked, and who watches and records it as it answers.
type Asking = {
  model?: DraftingModel | null;
  resolve?: Resolve;
  watch?: Watch;
  record?: RecordAttempt;
};

// What a proposal is made on: the process its rules were drafted on, every
// rule accepted, and a read that fits.
function opening(owner: DefinitionProcess, set: DefinitionSet, read: KeptRead) {
  owner = profiledFor(owner, set);
  fitting(read, owner.subject.data);
  const open = set.definitions.filter((d) => !d.approvedAt);
  if (open.length)
    throw new Error(
      `Not every rule is accepted: ${open.map((d) => d.name).join(', ')}.`,
    );
  const calculation = calculate(owner, set, read);
  const keys = calculation.rows.map((row) => row.key);
  if (!keys.length) throw new Error('The read has no records.');
  return { owner, calculation, keys };
}

/*
  A proposal in three parts, each of which may be done again (a job's step
  run twice, server/workflows/proposal-steps.ts): the records still to
  answer, in batches; one batch answered and kept in the part; the whole kept
  from the part. `propose` below is the three in turn.
*/

// The records the part does not answer yet, in batches of `batch`.
export async function proposalBatches(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  batch = BATCH,
): Promise<string[][]> {
  const { keys } = opening(owner, set, read);
  const key = runKeyOf(owner, readId, fingerprintOf(set));
  // Only a head start: a part that cannot be read is asked for again.
  const sofar = await keptPart('proposal', key, proposalPartSchema);
  const left = keys.filter((key) => !sofar?.records[key]);
  const batches: string[][] = [];
  for (let at = 0; at < left.length; at += batch)
    batches.push(left.slice(at, at + batch));
  return batches;
}

// Answers the records of a batch the part does not answer yet, and keeps
// them in it: a record it already answers is not asked for again.
export async function answerBatch(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  batch: string[],
  { model: chosen = null, resolve, watch, record }: Asking = {},
): Promise<void> {
  const opened = opening(owner, set, read);
  const key = runKeyOf(owner, readId, fingerprintOf(set));
  const sofar = await keptPart('proposal', key, proposalPartSchema);
  const [first, ...rest] = batch.filter((key) => !sofar?.records[key]);
  if (!first) return;
  const answer = await proposeBatch(
    opened.owner,
    set,
    read,
    text,
    opened.calculation,
    [first, ...rest],
    chosen ? fallbackChain(chosen) : DRAFT_MODELS,
    resolve,
    watch,
    record,
  );
  await keepPart('proposal', key, proposalPartSchema, {
    records: { ...sofar?.records, ...answer.records },
    models: [...new Set([...(sofar?.models ?? []), answer.model])],
  });
}

/*
  Keeps the whole proposal the part makes, proposed `at`, in the records'
  own order however the batches came back. Done again for the same `at`, it
  finds the one it kept (whose part is gone) and keeps nothing more.
*/
export async function finishProposal(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  at: string,
): Promise<Proposal> {
  const { keys } = opening(owner, set, read);
  const fingerprint = fingerprintOf(set);
  const key = runKeyOf(owner, readId, fingerprint);
  const kept = await currentProposalOf(key);
  if (kept?.proposal.at === at) return kept.proposal;
  const sofar = await keptPart('proposal', key, proposalPartSchema);
  const missing = keys.filter((key) => !sofar?.records[key]);
  if (!sofar || missing.length)
    throw new Error(
      `Not every record was answered: ${missing.slice(0, 5).join(', ')}.`,
    );
  return keepProposal(owner, {
    fingerprint,
    readId,
    model: sofar.models.join(', '),
    at,
    records: Object.fromEntries(keys.map((key) => [key, sofar.records[key]!])),
  });
}

export async function propose(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  {
    batch = BATCH,
    onBatch,
    ...asking
  }: Asking & {
    batch?: number;
    // Told as each batch starts: which, of how many.
    onBatch?: (at: number, of: number) => void;
  } = {},
): Promise<Proposal> {
  const batches = await proposalBatches(owner, set, read, readId, batch);
  for (const [at, keys] of batches.entries()) {
    onBatch?.(at + 1, batches.length);
    await answerBatch(owner, set, read, readId, text, keys, asking);
  }
  return finishProposal(owner, set, read, readId, new Date().toISOString());
}
