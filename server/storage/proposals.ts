import 'server-only';

import { rm } from 'node:fs/promises';

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

import { readKept, writeKept } from './files';
import { runFile } from './run-key';

/*
  Kept in data/<process>/proposals/ by read and rulebook, written whole; one
  still being answered is kept beside it as a part, batch by batch, so a
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

// A proposal that cannot be read is reported, never taken for none kept.
export const keptProposal = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) =>
  readKept(
    runFile('proposals', runKeyOf(owner, readId, fingerprint)),
    proposalSchema,
  );

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
  const partFile = runFile(
    'proposals',
    runKeyOf(owner, readId, fingerprint),
    'part',
  );
  // Only a head start: a part that cannot be read is asked for again.
  const sofar = await readKept(partFile, proposalPartSchema, {
    unreadableIsMissing: true,
  });
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
    await writeKept(partFile, { records, models: [...answeredBy] });
  }
  const proposal: Proposal = {
    fingerprint,
    readId,
    model: [...answeredBy].join(', '),
    at: new Date().toISOString(),
    // In the records' own order, however the batches came back.
    records: Object.fromEntries(keys.map((key) => [key, records[key]!])),
  };
  await writeKept(
    runFile('proposals', runKeyOf(owner, readId, fingerprint)),
    proposal,
  );
  await rm(partFile, { force: true });
  return proposal;
}
