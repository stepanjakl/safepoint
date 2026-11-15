import { existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  inScratchDatabase,
  inScratchDirectory,
  rowsOf,
} from '@/lib/definitions/scratch.fixture';

import {
  closeDatabase,
  database,
  driverFor,
  open,
  poolFor,
  type Database,
  type Environment,
} from './client';
import { dropEverything, RESETTABLE, resetRefusal } from './reset';
import { processes } from './schema';

/*
  Which driver the app opens, without reaching any server: a URL that
  answers nothing is enough to show the node-postgres path is built, since
  nothing connects until a query is made.
*/

const MIGRATIONS = path.join(process.cwd(), 'drizzle');
// Syntactically a database URL; nothing listens on port 1.
const UNREACHABLE = 'postgres://someone:secret@127.0.0.1:1/nothing';

const tables = async (db: Database) =>
  (
    await rowsOf<{ name: string }>(
      db,
      sql`select table_name as name from information_schema.tables where table_schema = 'public' order by 1`,
    )
  ).map((row) => row.name);

describe('the driver', () => {
  const scratch = inScratchDirectory();
  afterEach(async () => {
    vi.unstubAllEnvs();
    await closeDatabase();
  });

  it('is node-postgres with DATABASE_URL set, and PGlite without', () => {
    expect(driverFor({ DATABASE_URL: UNREACHABLE })).toEqual({
      kind: 'node-postgres',
      url: UNREACHABLE,
    });
    expect(driverFor({})).toEqual({
      kind: 'pglite',
      dataDir: path.join(scratch(), 'data', 'pglite'),
    });
  });

  it('takes an empty URL for none, and keeps PGlite in a folder of its own when asked', () => {
    // The browser tests' server is given both empty so a developer's
    // .env.local cannot send it to a real database.
    expect(
      driverFor({
        DATABASE_URL: '',
        DATABASE_URL_UNPOOLED: '',
        SAFEPOINT_PGLITE_DIR: 'data/pglite-e2e',
      }),
    ).toEqual({
      kind: 'pglite',
      dataDir: path.join(scratch(), 'data', 'pglite-e2e'),
    });
    expect(
      driverFor(
        { DATABASE_URL: '', DATABASE_URL_UNPOOLED: '' },
        { migrating: true },
      ),
    ).toMatchObject({ kind: 'pglite' });
  });

  it('migrates over the direct connection where one is given', () => {
    const env = {
      DATABASE_URL: 'postgres://u:p@ep-x-pooler.example/db',
      DATABASE_URL_UNPOOLED: 'postgres://u:p@ep-x.example/db',
    };
    expect(driverFor(env)).toMatchObject({ url: env.DATABASE_URL });
    expect(driverFor(env, { migrating: true })).toMatchObject({
      url: env.DATABASE_URL_UNPOOLED,
    });
    expect(
      driverFor({ DATABASE_URL: env.DATABASE_URL }, { migrating: true }),
    ).toMatchObject({ url: env.DATABASE_URL });
  });

  it('builds a pool over a URL without connecting to it', async () => {
    vi.stubEnv('DATABASE_URL', UNREACHABLE);
    const db = await database();
    const pool = (db as unknown as { $client: Pool }).$client;
    expect(pool).toBeInstanceOf(Pool);
    expect(pool.totalCount).toBe(0);
    expect(pool.options).toMatchObject({
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      query_timeout: 30_000,
    });
    // The same one for the life of the process.
    expect(await database()).toBe(db);
    expect(existsSync(path.join(scratch(), 'data'))).toBe(false);
  });

  it('reports an unreachable server when asked, not before', async () => {
    const pool = poolFor(UNREACHABLE, { max: 1 });
    await expect(pool.query('select 1')).rejects.toThrow();
    await pool.end();
  });

  it('refuses a test that has not set up a database of its own', async () => {
    await expect(database()).rejects.toThrow('inScratchDatabase');
    expect(existsSync(path.join(scratch(), 'data'))).toBe(false);
  });

  it('opens one database for requests that arrive together, and again after it is closed', async () => {
    vi.stubEnv('SAFEPOINT_PGLITE_IN_TESTS', '1');
    const folder = path.join(scratch(), 'data', 'pglite');
    // The migrations are found beside the working directory.
    symlinkSync(MIGRATIONS, path.join(scratch(), 'drizzle'));
    // Not yet opened: the first request finds nothing, and so does the second.
    const [one, two, three] = await Promise.all([
      database(),
      database(),
      database(),
    ]);
    expect(two).toBe(one);
    expect(three).toBe(one);
    expect(await tables(one)).toContain('source_reads');
    await one.insert(processes).values({ id: 'first-run' });
    await closeDatabase();
    // A second process on the same folder: what the first kept is there, and
    // it is migrated once, not again.
    const [again] = await Promise.all([database(), database()]);
    expect(again).not.toBe(one);
    expect(await again.select().from(processes)).toMatchObject([
      { id: 'first-run' },
    ]);
    expect(existsSync(folder)).toBe(true);
  });

  it('opens PGlite in data/pglite only when asked, migrated', async () => {
    const folder = path.join(scratch(), 'data', 'pglite');
    expect(existsSync(folder)).toBe(false);
    const opened = await open(driverFor({}), { migrations: MIGRATIONS });
    expect(
      (opened.db as unknown as { $client: unknown }).$client,
    ).toBeInstanceOf(PGlite);
    expect(existsSync(folder)).toBe(true);
    expect(await tables(opened.db)).toContain('rulebook_revisions');
    await opened.db.insert(processes).values({ id: 'kept-on-disk' });
    await opened.close();
    // Kept on disk: opened again, it is there, and migrating again is a no-op.
    const again = await open(driverFor({}), { migrations: MIGRATIONS });
    expect(await again.db.select().from(processes)).toMatchObject([
      { id: 'kept-on-disk' },
    ]);
    await again.close();
  });
});

