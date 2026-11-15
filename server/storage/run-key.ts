import 'server-only';

import { sql } from 'drizzle-orm';

import type { Database } from '@/server/db/client';

/*
  Server-only. What names a run: the process, the read it was taken on and the
  fingerprint of the rulebook it used. Proposals, cross-checks, their parts
  and the record of each write are kept by it in the database.
*/

export type RunKey = { process: string; readId: string; fingerprint: string };

/*
  Takes a run key's lock for the rest of the transaction: a decision on its
  proposal, and a write's claim through a kept run, each hold it, so of a
  decision and a write begun together one goes first and the other sees
  what it did (server/storage/decisions.ts, applications.ts).
  Transaction-scoped, since Neon's pooler cannot hold a session lock.
*/
export async function lockRunKey(db: Database, key: RunKey) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`run-key:${key.process}:${key.readId}:${key.fingerprint}`}, 0))`,
  );
}
