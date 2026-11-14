import 'server-only';

import { sql } from 'drizzle-orm';

import type { Database, Driver, Environment } from './client.ts';

/*
  Server-only. `pnpm db:reset`: drop everything and migrate again. It fails
  closed: it runs on the local PGlite folder, or on a server URL only when
  that exact URL is also given as SAFEPOINT_RESETTABLE_DATABASE_URL, the
  owner's mark that it is a development database, and never on Vercel or
  under a production NODE_ENV, whatever is marked.
*/

export const RESETTABLE = 'SAFEPOINT_RESETTABLE_DATABASE_URL';

// Why this target may not be reset, or null when it may.
export function resetRefusal(
  driver: Driver,
  env: Environment = process.env,
): string | null {
  if (env.VERCEL || env.VERCEL_ENV)
    return 'Refused: a reset never runs on Vercel.';
  if (env.NODE_ENV === 'production') return 'Refused: NODE_ENV is production.';
  if (driver.kind === 'pglite') return null;
  const marked = env[RESETTABLE];
  if (!marked)
    return `Refused: the database is a server, and ${RESETTABLE} does not mark any as development. Set it to this exact URL to reset it.`;
  if (marked !== driver.url)
    return `Refused: the database URL is not the one ${RESETTABLE} marks as development.`;
  return null;
}

// Drops every table, the migrations' record included; migrate afterwards.
export async function dropEverything(db: Database) {
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
}
