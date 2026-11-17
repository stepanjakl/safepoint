import 'server-only';

import { createHash } from 'node:crypto';
import path from 'node:path';

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  readWholeSheet,
  sheetReadSchema,
  tabValues,
  type SheetRead,
} from '@/lib/sheets/composio';
import {
  columnsOf,
  sourceById,
  type SourceId,
  type SourceSummary,
  type SourceValues,
} from '@/lib/sources/model';

import { database } from '@/server/db/client';
import { keptProcesses } from '@/server/operations/kept-processes';
import { sourceReads } from '@/server/db/schema';

import { readKept } from './files';
import { FILE_ID } from './ids';
import { parseStored } from './stored';

/*
  Server-only. Reading a source from its own page: every resource, kept whole
  in the `source_reads` table so it can be looked into later. Separate from a
  run's read, which a run takes for itself and keeps with it.
*/

// The copy kept in the repository for each source, until it is read here.
const CAPTURED: Record<string, string> = Object.fromEntries(
  keptProcesses().flatMap(({ runs }) =>
    runs ? [[runs.reads.source, runs.reads.captured]] : [],
  ),
);

export const keptSourceReadSchema = z.object({
  readId: z.string(),
  readAt: z.string(),
  origin: z.enum(['live', 'captured']),
  title: z.string().nullable(),
  url: z.string().nullable(),
  resources: z.array(
    z.object({ name: z.string(), values: z.array(z.array(z.unknown())) }),
  ),
});
type KeptSourceRead = z.infer<typeof keptSourceReadSchema>;

function fromSheet(
  read: SheetRead,
  origin: KeptSourceRead['origin'],
): KeptSourceRead {
  const resources = read.tabs.map((name) => ({
    name,
    values: tabValues(read, name),
  }));
  const hash = createHash('sha256')
    .update(JSON.stringify(resources))
    .digest('hex')
    .slice(0, 8);
  return {
    readId:
      origin === 'captured'
        ? 'captured'
        : `${read.readAt.replace(/[:.]/g, '-')}-${hash}`,
    readAt: read.readAt,
    origin,
    title: read.spreadsheet.title,
    url: read.spreadsheet.url,
    resources,
  };
}

function summary(read: KeptSourceRead): SourceSummary {
  return {
    ...read,
    resources: read.resources.map(({ name, values }) => ({
      name,
      rows: Math.max(0, values.length - 1),
      columns: columnsOf(values),
    })),
  };
}

// The copy in the repository is only a stand-in, so one that cannot be read is
// the same as none.
async function captured(id: SourceId): Promise<KeptSourceRead | null> {
  const file = CAPTURED[id];
  if (!file) return null;
  const read = await readKept(
    // Not traced by itself, so next.config.ts includes the file where it is read.
    path.join(/*turbopackIgnore: true*/ process.cwd(), file),
    sheetReadSchema,
    { unreadableIsMissing: true },
  );
  return read && fromSheet(read, 'captured');
}

const where = (id: SourceId, readId: string) => `The kept read ${id}/${readId}`;

async function kept(
  id: SourceId,
  readId: string,
): Promise<KeptSourceRead | null> {
  if (readId === 'captured') return captured(id);
  // A bare id only, as when it named a file.
  if (!FILE_ID.test(readId)) return null;
  const [row] = await (
    await database()
  )
    .select({ body: sourceReads.body })
    .from(sourceReads)
    .where(and(eq(sourceReads.source, id), eq(sourceReads.readId, readId)));
  return row
    ? parseStored(row.body, keptSourceReadSchema, where(id, readId))
    : null;
}

// Ids start with the time read, so the last by name was the latest: the last
// by byte order is, which `source_reads_latest` serves.
async function latest(id: SourceId) {
  const [row] = await (
    await database()
  )
    .select({ readId: sourceReads.readId, body: sourceReads.body })
    .from(sourceReads)
    .where(eq(sourceReads.source, id))
    .orderBy(sql`${sourceReads.readId} collate "C" desc`)
    .limit(1);
  return row ?? null;
}

export function isSourceId(id: string): id is SourceId {
  return sourceById(id) !== undefined;
}

// The latest read kept here, or the captured copy until there is one.
export async function latestSummary(
  id: SourceId,
): Promise<SourceSummary | null> {
  const last = await latest(id);
  // The page shows what it can: a read that cannot be read gives way to the
  // captured copy, and sourceValues says why when it is asked for.
  const parsed = last && keptSourceReadSchema.safeParse(last.body);
  const read = (parsed?.success ? parsed.data : null) ?? (await captured(id));
  return read ? summary(read) : null;
}

export async function readSource(id: SourceId): Promise<SourceSummary> {
  const sheet = await readWholeSheet();
  const failed = sheet.requests.find((request) => !request.successful);
  if (failed) throw new Error(failed.error ?? 'The read failed.');
  const read = keptSourceReadSchema.parse(fromSheet(sheet, 'live'));
  // Written once: an id is the time read and a hash of what was read, so a
  // second keep of it is the same read and leaves the first as it was.
  await (
    await database()
  )
    .insert(sourceReads)
    .values({
      source: id,
      readId: read.readId,
      readAt: new Date(read.readAt),
      body: read,
    })
    .onConflictDoNothing();
  return summary(read);
}

export async function sourceValues(
  id: SourceId,
  readId: string,
): Promise<SourceValues | null> {
  const read = await kept(id, readId);
  return read ? { readId: read.readId, resources: read.resources } : null;
}
