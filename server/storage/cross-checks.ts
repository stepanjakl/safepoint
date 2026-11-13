import { rm } from 'node:fs/promises';
import { z } from 'zod';

import {
  calculate,
  crossCheckBatch,
  type CrossCheck,
} from '@/lib/definitions/calculate';
import { DRAFT_MODELS, type Resolve } from '@/lib/definitions/calls';
import type { KeptRead } from '@/lib/definitions/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/definitions/types';
import { fallbackChain, type DraftingModel } from '@/lib/models';

import { readKept, writeKept } from './files';
import { runFile } from './run-key';

// Records a call works out: few enough that the model's answer fits.
const BATCH = 25;

/*
  A cross-check is kept in data/<process>/cross-checks/ by read and rulebook:
  it costs model calls, and the same read on the same rulebook would give the
  same answer to compare. One still being answered is kept beside it as a
  part. Each is written beside its file and renamed over it.
*/
const crossFile = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
  // A cross-check still being answered, batch by batch.
  part = false,
) =>
  runFile(
    'cross-checks',
    { process: owner.id, readId, fingerprint },
    part ? 'part' : 'whole',
  );

const cellsSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({ model: z.number(), working: z.string(), agrees: z.boolean() }),
  ),
);
export const crossCheckPartSchema = z.object({
  cells: cellsSchema,
  models: z.array(z.string()),
});
type Part = z.infer<typeof crossCheckPartSchema>;

const keepPart = (
  owner: DefinitionProcess,
  readId: string,
  fp: string,
  part: Part,
) => writeKept(crossFile(owner, readId, fp, true), part);

const keptPart = (owner: DefinitionProcess, readId: string, fp: string) =>
  readKept(crossFile(owner, readId, fp, true), crossCheckPartSchema, {
    unreadableIsMissing: true,
  });

const dropPart = (owner: DefinitionProcess, readId: string, fp: string) =>
  rm(crossFile(owner, readId, fp, true), { force: true });

export const crossCheckSchema = z.object({
  fingerprint: z.string(),
  readId: z.string(),
  model: z.string(),
  at: z.string(),
  cells: cellsSchema,
  agreed: z.number(),
  total: z.number(),
});

export async function keepCrossCheck(
  owner: DefinitionProcess,
  check: CrossCheck,
): Promise<void> {
  await writeKept(crossFile(owner, check.readId, check.fingerprint), check);
}

export async function keptCrossCheck(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): Promise<CrossCheck | null> {
  return readKept(crossFile(owner, readId, fingerprint), crossCheckSchema, {
    unreadableIsMissing: true,
  });
}

/*
  The model works every value out again, BATCH records to a call. Each
  batch's answer is kept as it arrives, so a cross-check that stops part way
  (quota, a refused answer) asks only for the rest when it is run again.
*/
export async function crossCheck(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  {
    model: chosen = null,
    resolve,
    batch = BATCH,
  }: { model?: DraftingModel | null; resolve?: Resolve; batch?: number } = {},
): Promise<CrossCheck> {
  const calculation = calculate(owner, set, read);
  const keys = calculation.rows.map((row) => row.key);
  if (!keys.length) throw new Error('The read has no records.');
  const { fingerprint } = calculation;
  const models = chosen ? fallbackChain(chosen) : DRAFT_MODELS;
  const sofar = await keptPart(owner, readId, fingerprint);
  const cells: CrossCheck['cells'] = { ...sofar?.cells };
  const answeredBy = new Set(sofar?.models ?? []);
  const left = keys.filter((key) => !cells[key]);
  for (let at = 0; at < left.length; at += batch) {
    const [first, ...rest] = left.slice(at, at + batch);
    const answer = await crossCheckBatch(
      owner,
      calculation,
      read,
      text,
      [first!, ...rest],
      models,
      resolve,
    );
    Object.assign(cells, answer.cells);
    answeredBy.add(answer.model);
    await keepPart(owner, readId, fingerprint, {
      cells,
      models: [...answeredBy],
    });
  }
  await dropPart(owner, readId, fingerprint);
  const all = keys.flatMap((key) => Object.values(cells[key] ?? {}));
  return {
    fingerprint,
    readId,
    model: [...answeredBy].join(', '),
    at: new Date().toISOString(),
    cells,
    agreed: all.filter((cell) => cell.agrees).length,
    total: all.length,
  };
}
