import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import {
  readWholeSheet,
  sheetReadSchema,
  tabValues,
  type SheetRead,
} from '@/lib/sheets/composio';
import { sourceReadsDir } from '@/lib/storage/run-data';
import { readKept, writeKept, type ReadOptions } from '@/server/storage/files';

import {
  columnsOf,
  sourceById,
  type SourceId,
  type SourceSummary,
  type SourceValues,
} from './model';

/*
  Server-only. Reading a source from its own page: every resource, kept whole
  in data/sources/<id>/reads/ (gitignored) so it can be looked into later.
  Separate from a run's read, which a run takes for itself and keeps with it.
*/

// The copy kept in the repository for each source, until it is read here.
const CAPTURED: Record<SourceId, string> = {
  'brunch-store-sheet': 'fixtures/brunch-orders/sheet-snapshot.json',
};

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
  const read = await readKept(
    path.join(process.cwd(), CAPTURED[id]),
    sheetReadSchema,
    { unreadableIsMissing: true },
  );
  return read && fromSheet(read, 'captured');
}

async function kept(
  id: SourceId,
  readId: string,
  options?: ReadOptions,
): Promise<KeptSourceRead | null> {
  if (readId === 'captured') return captured(id);
  // A bare id only: nothing outside the reads folder can be named.
  if (!/^[\w-]+$/.test(readId)) return null;
  return readKept(
    path.join(sourceReadsDir(id), `${readId}.json`),
    keptSourceReadSchema,
    options,
  );
}

// Ids start with the time read, so the last by name is the latest.
async function latestId(id: SourceId): Promise<string | null> {
  const names = await readdir(sourceReadsDir(id)).catch(() => []);
  const ids = names
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
  return ids.at(-1) ?? null;
}

export function isSourceId(id: string): id is SourceId {
  return sourceById(id) !== undefined;
}

// The latest read kept here, or the captured copy until there is one.
export async function latestSummary(
  id: SourceId,
): Promise<SourceSummary | null> {
  const last = await latestId(id);
  // The page shows what it can: a read that cannot be read gives way to the
  // captured copy, and sourceValues says why when it is asked for.
  const read =
    (last ? await kept(id, last, { unreadableIsMissing: true }) : null) ??
    (await captured(id));
  return read ? summary(read) : null;
}

export async function readSource(id: SourceId): Promise<SourceSummary> {
  const sheet = await readWholeSheet();
  const failed = sheet.requests.find((request) => !request.successful);
  if (failed) throw new Error(failed.error ?? 'The read failed.');
  const read = fromSheet(sheet, 'live');
  await writeKept(path.join(sourceReadsDir(id), `${read.readId}.json`), read, {
    compact: true,
  });
  return summary(read);
}

export async function sourceValues(
  id: SourceId,
  readId: string,
): Promise<SourceValues | null> {
  const read = await kept(id, readId);
  return read ? { readId: read.readId, resources: read.resources } : null;
}
