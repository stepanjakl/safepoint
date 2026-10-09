import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DataTab, KeptRead } from '@/lib/definitions/records';
import { readWholeSheet, type SheetRead } from '@/lib/sheets/composio';

import { BRUNCH_ORDERS_ID, DATA_TABS } from './process';

/*
  Server-only. A run reads the sheet once, and every later step uses that
  read: it is kept here under an id (gitignored), and the run in the browser
  holds only the id. Only the data tabs are kept.
*/

const READS = path.join(process.cwd(), '.rulebook-reads', BRUNCH_ORDERS_ID);
// The last live read saved in the repository, so tests and the default view
// need no network. Saving one is an explicit action.
const CAPTURED = path.join(
  process.cwd(),
  'fixtures',
  BRUNCH_ORDERS_ID,
  'sheet-snapshot.json',
);

async function load(source: 'captured' | 'live') {
  if (source === 'live') {
    const read = await readWholeSheet();
    return { read, label: `Live read through Composio at ${read.readAt}` };
  }
  const read = JSON.parse(await readFile(CAPTURED, 'utf8')) as SheetRead;
  return {
    read,
    label: `Captured read from ${read.readAt} (fixtures/${BRUNCH_ORDERS_ID}/sheet-snapshot.json)`,
  };
}

// Saves a live read as the captured one; refused if any request failed.
export async function captureRead(): Promise<{ file: string; readAt: string }> {
  const read = await readWholeSheet();
  if (!read.requests.every((r) => r.successful))
    throw new Error('The read failed; nothing was saved.');
  await mkdir(path.dirname(CAPTURED), { recursive: true });
  await writeFile(CAPTURED, `${JSON.stringify(read, null, 2)}\n`);
  return { file: path.relative(process.cwd(), CAPTURED), readAt: read.readAt };
}

const tabName = (range: string) =>
  range
    .slice(0, range.lastIndexOf('!'))
    .replace(/^'(.*)'$/, '$1')
    .replaceAll("''", "'");

// The data tabs of a read, in the order the process lists them; a tab the
// sheet does not have comes back empty, so a missing tab shows rather than
// vanishing.
function dataTabs(read: SheetRead): DataTab[] {
  return DATA_TABS.map((name) => ({
    name,
    values:
      (read.valueRanges.find((vr) => tabName(vr.range) === name)?.values as
        unknown[][] | undefined) ?? [],
  }));
}

export async function readAndKeep(
  source: 'captured' | 'live',
): Promise<KeptRead> {
  const { read, label } = await load(source);
  const tabs = dataTabs(read);
  const hash = createHash('sha256')
    .update(JSON.stringify(tabs))
    .digest('hex')
    .slice(0, 8);
  const kept: KeptRead = {
    id: `${read.readAt.replace(/[:.]/g, '-')}-${hash}`,
    readAt: read.readAt,
    source: label,
    spreadsheet: {
      title: read.spreadsheet.title ?? null,
      url: read.spreadsheet.url,
      tabIds: read.spreadsheet.tabIds,
    },
    tabs,
  };
  await mkdir(READS, { recursive: true });
  await writeFile(path.join(READS, `${kept.id}.json`), JSON.stringify(kept));
  return kept;
}

export async function keptRead(id: string): Promise<KeptRead | null> {
  // A bare id only: nothing outside the reads folder can be named.
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(
      await readFile(path.join(READS, `${id}.json`), 'utf8'),
    ) as KeptRead;
  } catch {
    return null;
  }
}
