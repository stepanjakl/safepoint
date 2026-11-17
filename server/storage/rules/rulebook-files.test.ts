import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { asc, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inScratchDatabase } from '@/lib/engine/scratch.fixture';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import {
  currentProfiles,
  currentRulebooks,
  dataProfiles,
  rulebookHeads,
  rulebookRevisions,
} from '@/server/db/schema';

import { exportRulebooks, seedRulebooks } from './rulebook-files';
import { headOf, loadSet, saveSet } from './rulebooks';

/*
  fixtures/ seeds a database that lacks it, and the export gives it back,
  byte for byte. Read-only on fixtures/: a test that changes a file works on
  a copy in a scratch directory, and every export goes to one.
*/

const db = inScratchDatabase();
const FIXTURES = 'fixtures';
const PROCESS = owner.id;

let scratch = '';
beforeEach(() => {
  scratch = mkdtempSync(path.join(tmpdir(), 'rulebook-files-'));
});
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

const filesUnder = (root: string): string[] =>
  readdirSync(root)
    .flatMap((name) => {
      const at = path.join(root, name);
      return statSync(at).isDirectory()
        ? filesUnder(at).map((file) => path.join(name, file))
        : [name];
    })
    .sort();

// The files the export owns: each process's rulebooks and profile.
const keptFiles = (root: string) =>
  filesUnder(root).filter((file) => /^[^/]+\/(rulebooks|profile)\//.test(file));

// Everything the tables hold, to tell whether a seed changed anything.
const snapshot = async () => ({
  current: await db().select().from(currentRulebooks),
  revisions: await db()
    .select()
    .from(rulebookRevisions)
    .orderBy(asc(rulebookRevisions.seq)),
  heads: await db().select().from(rulebookHeads),
  profiles: await db().select().from(currentProfiles),
  confirmed: await db().select().from(dataProfiles),
});

// A copy of fixtures/ to change, as a scratch fixtures/ folder.
const copyOfFixtures = () => {
  const root = path.join(scratch, 'copy');
  cpSync(FIXTURES, root, { recursive: true });
  return root;
};

describe('seeding from fixtures/', () => {
  it('inserts every rulebook, revision, head and profile, and a second seed changes nothing', async () => {
    const first = await seedRulebooks(db(), PROCESS, FIXTURES);
    // 2 current, 4 revisions, 2 heads, 1 current profile, 1 confirmed.
    expect(first).toEqual({ inserted: 10, present: 0 });
    const seeded = await snapshot();
    expect(await seedRulebooks(db(), PROCESS, FIXTURES)).toEqual({
      inserted: 0,
      present: 10,
    });
    expect(await snapshot()).toEqual(seeded);
  });

  it('two at once insert it once', async () => {
    const reports = await Promise.all([
      seedRulebooks(db(), PROCESS, FIXTURES),
      seedRulebooks(db(), PROCESS, FIXTURES),
    ]);
    expect(reports.map((r) => r.inserted).sort()).toEqual([0, 10]);
  });

  it('never overwrites what the database already holds', async () => {
    await seedRulebooks(db(), PROCESS, FIXTURES);
    const text = (await import('@/lib/processes/brunch-orders/process'))
      .brunchOrdersProcess.instructions;
    const current = (await loadSet(owner, text.text))!;
    await saveSet(owner, { ...current, intent: 'Changed here.' });
    const head = await headOf(owner, text.text);
    await seedRulebooks(db(), PROCESS, FIXTURES);
    expect((await loadSet(owner, text.text))?.intent).toBe('Changed here.');
    expect(await headOf(owner, text.text)).toBe(head);
  });

  it('is what the app reads on first need, from the working directory', async () => {
    const text = (await import('@/lib/processes/brunch-orders/process'))
      .brunchOrdersProcess.instructions.text;
    expect((await loadSet(owner, text))?.hash).toBe('86c4ba5959e9');
    expect(await headOf(owner, text)).toBe('b1888d2d07c2');
  });

  it.each([
    [
      'a revision whose body is not its id',
      'brunch-orders/rulebooks/v2-91823c6c8281/d23a4c56d75b.json',
      (body: string) => body.replace('"approvedAt": "2', '"approvedAt": "1'),
      /v2-91823c6c8281\/d23a4c56d75b\.json does not match its id/,
    ],
    [
      'a profile whose body is not its id',
      'brunch-orders/profile/481dc0e61bc1.json',
      (body: string) => body.replace('"label": "sku"', '"label": "SKU"'),
      /profile\/481dc0e61bc1\.json does not match its id/,
    ],
    [
      'a file not written as the export writes it',
      'brunch-orders/rulebooks/v3-86c4ba5959e9/current.json',
      (body: string) => JSON.stringify(JSON.parse(body)),
      /v3-86c4ba5959e9\/current\.json is not written as the export writes it/,
    ],
  ])('refuses %s, naming the file', async (_, file, tamper, said) => {
    const root = copyOfFixtures();
    const at = path.join(root, file);
    writeFileSync(at, tamper(readFileSync(at, 'utf8')));
    await expect(seedRulebooks(db(), PROCESS, root)).rejects.toThrow(said);
    // Nothing of it is inserted.
    expect(await db().select().from(rulebookRevisions)).toEqual([]);
  });

  it('refuses a folder that names instructions the database does not keep', async () => {
    const root = copyOfFixtures();
    const rulebooks = path.join(root, PROCESS, 'rulebooks');
    cpSync(
      path.join(rulebooks, 'v3-86c4ba5959e9'),
      path.join(rulebooks, 'v7-86c4ba5959e9'),
      { recursive: true },
    );
    rmSync(path.join(rulebooks, 'v3-86c4ba5959e9'), { recursive: true });
    await expect(seedRulebooks(db(), PROCESS, root)).rejects.toThrow(
      /v7-86c4ba5959e9 names instructions v7, kept here as v3/,
    );
    rmSync(path.join(rulebooks, 'v7-86c4ba5959e9'), { recursive: true });
    cpSync(
      path.join(FIXTURES, PROCESS, 'rulebooks', 'v3-86c4ba5959e9'),
      path.join(rulebooks, 'v3-0123456789ab'),
      { recursive: true },
    );
    await expect(seedRulebooks(db(), PROCESS, root)).rejects.toThrow(
      /\.json is for instructions 86c4ba5959e9, not 0123456789ab/,
    );
  });
});

describe('the export', () => {
  it('gives back every file of fixtures/ byte for byte', async () => {
    await seedRulebooks(db(), PROCESS, FIXTURES);
    const out = path.join(scratch, 'out');
    const written = await exportRulebooks(db(), out);
    const kept = keptFiles(FIXTURES);
    expect(kept.length).toBe(10);
    expect([...written].sort()).toEqual(kept);
    expect(keptFiles(out)).toEqual(kept);
    for (const file of kept)
      expect(readFileSync(path.join(out, file), 'utf8'), file).toBe(
        readFileSync(path.join(FIXTURES, file), 'utf8'),
      );
  });

  it('writes what the database moved on to, and seeds it back the same', async () => {
    await seedRulebooks(db(), PROCESS, FIXTURES);
    const { text } = (await import('@/lib/processes/brunch-orders/process'))
      .brunchOrdersProcess.instructions;
    const current = (await loadSet(owner, text))!;
    await saveSet(owner, { ...current, intent: 'Changed here.' });
    const out = path.join(scratch, 'out');
    await exportRulebooks(db(), out);
    const file = path.join(
      out,
      PROCESS,
      'rulebooks/v3-86c4ba5959e9/current.json',
    );
    expect(JSON.parse(readFileSync(file, 'utf8')).intent).toBe('Changed here.');
    // Read into an empty database and out again, it is the same.
    const before = await snapshot();
    await db().execute(
      sql`truncate table current_rulebooks, rulebook_heads, current_profiles, rule_decisions restart identity`,
    );
    for (const table of ['rulebook_revisions', 'data_profiles'])
      await db().execute(sql.raw(`alter table ${table} disable trigger user`));
    await db().execute(sql`delete from rulebook_revisions`);
    await db().execute(sql`delete from data_profiles`);
    for (const table of ['rulebook_revisions', 'data_profiles'])
      await db().execute(sql.raw(`alter table ${table} enable trigger user`));
    await seedRulebooks(db(), PROCESS, out);
    const again = path.join(scratch, 'again');
    await exportRulebooks(db(), again);
    for (const kept of keptFiles(out))
      expect(readFileSync(path.join(again, kept), 'utf8'), kept).toBe(
        readFileSync(path.join(out, kept), 'utf8'),
      );
    expect((await snapshot()).current.map((row) => row.body)).toEqual(
      before.current.map((row) => row.body),
    );
  });
});
