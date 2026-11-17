import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

import type { Database } from '@/server/db/client';

// Runs each test of the file in its own empty directory, so kept sets are
// written there and never to the repository's fixtures.
export function inScratchDirectory() {
  let scratch = '';
  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'definitions-'));
    vi.spyOn(process, 'cwd').mockReturnValue(scratch);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(scratch, { recursive: true, force: true });
  });
  return () => scratch;
}

// The committed migrations, wherever a test has moved the working directory.
const MIGRATIONS = path.join(import.meta.dirname, '..', '..', 'drizzle');

/*
  Gives each test of the file an empty database, migrated: a PGlite in memory
  that `database()` (server/db/client.ts) hands out for the test's duration.
  The file migrates one database once and each test begins by emptying every
  table and restarting its identities (about 10 ms), where creating and
  migrating one takes 600 ms and copying a migrated one (PGlite's clone)
  150 ms. Loaded only by the files that call this.
*/
export function inScratchDatabase() {
  let client: PGlite | null = null;
  let db: Database | null = null;
  let tables = '';
  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const schema = await import('@/server/db/schema');
    client = await PGlite.create();
    const migrated = drizzle({ client, schema });
    await migrate(migrated, { migrationsFolder: MIGRATIONS });
    db = migrated;
    const { rows } = await client.query<{ name: string }>(
      `select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
    );
    tables = rows.map((row) => `public.${row.name}`).join(', ');
  });
  beforeEach(async () => {
    const { useDatabaseInTests } = await import('@/server/db/client');
    await client!.exec(`truncate table ${tables} restart identity cascade`);
    useDatabaseInTests(db);
  });
  afterEach(async () => {
    const { useDatabaseInTests } = await import('@/server/db/client');
    useDatabaseInTests(null);
  });
  afterAll(async () => {
    await client?.close();
    client = db = null;
  });
  return () => {
    if (!db) throw new Error('The scratch database exists only in a test.');
    return db;
  };
}

/*
  Both of the above, for what keeps rows and still reads a file from the
  working directory: the captured copy in fixtures/ is found in no scratch
  directory, so a source with no kept read has nothing to fall back to.
*/
export function inScratchStorage() {
  return { directory: inScratchDirectory(), database: inScratchDatabase() };
}

// The rows of plain SQL. Its result's type depends on the driver, which
// `Database` leaves open; both drivers answer with `rows`.
export async function rowsOf<T>(db: Database, query: SQL): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}

// Waits for a check that work started in the background will come to pass.
// Longer than `vi.waitFor`'s second, which a job keeping its progress in the
// database can outlast while the whole suite runs; inside a test's own five.
export const eventually = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 4_000 });