describe('a reset', () => {
  const pglite = { kind: 'pglite', dataDir: '/tmp/x' } as const;
  const server = { kind: 'node-postgres', url: UNREACHABLE } as const;

  it('runs on the local PGlite folder', () => {
    expect(resetRefusal(pglite, {})).toBeNull();
  });

  it('refuses a server nobody marked as development', () => {
    expect(resetRefusal(server, {})).toMatch(/^Refused/);
    expect(resetRefusal(server, { [RESETTABLE]: '' })).toMatch(/^Refused/);
  });

  it('refuses a server other than the one marked', () => {
    expect(
      resetRefusal(
        { kind: 'node-postgres', url: 'postgres://u:p@ep-main.example/db' },
        { [RESETTABLE]: 'postgres://u:p@ep-dev.example/db' },
      ),
    ).toMatch(/^Refused/);
  });

  it('runs on exactly the server marked', () => {
    expect(resetRefusal(server, { [RESETTABLE]: UNREACHABLE })).toBeNull();
  });

  it('never runs on Vercel or in production, whatever is marked', () => {
    const envs: Environment[] = [
      { VERCEL: '1' },
      { VERCEL_ENV: 'preview' },
      { NODE_ENV: 'production' },
    ];
    for (const env of envs) {
      expect(
        resetRefusal(server, { ...env, [RESETTABLE]: UNREACHABLE }),
      ).toMatch(/^Refused/);
      expect(resetRefusal(pglite, env)).toMatch(/^Refused/);
    }
  });

  describe('on a database', () => {
    const db = inScratchDatabase();

    it('drops everything, and migrating again gives it all back empty', async () => {
      await db().insert(processes).values({ id: 'gone-after-reset' });
      await dropEverything(db());
      expect(await tables(db())).toEqual([]);
      const { migrate } = await import('drizzle-orm/pglite/migrator');
      await migrate(db() as never, { migrationsFolder: MIGRATIONS });
      expect(await tables(db())).toHaveLength(19);
      expect(await db().select().from(processes)).toEqual([]);
    });
  });
});
