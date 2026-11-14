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
  Gives each test of the file its own empty database, migrated: a PGlite in
  memory that `database()` (server/db/client.ts) hands out for the test's
  duration. The file migrates one database once and each test gets a copy of
  it (PGlite's clone), which is several times faster than migrating per test
  and as fresh. Loaded only by the files that call this.
*/
export function inScratchDatabase() {
  let template: PGlite | null = null;
  let client: PGlite | null = null;
  let db: Database | null = null;
  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    template = await PGlite.create();
    await migrate(drizzle({ client: template }), {
      migrationsFolder: MIGRATIONS,
    });
  });
  beforeEach(async () => {
    const { drizzle } = await import('drizzle-orm/pglite');
    const schema = await import('@/server/db/schema');
    const { useDatabaseInTests } = await import('@/server/db/client');
    client = (await template!.clone()) as PGlite;
    db = drizzle({ client, schema });
    useDatabaseInTests(db);
  });
  afterEach(async () => {
    const { useDatabaseInTests } = await import('@/server/db/client');
    useDatabaseInTests(null);
    await client?.close();
    client = db = null;
  });
  afterAll(async () => {
    await template?.close();
  });
  return () => {
    if (!db) throw new Error('The scratch database exists only in a test.');
    return db;
  };
}

// The rows of plain SQL. Its result's type depends on the driver, which
// `Database` leaves open; both drivers answer with `rows`.
export async function rowsOf<T>(db: Database, query: SQL): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}
