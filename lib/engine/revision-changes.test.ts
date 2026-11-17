import { describe, expect, it } from 'vitest';

import { revisionChanges } from './revision-changes';
import { definition } from './set.fixture';
import type { Definition, DefinitionSet } from './types';

const at = '2026-10-12T00:00:00.000Z';
const accepted = (id: string, more: Partial<Definition> = {}) =>
  definition(id, { approvedAt: at, formula: `values.${id}`, ...more });
const set = (definitions: Definition[]): DefinitionSet => ({
  hash: 'h',
  version: 'v1',
  intent: '',
  intentConfirmedAt: null,
  readId: null,
  foundAt: at,
  model: 'test',
  definitions,
});

describe('revisionChanges', () => {
  it('counts everything as added when there is no parent', () => {
    expect(revisionChanges(null, set([accepted('a'), accepted('b')]))).toEqual({
      added: ['a', 'b'],
      removed: [],
      changed: [],
    });
  });

  it('names what was added, removed and changed, by id', () => {
    const parent = set([accepted('a'), accepted('b'), accepted('c')]);
    const revision = set([
      accepted('a'),
      accepted('b', { formula: 'values.b + 1' }),
      accepted('d'),
    ]);
    expect(revisionChanges(parent, revision)).toEqual({
      added: ['d'],
      removed: ['c'],
      changed: ['b'],
    });
  });

  it('ignores when a rule was settled and what the model was', () => {
    const parent = set([accepted('a')]);
    const revision = set([
      accepted('a', { approvedAt: '2026-10-13T00:00:00.000Z', model: 'm' }),
    ]);
    expect(revisionChanges(parent, revision).changed).toEqual([]);
  });

  it('reads only accepted definitions', () => {
    const revision = set([accepted('a'), definition('draft')]);
    expect(revisionChanges(null, revision).added).toEqual(['a']);
  });
});
