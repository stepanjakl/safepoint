import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrationsInto } from './postgres.fixture';

/*
  What the PostgreSQL tests rest on, proved here on every run, on PGlite
  (PostgreSQL, one connection): the migrations, rewritten into a schema of
  their own, make every table, function, key and trigger there and nothing
  in public, and their guards still hold. postgres.test.ts proves the same
  against a real server when one is given.
*/

const SCHEMA = 'safepoint_test_proof';

describe('the migrations applied into a schema of their own', () => {
  let client: PGlite;
  const names = async (sql: string) =>
    (await client.query<{ name: string }>(sql, [SCHEMA])).rows.map(
      (row) => row.name,
    );

  beforeAll(async () => {
    client = await PGlite.create();
    // Something already in public, as a shared database has.
    await client.exec(
      `create table public.kept (id int); insert into public.kept values (1), (2);`,
    );
    await client.exec('begin');
    await client.exec(`create schema ${SCHEMA}`);
    await client.exec(`set local search_path to ${SCHEMA}`);
    for (const statement of migrationsInto(SCHEMA))
      await client.exec(statement);
    await client.exec('commit');
  });
  afterAll(() => client.close());

  it('names no schema but its own', () => {
    for (const statement of migrationsInto(SCHEMA))
      expect(statement).not.toMatch(/"public"\./);
  });

  it('makes every table, function and trigger there, and nothing in public', async () => {
    const tables = await names(
      `select tablename as name from pg_tables where schemaname = $1`,
    );
    expect(tables).toContain('runs');
    expect(tables).toContain('record_decisions');
    expect(tables).toHaveLength(19);
    expect(
      (
        await client.query<{ name: string }>(
          `select tablename as name from pg_tables where schemaname = 'public'`,
        )
      ).rows.map((row) => row.name),
    ).toEqual(['kept']);
    expect(
      (
        await client.query<{ n: number }>(
          'select count(*)::int as n from public.kept',
        )
      ).rows[0]!.n,
    ).toBe(2);
    const functions = await names(
      `select proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1`,
    );
    expect(functions.sort()).toEqual([
      'safepoint_application_moves_forward',
      'safepoint_next_revision',
      'safepoint_run_keeps_its_start',
      'safepoint_written_once',
    ]);
    // Every trigger runs a function of the schema, on a table of the schema.
    const triggers = await names(
      `select t.tgname as name from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace tn on tn.oid = c.relnamespace
         join pg_proc p on p.oid = t.tgfoid
         join pg_namespace pn on pn.oid = p.pronamespace
       where not t.tgisinternal and tn.nspname = $1 and pn.nspname = $1`,
    );
    expect(triggers).toHaveLength(12);
  });

  it('points every foreign key at a table of the schema', async () => {
    const elsewhere = await names(
      `select con.conname as name from pg_constraint con
         join pg_class c on c.oid = con.conrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_class f on f.oid = con.confrelid
         join pg_namespace fn on fn.oid = f.relnamespace
       where con.contype = 'f' and n.nspname = $1 and fn.nspname <> $1`,
    );
    expect(elsewhere).toEqual([]);
    const keys = await names(
      `select con.conname as name from pg_constraint con
         join pg_class c on c.oid = con.conrelid
         join pg_namespace n on n.oid = c.relnamespace
       where con.contype = 'f' and n.nspname = $1`,
    );
    expect(keys.length).toBeGreaterThan(30);
  });

  it('keeps its guards: a run is never removed, a decision never changed', async () => {
    await client.exec(`set search_path to ${SCHEMA}`);
    await client.exec(`
      insert into processes (id) values ('p');
      insert into instruction_versions (process, hash, version, text, origin, published_at)
        values ('p', left(encode(sha256(convert_to('T', 'UTF8')), 'hex'), 12), 'v1', 'T', 'declared', now());
      insert into runs (process, id, instructions_hash, read_process, stage, status, trigger, started_at)
        values ('p', 'run-1', left(encode(sha256(convert_to('T', 'UTF8')), 'hex'), 12), 'p', 'read', 'running', 'manual', now());
    `);
    await expect(client.exec(`delete from runs`)).rejects.toThrow(
      'runs rows are never removed',
    );
    await expect(
      client.exec(`update instruction_versions set note = 'x'`),
    ).rejects.toThrow('instruction_versions rows are written once');
  });
});
