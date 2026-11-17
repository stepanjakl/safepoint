import type { KeptRead } from '@/lib/engine/records';
import type { Database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { reads } from '@/server/db/schema';
import { readProcessOf } from '@/server/storage/brunch-orders-reads';

// A stand-in read of this id, kept where the app keeps reads, so a proposal,
// cross-check or part made on it has the read its key points at.
export async function keepStandInRead(db: Database, id: string) {
  const process = readProcessOf({ id: '' });
  await ensureProcess(db, process);
  await db
    .insert(reads)
    .values({
      process,
      id,
      readAt: new Date('2026-01-01T00:00:00.000Z'),
      source: 'A stand-in read',
      body: { id } as never,
    })
    .onConflictDoNothing();
}

// A whole read kept as the app keeps one, for what reads it back by its id:
// a job's steps are handed the id, never the read.
export async function keepRead(db: Database, read: KeptRead) {
  const process = readProcessOf({ id: '' });
  await ensureProcess(db, process);
  await db
    .insert(reads)
    .values({
      process,
      id: read.id,
      readAt: new Date(read.readAt),
      source: read.source,
      body: read,
    })
    .onConflictDoNothing();
}
