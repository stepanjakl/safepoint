import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BRUNCH_PROCESS_ID } from '@/lib/processes/avocado-toast/process';
import { readWholeSheet, type SheetRead } from '@/lib/sheets/composio';

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

export async function saveSnapshot(read: SheetRead) {
  await writeFile(CAPTURED, `${JSON.stringify(read, null, 2)}\n`);
  return path.relative(process.cwd(), CAPTURED);
}
