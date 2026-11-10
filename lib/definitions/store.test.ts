import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { confirmProfile, profileOf, setColumnBlank } from './profile';
import { inScratchDirectory } from './scratch.fixture';
import { definition, keep, TEXT } from './set.fixture';
import {
  fingerprintOf,
  hashOf,
  headOf,
  listRevisions,
  loadConfirmedProfile,
  loadProfile,
  loadRevision,
  loadSet,
  putProfile,
  putRevision,
  saveProfile,
  saveSet,
  StoredSetError,
} from './store';
import { definitionSetSchema } from './types';

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

describe('a rulebook accepted before keys were kept', () => {
  const kept = JSON.parse(
    readFileSync(
      'fixtures/brunch-orders/rulebooks/v2-91823c6c8281/5b895575e4e7.json',
      'utf8',
    ),
  );

  it('still fits the stored shape, with the id it was kept under', () => {
    const set = definitionSetSchema.parse(kept);
    expect(set.acceptedKeys).toBeUndefined();
    expect(fingerprintOf(set)).toBe('5b895575e4e7');
  });

  it('is another rulebook once it names the records it was accepted on', () => {
    const set = definitionSetSchema.parse(kept);
    const keyed = { ...set, acceptedKeys: ['SD-01'] };
    expect(fingerprintOf(keyed)).not.toBe(fingerprintOf(set));
    expect(fingerprintOf({ ...keyed, acceptedKeys: ['SD-01'] })).toBe(
      fingerprintOf(keyed),
    );
  });
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

describe('the data profile in the store', () => {
  const profileFolder = () =>
    path.join(scratch(), 'fixtures', owner.id, 'profile');
  const proposed = profileOf(capturedRead(), owner.subject.data);
  const confirmed = confirmProfile(proposed, '2026-11-10T00:00:00.000Z');

  it('has nothing for a process never profiled', async () => {
    expect(await loadProfile(owner)).toBeNull();
    expect(await loadConfirmedProfile(owner, confirmed.id)).toBeNull();
  });

  it('keeps one under review as current, and nothing as confirmed', async () => {
    await saveProfile(owner, proposed);
    expect(await loadProfile(owner)).toEqual(proposed);
    expect(readdirSync(profileFolder())).toEqual(['current.json']);
    expect(await loadConfirmedProfile(owner, proposed.id)).toBeNull();
    await expect(putProfile(owner, proposed)).rejects.toThrow(
      /Only a confirmed/,
    );
  });

  it('keeps a confirmed one by its id, whatever the current one becomes', async () => {
    await saveProfile(owner, confirmed);
    expect(readdirSync(profileFolder()).sort()).toEqual(
      [`${confirmed.id}.json`, 'current.json'].sort(),
    );
    const edited = setColumnBlank(confirmed, 'max_order_units', 'skip');
    await saveProfile(owner, edited);
    expect((await loadProfile(owner))?.confirmedAt).toBeNull();
    expect(await loadConfirmedProfile(owner, confirmed.id)).toEqual(confirmed);
    expect(await loadConfirmedProfile(owner, '../current')).toBeNull();
  });

  it('never writes a confirmed one again', async () => {
    const id = await putProfile(owner, confirmed);
    const file = path.join(profileFolder(), `${id}.json`);
    // The same content, written differently: a second put leaves it be.
    writeFileSync(file, JSON.stringify(confirmed));
    expect(await putProfile(owner, confirmed)).toBe(id);
    await saveProfile(owner, confirmed);
    expect(readFileSync(file, 'utf8')).toBe(JSON.stringify(confirmed));
  });

  it('refuses a profile changed after it was made', async () => {
    await putProfile(owner, confirmed);
    const file = path.join(profileFolder(), `${confirmed.id}.json`);
    writeFileSync(
      file,
      JSON.stringify({ ...confirmed, columns: confirmed.columns.slice(1) }),
    );
    await expect(loadConfirmedProfile(owner, confirmed.id)).rejects.toThrow(
      /does not match its id/,
    );
    await expect(
      saveProfile(owner, { ...confirmed, confirmedAt: null }),
    ).rejects.toThrow(StoredSetError);
  });

  it('keeps a set with the profile it was drafted on, and one without', async () => {
    const set = await keep([accepted], { profileId: confirmed.id });
    expect((await loadSet(owner, TEXT))?.profileId).toBe(confirmed.id);
    await saveSet(owner, { ...set, profileId: undefined });
    expect((await loadSet(owner, TEXT))?.profileId).toBeUndefined();
    // An accepted rulebook from before profiles parses as it is.
    expect(
      definitionSetSchema.parse(
        JSON.parse(
          // Relative to the repository: only process.cwd() is moved.
          readFileSync(
            'fixtures/brunch-orders/rulebooks/v2-91823c6c8281/5b895575e4e7.json',
            'utf8',
          ),
        ),
      ).profileId,
    ).toBeUndefined();
  });
});
