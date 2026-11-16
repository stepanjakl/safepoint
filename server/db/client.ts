import 'server-only';

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { drizzle as overPool } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import * as schema from './schema.ts';

/*
  Server-only. The one place the database is opened (docs/engineering/
  DATABASE.md). With DATABASE_URL set, a node-postgres pool: interactive
  transactions need a connection, and Fluid compute reuses an instance, so a
  pool outlives a request. Without it, PGlite, Postgres in this process, kept
  under data/pglite/ so the app starts with no credentials; it is a
  development dependency, loaded only on that path. Tests hand in a PGlite in
  memory (`useDatabaseInTests`). Nothing here connects until asked.
*/

type Schema = typeof schema;

// The database or a transaction on it, whichever driver: what a storage
// function takes, so it can run alone or inside a caller's transaction
// (Drizzle's transaction is a PgDatabase too; use db.transaction itself).
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

// The variables read, from process.env or a test's own.
export type Environment = Record<string, string | undefined>;

export type Driver =
  { kind: 'node-postgres'; url: string } | { kind: 'pglite'; dataDir: string };

/*
  Which driver, from the environment, read when called (tests mock
  process.cwd()). `migrating` takes the direct connection where there is one:
  Neon's pooler is PgBouncer in transaction mode, which a migration's session
  state does not survive. SAFEPOINT_PGLITE_DIR moves the PGlite folder, for the
  browser tests' server (playwright.config.ts), which must not use the one
  `pnpm dev` keeps.
*/
export function driverFor(
  env: Environment = process.env,
  { migrating = false }: { migrating?: boolean } = {},
): Driver {
  const url =
    (migrating ? env.DATABASE_URL_UNPOOLED : undefined) || env.DATABASE_URL;
  return url
    ? { kind: 'node-postgres', url }
    : {
        kind: 'pglite',
        dataDir: path.resolve(
          process.cwd(),
          env.SAFEPOINT_PGLITE_DIR || path.join('data', 'pglite'),
        ),
      };
}

const migrationsFolder = () => path.join(process.cwd(), 'drizzle');

type Opened = {
  db: Database;
  // Applies drizzle/'s migrations not yet applied.
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

/*
  A pool for a pooled Neon connection on Fluid compute. Each setting is for
  that: a pooled connection is cheap to open again, and a suspended instance
  should not sit on idle ones.
*/
export function poolFor(url: string, { max = 5 }: { max?: number } = {}) {
  const pool = new Pool({
    connectionString: url,
    // An instance serves requests concurrently; more than a few connections
    // each only multiplies what Neon's pool must hold across instances.
    max,
    // Idle connections are let go soon, so a suspended instance holds few.
    idleTimeoutMillis: 10_000,
    // Long enough for a compute waking from scale-to-zero, short enough that
    // a request fails rather than hangs when the database is unreachable.
    connectionTimeoutMillis: 10_000,
    // Client-side: PgBouncer in transaction mode carries a server-side
    // statement_timeout from one client to the next, so none is set there.
    query_timeout: 30_000,
    application_name: 'safepoint',
  });
  // An idle connection the server closes emits here; unheard, it would end
  // the process. The next query opens another.
  pool.on('error', () => undefined);
  return pool;
}

export async function open(
  driver: Driver,
  { migrate = driver.kind === 'pglite', migrations = migrationsFolder() } = {},
): Promise<Opened> {
  let opened: Opened;
  if (driver.kind === 'node-postgres') {
    const pool = poolFor(driver.url);
    const db = overPool({ client: pool, schema });
    opened = {
      db,
      migrate: async () => {
        const { migrate: run } =
          await import('drizzle-orm/node-postgres/migrator');
        await run(db, { migrationsFolder: migrations });
      },
      close: () => pool.end(),
    };
  } else {
    // Loaded here and only here: a production bundle never needs it.
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    // PGlite makes its own folder but not the ones above it.
    await mkdir(path.dirname(driver.dataDir), { recursive: true });
    const client = await PGlite.create(driver.dataDir);
    const db = drizzle({ client, schema });
    opened = {
      db,
      migrate: async () => {
        const { migrate: run } = await import('drizzle-orm/pglite/migrator');
        await run(db, { migrationsFolder: migrations });
      },
      close: () => client.close(),
    };
  }
  if (migrate) await opened.migrate();
  return opened;
}

// Held on globalThis, like the job map (server/jobs/run-job.ts): a
// development recompile re-runs this module and each route is its own
// bundle, but a process opens one pool, or one PGlite on its folder.
const server = globalThis as {
  safepointDatabase?: Promise<Opened>;
  safepointDatabaseInTests?: Database | null;
  safepointOnce?: Map<string, Promise<void>>;
};

export async function database(): Promise<Database> {
  if (server.safepointDatabaseInTests) return server.safepointDatabaseInTests;
  const driver = driverFor();
  // A test that forgot inScratchDatabase() must fail fast, not open (or
  // leave in a repository) a data/pglite/; client.test.ts opts in.
  if (
    process.env.VITEST &&
    !process.env.SAFEPOINT_PGLITE_IN_TESTS &&
    driver.kind === 'pglite'
  )
    throw new Error('A test reaches the database through inScratchDatabase().');
  const opening = (server.safepointDatabase ??= open(driver));
  try {
    return (await opening).db;
  } catch (error) {
    // Asked again, it tries again rather than repeating this failure.
    if (server.safepointDatabase === opening) delete server.safepointDatabase;
    throw error;
  }
}

// Closes the process's database, if one was opened; the next call opens it
// again. For a script or a shutdown, never between requests.
export async function closeDatabase() {
  const opening = server.safepointDatabase;
  delete server.safepointDatabase;
  delete server.safepointOnce;
  await (await opening?.catch(() => null))?.close();
}

// For inScratchDatabase(): the database every call gets until it is cleared.
export function useDatabaseInTests(db: Database | null) {
  if (!process.env.VITEST)
    throw new Error('Only a test hands the database in.');
  server.safepointDatabaseInTests = db;
  // A test's database is emptied before each test: nothing done is kept.
  delete server.safepointOnce;
}

/*
  Runs `task` once per key for the database this process has open (seeding
  rulebooks from fixtures/, server/storage/rulebook-files.ts), and answers
  every later call with the same promise. A task that fails is forgotten,
  so the next call tries it again and fails as loudly. Forgotten too when
  the database is closed or a test hands one in; a database reset under a
  running server is not noticed until the server restarts.
*/
export function oncePerDatabase(
  key: string,
  task: () => Promise<void>,
): Promise<void> {
  const done = (server.safepointOnce ??= new Map());
  let running = done.get(key);
  if (!running) {
    running = task();
    done.set(key, running);
    running.catch(() => {
      if (done.get(key) === running) done.delete(key);
    });
  }
  return running;
}
