import { readFileSync } from 'node:fs';

import { TRPCError } from '@trpc/server';

import { hashOf } from '@/lib/definitions/fingerprint';
import { TEXT } from '@/lib/definitions/set.fixture';
import {
  definitionSetSchema,
  type DefinitionSet,
} from '@/lib/definitions/types';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { saveSet } from '@/server/storage/rulebooks';

import { appRouter } from './root';

// What the procedures about a run are tested on: the accepted rulebook the
// browser tests serve (held to the engine by e2e-fixtures.test.ts), kept as
// the rulebook for TEXT in the test's scratch directory.

export const caller = () =>
  appRouter.createCaller({
    request: new Request('http://localhost:3000/api/trpc'),
  });

export async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof TRPCError)) throw new Error('Expected a TRPCError.');
  return { code: error.code, message: error.message };
}

export const accepted: DefinitionSet = {
  ...definitionSetSchema.parse(
    JSON.parse(
      readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8'),
    ),
  ),
  hash: hashOf(TEXT),
};

// The same rulebook as it would have been accepted before the ripe column
// was read as a yes/no one: it no longer fits the captured read.
export const outdated: DefinitionSet = {
  ...accepted,
  definitions: accepted.definitions.map((d) =>
    d.formula?.includes('record.ripe')
      ? {
          ...d,
          formula: d.formula.replace('!record.ripe', '!(record.ripe == "yes")'),
        }
      : d,
  ),
};

export const keepAsCurrent = (set: DefinitionSet) => saveSet(owner, set);
