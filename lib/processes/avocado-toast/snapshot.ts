import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BRUNCH_PROCESS_ID } from '@/lib/processes/avocado-toast/process';
import { readWholeSheet, type SheetRead } from '@/lib/sheets/composio';
import { runDataDir } from '@/lib/storage/run-data';

/*
  Server-only. Where the Brunch weekend sheet comes from: a live read through
  Composio, or the last read saved to the repository (no network, used by
  tests and by default on the page). Saving is an explicit action.
*/

export const PROCESS_ID = BRUNCH_PROCESS_ID;
const CAPTURED = path.join(
  process.cwd(),
  'fixtures',
  PROCESS_ID,
  'sheet-snapshot.json',
);

export type SnapshotSource = 'captured' | 'live';

export async function loadSnapshot(
  source: SnapshotSource,
): Promise<{ read: SheetRead; label: string }> {
  if (source === 'live') {
    const read = await readWholeSheet();
    return { read, label: `Live read through Composio at ${read.readAt}` };
  }
  const read = JSON.parse(await readFile(CAPTURED, 'utf8')) as SheetRead;
  return {
    read,
    label: `Captured read from ${read.readAt} (fixtures/${PROCESS_ID}/sheet-snapshot.json)`,
  };
}

/*
  A run reads the sheet once and every later step uses that read. The captured
  read is already a file; a live read is kept under an id in data/ (gitignored), so
  Calculate evaluates exactly what the Read step showed, not a second read.
*/
// Read when used, so a test can work in a scratch directory.
const READS = () => runDataDir(PROCESS_ID, 'reads');
export const CAPTURED_READ = 'captured';

export async function keepRead(read: SheetRead): Promise<string> {
  const hash = createHash('sha256')
    .update(JSON.stringify(read.valueRanges))
    .digest('hex')
    .slice(0, 8);
  const id = `${read.readAt.replace(/[:.]/g, '-')}-${hash}`;
  await mkdir(READS(), { recursive: true });
  await writeFile(path.join(READS(), `${id}.json`), JSON.stringify(read));
  return id;
}

export async function loadRead(
  id: string,
): Promise<{ read: SheetRead; label: string } | null> {
  if (id === CAPTURED_READ) return loadSnapshot('captured');
  // A bare id only: nothing outside the reads folder can be named.
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    const read = JSON.parse(
      await readFile(path.join(READS(), `${id}.json`), 'utf8'),
    ) as SheetRead;
    return { read, label: `Live read through Composio at ${read.readAt}` };
  } catch {
    return null;
  }
}

export async function saveSnapshot(read: SheetRead) {
  await writeFile(CAPTURED, `${JSON.stringify(read, null, 2)}\n`);
  return path.relative(process.cwd(), CAPTURED);
}
