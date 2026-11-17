import 'server-only';

import type { RecordAttempt } from '@/lib/engine/attempts';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  calculate,
  crossCheckBatch,
  type CrossCheck,
} from '@/lib/engine/calculate';
import { DRAFT_MODELS, type Resolve } from '@/lib/engine/calls';
import type { KeptRead } from '@/lib/engine/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/engine/types';
import { fallbackChain, type DraftingModel } from '@/lib/models';

import { database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { crossChecks } from '@/server/db/schema';

import { readProcessOf } from './run-reads';
import { dropPart, keepPart, keptPart } from './answer-parts';

// Records a call works out: few enough that the model's answer fits.
const BATCH = 25;

/*
  A cross-check is kept in the `cross_checks` table by read and rulebook: it
  costs model calls, and the same read on the same rulebook would give the
  same answer to compare. A new one replaces it. One still being answered is
  kept as a part. A cross-check or part that no longer fits its schema reads
  as none kept, since it is recomputed on demand; a database that cannot be
  read is reported.
*/
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

const runKey = (owner: DefinitionProcess, readId: string, fp: string) => ({
  process: owner.id,
  readId,
  fingerprint: fp,
});

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
  const body = crossCheckSchema.parse(check);
  const db = await database();
  await ensureProcess(db, owner.id);
  const row = {
    checkedAt: new Date(body.at),
    model: body.model,
    agreed: body.agreed,
    total: body.total,
    body,
  };
  await db
    .insert(crossChecks)
    .values({
      process: owner.id,
      readProcess: readProcessOf(owner),
      readId: body.readId,
      fingerprint: body.fingerprint,
      ...row,
    })
    .onConflictDoUpdate({
      target: [
        crossChecks.process,
        crossChecks.readId,
        crossChecks.fingerprint,
      ],
      set: row,
    });
}

export async function keptCrossCheck(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): Promise<CrossCheck | null> {
  const [row] = await (
    await database()
  )
    .select({ body: crossChecks.body })
    .from(crossChecks)
    .where(
      and(
        eq(crossChecks.process, owner.id),
        eq(crossChecks.readId, readId),
        eq(crossChecks.fingerprint, fingerprint),
      ),
    );
  const parsed = row && crossCheckSchema.safeParse(row.body);
  return parsed?.success ? parsed.data : null;
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
    record,
  }: {
    model?: DraftingModel | null;
    resolve?: Resolve;
    batch?: number;
    record?: RecordAttempt;
  } = {},
): Promise<CrossCheck> {
  const calculation = calculate(owner, set, read);
  const keys = calculation.rows.map((row) => row.key);
  if (!keys.length) throw new Error('The read has no records.');
  const { fingerprint } = calculation;
  const models = chosen ? fallbackChain(chosen) : DRAFT_MODELS;
  const key = runKey(owner, readId, fingerprint);
  const sofar = await keptPart('cross-check', key, crossCheckPartSchema);
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
      record,
    );
    Object.assign(cells, answer.cells);
    answeredBy.add(answer.model);
    await keepPart('cross-check', key, crossCheckPartSchema, {
      cells,
      models: [...answeredBy],
    });
  }
  await dropPart(await database(), 'cross-check', key);
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
