import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { inScratchDirectory } from './scratch.fixture';
import { definition, keep, TEXT } from './set.fixture';
import {
  fingerprintOf,
  hashOf,
  headOf,
  listRevisions,
  loadRevision,
  loadSet,
  putRevision,
  saveSet,
  StoredSetError,
} from './store';

// A kept set is read through its schema and written whole, so a broken file
// is reported rather than taken for "nothing kept" and overwritten. Each
// version of the instructions has a folder; an accepted rulebook a run used
// is kept beside the current one, never written again.

const scratch = inScratchDirectory();
const folder = () =>
  path.join(scratch(), 'fixtures', owner.id, 'rulebooks', `v1-${hashOf(TEXT)}`);
const current = () => path.join(folder(), 'current.json');
const accepted = definition('two_weekends', {
  formula: 'record.weekend_1 + record.weekend_2',
  approvedAt: '2026-10-09T12:00:00.000Z',
});

describe('the store', () => {
  it('has nothing for instructions never drafted', async () => {
    expect(await loadSet(owner, TEXT)).toBeNull();
  });

  it('keeps a set whole in its version’s folder, with nothing beside it', async () => {
    await keep([definition('two_weekends')]);
    expect((await loadSet(owner, TEXT))?.definitions[0]?.id).toBe(
      'two_weekends',
    );
    expect(readdirSync(folder())).toEqual(['current.json']);
  });

  it('finds the folder by the instructions, whatever the version is called', async () => {
    const set = await keep([definition('two_weekends')]);
    await saveSet(owner, { ...set, version: 'v9' });
    expect(readdirSync(path.dirname(folder()))).toEqual([`v1-${hashOf(TEXT)}`]);
    expect((await loadSet(owner, TEXT))?.version).toBe('v9');
  });

  it('keeps an accepted rulebook as it was, whatever the current one becomes', async () => {
    const set = await keep([accepted]);
    const id = await putRevision(owner, set, { reason: 'accepted' });
    expect(id).toBe(fingerprintOf(set));
    await saveSet(owner, { ...set, definitions: [] });
    await putRevision(
      owner,
      { ...set, intent: 'Changed.' },
      { reason: 'used' },
    );
    const pinned = await loadRevision(owner, TEXT, id);
    expect(pinned?.definitions.map((d) => d.id)).toEqual(['two_weekends']);
    expect(pinned?.intent).toBe(set.intent);
    expect((await loadSet(owner, TEXT))?.definitions).toEqual([]);
    expect(await loadRevision(owner, TEXT, '000000000000')).toBeNull();
    expect(await loadRevision(owner, TEXT, '../current')).toBeNull();
  });

  it('records each revision once, with the one it came from and why', async () => {
    const set = await keep([accepted]);
    const first = await putRevision(owner, set, { reason: 'accepted' });
    const migrated = {
      ...set,
      definitions: [
        { ...accepted, formula: 'record.weekend_2 + record.weekend_1' },
      ],
    };
    const second = await putRevision(owner, migrated, {
      reason: 'migrated',
      note: 'Read the other way round.',
    });
    expect(await putRevision(owner, migrated, { reason: 'used' })).toBe(second);
    const { head, revisions } = await listRevisions(owner, TEXT);
    expect(head).toBe(second);
    expect(
      revisions.map(({ id, parent, reason, note }) => ({
        id,
        parent,
        reason,
        note,
      })),
    ).toEqual([
      {
        id: second,
        parent: first,
        reason: 'migrated',
        note: 'Read the other way round.',
      },
      { id: first, parent: null, reason: 'accepted', note: null },
    ]);
    // A run going back to the revision it pinned changes nothing.
    await putRevision(owner, set, { reason: 'used' });
    expect(await headOf(owner, TEXT)).toBe(second);
    expect((await listRevisions(owner, TEXT)).revisions).toHaveLength(2);
  });

  it('reports a file that is not JSON, rather than nothing kept', async () => {
    await keep([]);
    writeFileSync(current(), '{ "hash": ');
    await expect(loadSet(owner, TEXT)).rejects.toThrow(StoredSetError);
    await expect(loadSet(owner, TEXT)).rejects.toThrow(/is not valid JSON/);
  });

  it('reports a file of another shape, naming what does not fit', async () => {
    await keep([]);
    const old = JSON.parse(readFileSync(current(), 'utf8'));
    old.items = old.definitions;
    delete old.definitions;
    writeFileSync(current(), JSON.stringify(old));
    await expect(loadSet(owner, TEXT)).rejects.toThrow(
      /does not fit the stored shape: definitions/,
    );
  });
});
