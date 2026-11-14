import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { capturedRead } from '@/lib/definitions/captured.fixture';
import { inScratchDatabase } from '@/lib/definitions/scratch.fixture';
import { modelLimits, reads, sourceReads } from '@/server/db/schema';
import { keptRead } from '@/server/storage/brunch-orders-reads';
import { loadKeptLimits } from '@/server/storage/model-limits';
import { sourceValues } from '@/server/storage/source-reads';

import { importKeptData, refusals, describe as say } from './report';

// The import on a made-up data folder and a scratch database: what it copies,
// that running it twice changes nothing, what it refuses, and that it leaves
// every file as it found it.

const write = (dir: string, name: string, value: unknown) => {
  mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  writeFileSync(
    path.join(dir, name),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
};

const sourceRead = (readId: string) => ({
  readId,
  readAt: '2026-11-13T09:00:00.000Z',
  origin: 'live',
  title: 'Kept',
  url: null,
  resources: [{ name: 'Stock', values: [['Item'], [readId, 1.5]] }],
});

// Every file under the folder, with its content and its time of change.
function snapshot(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory()
        ? snapshot(file)
        : [
            `${file} ${statSync(file).mtimeMs} ${createHash('sha256').update(readFileSync(file)).digest('hex')}`,
          ];
    })
    .sort();
}

