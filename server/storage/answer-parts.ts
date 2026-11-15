import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';

import { database, type Database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { answerParts, type PART_KINDS } from '@/server/db/schema';

import type { RunKey } from './run-key';

/*
  Server-only. A proposal or cross-check still being answered, kept batch by
  batch in `answer_parts` so one that stops part way asks only for the rest.
  A part is replaced as each batch arrives (an upsert on its key) and removed
  once the whole is kept; it is only a head start, so one that no longer fits
  its schema reads as none kept, while a database that cannot be read is
  reported.
*/
export type PartKind = (typeof PART_KINDS)[number];

const keyOf = (kind: PartKind, { process, readId, fingerprint }: RunKey) =>
  and(
    eq(answerParts.process, process),
    eq(answerParts.kind, kind),
    eq(answerParts.readId, readId),
    eq(answerParts.fingerprint, fingerprint),
  );

export async function keptPart<T>(
  kind: PartKind,
  key: RunKey,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const [row] = await (
    await database()
  )
    .select({ body: answerParts.body })
    .from(answerParts)
    .where(keyOf(kind, key));
  const parsed = row && schema.safeParse(row.body);
  return parsed?.success ? parsed.data : null;
}

export async function keepPart<T>(
  kind: PartKind,
  key: RunKey,
  schema: z.ZodType<T>,
  part: T,
): Promise<void> {
  const body = schema.parse(part);
  const db = await database();
  await ensureProcess(db, key.process);
  await db
    .insert(answerParts)
    .values({ ...key, kind, body })
    .onConflictDoUpdate({
      target: [
        answerParts.process,
        answerParts.kind,
        answerParts.readId,
        answerParts.fingerprint,
      ],
      set: { body, updatedAt: sql`now()` },
    });
}

// Takes a database or a transaction, so the whole can be kept in the same one.
export async function dropPart(
  db: Database,
  kind: PartKind,
  key: RunKey,
): Promise<void> {
  await db.delete(answerParts).where(keyOf(kind, key));
}
