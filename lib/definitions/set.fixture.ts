import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { hashOf, saveSet } from './store';
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

export const keep = (
  definitions: Definition[],
  more: Partial<DefinitionSet> = {},
) =>
  saveSet(owner, {
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
