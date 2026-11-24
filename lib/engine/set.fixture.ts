import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { database } from '@/server/db/client';
import { instructionVersions } from '@/server/db/schema';
import { ensureProcess } from '@/server/db/scope';
import { keptProcesses } from '@/server/operations/kept-processes';
import { ensureDeclared } from '@/server/storage/rules/instructions';
import { findDefinitions } from '@/server/operations/find';
import { saveSet } from '@/server/storage/rules/rulebooks';

import { hashOf } from './fingerprint';
import type { Definition, DefinitionSet, Example } from './types';

// Kept sets written straight to the store, for tests that start from one.

export const TEXT =
  'Start from the sales of the first two weekends. Order enough to cover them.';

export const example = (
  expect: number | boolean,
  agrees: boolean,
  more: Partial<Example> = {},
): Example => ({
  key: 'SD-01',
  inputs: {},
  expect,
  why: 'Worked out by hand.',
  actual: agrees ? expect : null,
  error: null,
  agrees,
  ...more,
});

export const definition = (
  id: string,
  more: Partial<Definition> = {},
): Definition => ({
  id,
  name: id.replace(/_/g, ' '),
  text: id,
  result: 'number',
  consequence: null,
  constants: [],
  groups: [],
  uses: [],
  formula: null,
  examples: [],
  problem: null,
  model: null,
  approvedAt: null,
  deniedAt: null,
  denial: null,
  ...more,
});

/*
  Keeps a test's instructions as a version of the process, as publishing
  would: a rulebook belongs to a kept version. Labelled by its hash, so it
  meets no declared label; a declared text keeps its own.
*/
export async function keepText(text: string = TEXT, process = owner.id) {
  const db = await database();
  await ensureProcess(db, process);
  const kept = keptProcesses().find((entry) => entry.summary.id === process);
  if (kept) await ensureDeclared(db, kept);
  await db
    .insert(instructionVersions)
    .values({
      process,
      hash: hashOf(text),
      version: `test-${hashOf(text)}`,
      text,
      origin: 'published',
      publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    })
    .onConflictDoNothing();
}

export const keep = async (
  definitions: Definition[],
  more: Partial<DefinitionSet> = {},
) => {
  await keepText();
  return saveSet(owner, {
    hash: hashOf(TEXT),
    version: 'v1',
    intent: 'Order enough.',
    intentConfirmedAt: null,
    readId: 'test',
    foundAt: '2026-10-08T00:00:00.000Z',
    model: 'test',
    definitions,
    ...more,
  });
};

// Finding, on instructions kept first, as a run's always are.
export const findKept: typeof findDefinitions = async (
  process,
  text,
  ...rest
) => {
  await keepText(typeof text === 'string' ? text : text.text, process.id);
  return findDefinitions(process, text, ...rest);
};
