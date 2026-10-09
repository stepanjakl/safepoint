import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { inScratchDirectory } from './scratch.fixture';
import { definition, keep, TEXT } from './set.fixture';
import { hashOf, loadSet, StoredSetError } from './store';

// A kept set is read through its schema and written whole, so a broken file
// is reported rather than taken for "nothing kept" and overwritten.

const scratch = inScratchDirectory();
const fileOf = () =>
  path.join(scratch(), 'fixtures', owner.id, 'rules', `${hashOf(TEXT)}.json`);

describe('the store', () => {
  it('has nothing for instructions never drafted', async () => {
    expect(await loadSet(owner, TEXT)).toBeNull();
  });

  it('keeps a set whole, with nothing left beside it', async () => {
    await keep([definition('two_weekends')]);
    expect((await loadSet(owner, TEXT))?.definitions[0]?.id).toBe(
      'two_weekends',
    );
    expect(readdirSync(path.dirname(fileOf()))).toEqual([
      `${hashOf(TEXT)}.json`,
    ]);
  });

  it('reports a file that is not JSON, rather than nothing kept', async () => {
    await keep([]);
    writeFileSync(fileOf(), '{ "hash": ');
    await expect(loadSet(owner, TEXT)).rejects.toThrow(StoredSetError);
    await expect(loadSet(owner, TEXT)).rejects.toThrow(/is not valid JSON/);
  });

  it('reports a file of another shape, naming what does not fit', async () => {
    await keep([]);
    const old = JSON.parse(readFileSync(fileOf(), 'utf8'));
    old.items = old.definitions;
    delete old.definitions;
    writeFileSync(fileOf(), JSON.stringify(old));
    await expect(loadSet(owner, TEXT)).rejects.toThrow(
      /does not fit the stored shape: definitions/,
    );
  });
});
