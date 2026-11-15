import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { calculate } from '@/lib/definitions/calculate';
import { DRAFT_MODELS, type Resolve } from '@/lib/definitions/calls';
import { fingerprintOf } from '@/lib/definitions/fingerprint';
import { profiledFor } from '@/lib/definitions/profile';
import { proposeBatch, type Watch } from '@/lib/definitions/propose';
import { fitting, type KeptRead } from '@/lib/definitions/records';
import {
  proposalPartSchema,
  proposalSchema,
  type DefinitionProcess,
  type DefinitionSet,
  type Proposal,
} from '@/lib/definitions/types';
import { fallbackChain, type DraftingModel } from '@/lib/models';

import { database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { proposals } from '@/server/db/schema';

import { readProcessOf } from './brunch-orders-reads';
import { dropPart, keepPart, keptPart } from './answer-parts';
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

// The latest proposal for the run key, by when it was proposed, which
// `proposals_by_run_key` serves. One that cannot be read is reported, never
// taken for none kept.
export async function keptProposal(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): Promise<Proposal | null> {
  const [row] = await (
    await database()
  )
    .select({ body: proposals.body })
    .from(proposals)
    .where(
      and(
        eq(proposals.process, owner.id),
        eq(proposals.readId, readId),
        eq(proposals.fingerprint, fingerprint),
      ),
    )
    .orderBy(desc(proposals.proposedAt))
    .limit(1);
  return row
    ? parseStored(
        row.body,
        proposalSchema,
        `The kept proposal ${owner.id}/${readId}.${fingerprint}`,
      )
    : null;
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

export async function propose(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  {
    model: chosen = null,
    resolve,
    batch = BATCH,
    onBatch,
    watch,
  }: {
    model?: DraftingModel | null;
    resolve?: Resolve;
    batch?: number;
    // Told as each batch starts: which, of how many.
    onBatch?: (at: number, of: number) => void;
    watch?: Watch;
  } = {},
): Promise<Proposal> {
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
  const fingerprint = fingerprintOf(set);
  const models = chosen ? fallbackChain(chosen) : DRAFT_MODELS;
  const key = runKeyOf(owner, readId, fingerprint);
  // Only a head start: a part that cannot be read is asked for again.
  const sofar = await keptPart('proposal', key, proposalPartSchema);
  const records: Proposal['records'] = { ...sofar?.records };
  const answeredBy = new Set(sofar?.models ?? []);
  const left = keys.filter((key) => !records[key]);
  const batches = Math.ceil(left.length / batch);
  for (let at = 0; at < left.length; at += batch) {
    onBatch?.(at / batch + 1, batches);
    const [first, ...rest] = left.slice(at, at + batch);
    const answer = await proposeBatch(
      owner,
      set,
      read,
      text,
      calculation,
      [first!, ...rest],
      models,
      resolve,
      watch,
    );
    Object.assign(records, answer.records);
    answeredBy.add(answer.model);
    await keepPart('proposal', key, proposalPartSchema, {
      records,
      models: [...answeredBy],
    });
  }
  const proposal: Proposal = {
    fingerprint,
    readId,
    model: [...answeredBy].join(', '),
    at: new Date().toISOString(),
    // In the records' own order, however the batches came back.
    records: Object.fromEntries(keys.map((key) => [key, records[key]!])),
  };
  return keepProposal(owner, proposal);
}