describe('the import of what is kept on disk', () => {
  const db = inScratchDatabase();
  let folder = '';
  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'kept-data-'));
    write(folder, 'brunch-orders/reads/first.json', {
      ...capturedRead(),
      id: 'first',
    });
    write(folder, 'brunch-orders/reads/second.json', {
      ...capturedRead(),
      id: 'second',
    });
    write(folder, 'other-process/reads/third.json', {
      ...capturedRead(),
      id: 'third',
    });
    write(
      folder,
      'sources/brunch-store-sheet/reads/2026-11-13T09-00-00-000Z-aaaaaaaa.json',
      sourceRead('2026-11-13T09-00-00-000Z-aaaaaaaa'),
    );
    write(
      folder,
      'sources/brunch-store-sheet/reads/2026-11-14T09-00-00-000Z-bbbbbbbb.json',
      sourceRead('2026-11-14T09-00-00-000Z-bbbbbbbb'),
    );
    write(folder, 'model-limits.json', {
      shares: { 'model-a': 'model-b' },
      perMinute: { 'model-b': { limit: 15, at: 1_760_000_000_000 } },
      perDay: { 'model-b': { limit: 20, at: 1_760_000_000_001 } },
      used: { 'model-b': { day: '2026-11-13', count: 7 } },
    });
    // Not read as any of them: another kind's, and what is not a kept file.
    write(folder, 'brunch-orders/proposals/x.abc.json', {});
    write(folder, 'brunch-orders/reads/leftover.json.123.tmp', 'half a file');
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  const counts = (report: Awaited<ReturnType<typeof importKeptData>>) =>
    Object.fromEntries(
      report.map(({ kind, tally }) => [
        kind,
        [tally.files, tally.inserted, tally.present, tally.refused.length],
      ]),
    );

  it('copies each kind, and the rows read back as the files held them', async () => {
    const before = snapshot(folder);
    const report = await importKeptData(db(), folder);
    expect(counts(report)).toEqual({
      'run reads': [3, 3, 0, 0],
      'source reads': [2, 2, 0, 0],
      'model limits': [1, 2, 0, 0],
    });
    expect(refusals(report)).toBe(0);

    expect(await keptRead('first')).toEqual({ ...capturedRead(), id: 'first' });
    expect(
      (await db().select().from(reads))
        .map((r) => `${r.process}/${r.id}`)
        .sort(),
    ).toEqual([
      'brunch-orders/first',
      'brunch-orders/second',
      'other-process/third',
    ]);
    expect(
      await sourceValues(
        'brunch-store-sheet',
        '2026-11-13T09-00-00-000Z-aaaaaaaa',
      ),
    ).toEqual({
      readId: '2026-11-13T09-00-00-000Z-aaaaaaaa',
      resources: [
        {
          name: 'Stock',
          values: [['Item'], ['2026-11-13T09-00-00-000Z-aaaaaaaa', 1.5]],
        },
      ],
    });
    expect(await loadKeptLimits(db())).toEqual(
      JSON.parse(readFileSync(path.join(folder, 'model-limits.json'), 'utf8')),
    );
    // Every file as it was.
    expect(snapshot(folder)).toEqual(before);
  });

  it('is safe to run twice: everything is then present, and nothing changes', async () => {
    await importKeptData(db(), folder);
    const rows = async () => [
      await db().select().from(reads),
      await db().select().from(sourceReads),
      await db().select().from(modelLimits),
    ];
    const first = await rows();
    const report = await importKeptData(db(), folder);
    expect(counts(report)).toEqual({
      'run reads': [3, 0, 3, 0],
      'source reads': [2, 0, 2, 0],
      'model limits': [1, 0, 2, 0],
    });
    expect(await rows()).toEqual(first);
  });

  it('reports the same counts on a dry run, and writes nothing', async () => {
    const dry = await importKeptData(db(), folder, { dryRun: true });
    expect(counts(dry)).toEqual({
      'run reads': [3, 3, 0, 0],
      'source reads': [2, 2, 0, 0],
      'model limits': [1, 2, 0, 0],
    });
    expect(await db().select().from(reads)).toEqual([]);
    expect(await db().select().from(sourceReads)).toEqual([]);
    expect(await db().select().from(modelLimits)).toEqual([]);
    // As it would be after a real one: the same counts either way.
    expect(counts(await importKeptData(db(), folder))).toEqual(counts(dry));
    expect(
      counts(await importKeptData(db(), folder, { dryRun: true })),
    ).toEqual({
      'run reads': [3, 0, 3, 0],
      'source reads': [2, 0, 2, 0],
      'model limits': [1, 0, 2, 0],
    });
  });

  it('refuses what differs from the row it finds, and what does not fit, and overwrites nothing', async () => {
    await importKeptData(db(), folder);
    // The files change after they were imported, and four are not kept files.
    write(folder, 'brunch-orders/reads/first.json', {
      ...capturedRead(),
      id: 'first',
      source: 'Edited since',
    });
    write(folder, 'brunch-orders/reads/broken.json', '{');
    write(folder, 'brunch-orders/reads/misnamed.json', {
      ...capturedRead(),
      id: 'another',
    });
    write(
      folder,
      'sources/brunch-store-sheet/reads/captured.json',
      sourceRead('captured'),
    );
    write(folder, 'sources/brunch-store-sheet/reads/shapeless.json', {
      readId: 'shapeless',
    });
    write(folder, 'model-limits.json', {
      shares: { 'model-a': 'model-b' },
      perMinute: { 'model-b': { limit: 15.5, at: 1_760_000_000_000 } },
      perDay: { 'model-b': { limit: 25, at: 1_760_000_000_001 } },
      used: { 'model-b': { day: '2026-11-13', count: 7 } },
    });
    const before = snapshot(folder);
    const report = await importKeptData(db(), folder);
    expect(counts(report)).toEqual({
      'run reads': [5, 0, 2, 3],
      'source reads': [4, 0, 2, 2],
      'model limits': [1, 0, 1, 1],
    });
    expect(refusals(report)).toBe(6);
    const text = say(report, false);
    expect(text).toContain(
      'first.json: the database has a row of this key with other content',
    );
    expect(text).toContain('broken.json: is not valid JSON');
    expect(text).toContain(
      'misnamed.json: the file is named misnamed but the read says it is another',
    );
    expect(text).toContain(
      'captured.json: the read id is not one the table takes',
    );
    expect(text).toContain('shapeless.json: does not fit the stored shape');
    expect(text).toContain('model-b: a value of it does not fit the table');
    // The row that was kept is the one that was kept.
    expect((await keptRead('first'))!.source).toBe('captured');
    expect(
      (await db().select().from(modelLimits)).find((r) => r.model === 'model-b')
        ?.perDay,
    ).toBe(20);
    expect(snapshot(folder)).toEqual(before);
  });

  it('has nothing to say of a folder with none of it', async () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'kept-data-empty-'));
    try {
      expect(counts(await importKeptData(db(), empty))).toEqual({
        'run reads': [0, 0, 0, 0],
        'source reads': [0, 0, 0, 0],
        'model limits': [0, 0, 0, 0],
      });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
