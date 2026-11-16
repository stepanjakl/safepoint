import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import type { Database } from './client';
import * as schema from './schema';

/*
  The concurrency tests on a real PostgreSQL server, opt-in: set
  SAFEPOINT_TEST_DATABASE_URL to a server's direct (unpooled) URL and run
  `pnpm test:postgres`. Unset, the files that use this skip, and nothing
  here connects anywhere.

  The server may be a shared development database with real rows in
  `public`, so a run never touches it: each test file makes a schema of its
  own (`safepoint_test_<random>`), applies drizzle/ into it, gives every
  connection `search_path` set to it alone, and drops it when the file ends,
  failed or not. The generated SQL names "public" in its foreign keys
  (drizzle/0003_run_data_reads.sql), so the migrations are applied with
  every `"public".` rewritten to the test schema, and refused if any other
  mention of public is left; the hand-written ones name no schema and land
  in the search path's only one. Drizzle's own migrator is not used: it
  would keep its journal in a `drizzle` schema the server shares.

  `public`'s tables and their row counts are taken before and compared
  after, before the schema is dropped: a file that changed them fails.

  Advisory locks are database-wide, not per schema: a run can wait a moment
  on a lock the development app holds on the same key, and change nothing
  of it.
*/

export const POSTGRES_URL = process.env.SAFEPOINT_TEST_DATABASE_URL || null;

const MIGRATIONS = path.join(import.meta.dirname, '..', '..', 'drizzle');

// Migrations in order, as drizzle/meta/_journal.json lists them, each split
// into its statements, with the schema they create rewritten to `into`.
export function migrationsInto(into: string): string[] {
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] };
  return journal.entries.flatMap(({ tag }) => {
    const sql = readFileSync(path.join(MIGRATIONS, `${tag}.sql`), 'utf8')
      .split('"public".')
      .join(`"${into}".`);
    // Whatever names public in another way would reach the shared schema.
    const left = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    if (/\bpublic\b/i.test(left))
      throw new Error(`${tag}.sql names public in a way not rewritten.`);
    return sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
  });
}

// Every table of a schema with its row count, by name.
async function tablesOf(client: Client, of: string) {
  const { rows } = await client.query<{ name: string }>(
    `select tablename as name from pg_tables where schemaname = $1 order by tablename`,
    [of],
  );
  const counted: Record<string, number> = {};
  for (const { name } of rows) {
    const { rows: count } = await client.query<{ n: string }>(
      `select count(*) as n from ${quoted(of)}.${quoted(name)}`,
    );
    counted[name] = Number(count[0]!.n);
  }
  return counted;
}

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

// A pooled URL cannot hold a search_path (PgBouncer in transaction mode
// takes no SET, and no `options`), and every query would then reach public.
function directOnly(url: string) {
  const host = new URL(url).hostname;
  if (host.includes('-pooler'))
    throw new Error(
      'SAFEPOINT_TEST_DATABASE_URL is a pooled URL: give the direct one.',
    );
  if (process.env.VERCEL || process.env.NODE_ENV === 'production')
    throw new Error('The PostgreSQL tests never run in production.');
}

export type Postgres = {
  db: () => Database;
  // The test schema's name, and a URL whose connections use only it, for a
  // child process to open the database through.
  schema: () => string;
  url: () => string;
  // Empties every table, as between tests; for a loop that needs it.
  reset: () => Promise<void>;
  // `public` as it was when the file began, and as it is now.
  publicBefore: () => Record<string, number>;
  publicNow: () => Promise<Record<string, number>>;
};

/*
  Gives the file's tests the test schema, emptied before each, through a
  node-postgres pool of `connections`, which `database()` hands out
  (server/db/client.ts). Registers nothing when no server is given.
*/
export function inPostgresDatabase({
  connections = 10,
}: { connections?: number } = {}): Postgres {
  const name = `safepoint_test_${randomBytes(6).toString('hex')}`;
  let admin: Client | null = null;
  let pool: Pool | null = null;
  let db: Database | null = null;
  let before: Record<string, number> = {};
  let tables = '';
  const searchPath = `-c search_path=${name}`;
  const urlOf = () => {
    const url = new URL(POSTGRES_URL!);
    url.searchParams.set('options', searchPath);
    return url.toString();
  };
  const reset = async () => {
    await admin!.query(`truncate table ${tables} restart identity cascade`);
  };
  if (POSTGRES_URL) {
    beforeAll(async () => {
      directOnly(POSTGRES_URL);
      const client = new Client({ connectionString: POSTGRES_URL });
      await client.connect();
      // Only a connected client is asked to clean up after.
      admin = client;
      before = await tablesOf(admin, 'public');
      // Made and migrated whole, or not at all.
      await admin.query('begin');
      try {
        await admin.query(`create schema ${quoted(name)}`);
        await admin.query(`set local search_path to ${quoted(name)}`);
        for (const statement of migrationsInto(name))
          await admin.query(statement);
        await admin.query('commit');
      } catch (error) {
        await admin.query('rollback');
        throw error;
      }
      const made = Object.keys(await tablesOf(admin, name));
      tables = made.map((table) => `${quoted(name)}.${quoted(table)}`).join();
      pool = new Pool({
        connectionString: POSTGRES_URL,
        options: searchPath,
        max: connections,
      });
      pool.on('error', () => undefined);
      db = drizzle({ client: pool, schema }) as unknown as Database;
      const { rows } = await pool.query<{ at: string }>(
        'select current_schema() as at',
      );
      if (rows[0]?.at !== name)
        throw new Error(`Connections use ${rows[0]?.at}, not ${name}.`);
    });
    beforeEach(async () => {
      const { useDatabaseInTests } = await import('./client');
      await reset();
      useDatabaseInTests(db);
    });
    afterAll(async () => {
      try {
        const { useDatabaseInTests } = await import('./client');
        useDatabaseInTests(null);
        await pool?.end();
        if (admin) {
          const after = await tablesOf(admin, 'public');
          if (JSON.stringify(after) !== JSON.stringify(before))
            throw new Error(
              `The run changed public: ${JSON.stringify(before)} before, ${JSON.stringify(after)} after.`,
            );
        }
      } finally {
        await admin?.query(`drop schema if exists ${quoted(name)} cascade`);
        await admin?.end();
      }
    });
  }
  return {
    db: () => {
      if (!db) throw new Error('No PostgreSQL test database: none was given.');
      return db;
    },
    schema: () => name,
    url: urlOf,
    reset,
    publicBefore: () => before,
    publicNow: () => tablesOf(admin!, 'public'),
  };
}

// How many times each race is run: each repetition is a fresh race the
// server's scheduler orders, so a broken invariant shows within a few
// dozen; more, with SAFEPOINT_TEST_REPEATS, for a longer soak.
export const REPEATS = Number(process.env.SAFEPOINT_TEST_REPEATS) || 25;
