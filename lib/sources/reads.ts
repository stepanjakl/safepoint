import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  readWholeSheet,
  tabValues,
  type SheetRead,
} from '@/lib/sheets/composio';
import { sourceReadsDir } from '@/lib/storage/run-data';

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

type KeptSourceRead = Omit<SourceSummary, 'resources'> & {
  resources: SourceValues['resources'];
};

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

async function captured(id: SourceId): Promise<KeptSourceRead | null> {
  try {
    const file = path.join(process.cwd(), CAPTURED[id]);
    return fromSheet(
      JSON.parse(await readFile(file, 'utf8')) as SheetRead,
      'captured',
    );
  } catch {
    return null;
  }
}

async function kept(
  id: SourceId,
  readId: string,
): Promise<KeptSourceRead | null> {
  if (readId === 'captured') return captured(id);
  // A bare id only: nothing outside the reads folder can be named.
  if (!/^[\w-]+$/.test(readId)) return null;
  try {
    return JSON.parse(
      await readFile(path.join(sourceReadsDir(id), `${readId}.json`), 'utf8'),
    ) as KeptSourceRead;
  } catch {
    return null;
  }
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
  const read = (last ? await kept(id, last) : null) ?? (await captured(id));
  return read ? summary(read) : null;
}

export async function readSource(id: SourceId): Promise<SourceSummary> {
  const sheet = await readWholeSheet();
  const failed = sheet.requests.find((request) => !request.successful);
  if (failed) throw new Error(failed.error ?? 'The read failed.');
  const read = fromSheet(sheet, 'live');
  await mkdir(sourceReadsDir(id), { recursive: true });
  await writeFile(
    path.join(sourceReadsDir(id), `${read.readId}.json`),
    JSON.stringify(read),
  );
  return summary(read);
}

export async function sourceValues(
  id: SourceId,
  readId: string,
): Promise<SourceValues | null> {
  const read = await kept(id, readId);
  return read ? { readId: read.readId, resources: read.resources } : null;
}
