import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  keptReadSchema,
  type DataTab,
  type KeptRead,
} from '@/lib/definitions/records';
import type { OutputSheet } from '@/lib/definitions/apply';
import {
  BRUNCH_ORDERS_ID,
  DATA_TABS,
} from '@/lib/processes/brunch-orders/process';
import {
  addTab,
  missingSheetEnv,
  readTab,
  readWholeSheet,
  sheetReadSchema,
  tabValues,
  writeRange,
  type SheetRead,
} from '@/lib/sheets/composio';

import { readKept, writeKept } from './files';
import { FILE_ID } from './ids';
import { runDataDir } from './run-data';

/*
  Server-only. A run reads the sheet once, and every later step uses that
  read: it is kept here under an id in data/ (gitignored), and the run in the browser
  holds only the id. Only the data tabs are kept.
*/

// Read when used, so a test can work in a scratch directory.
const READS = () => runDataDir(BRUNCH_ORDERS_ID, 'reads');
// The last live read saved in the repository, so tests and the default view
// need no network. Saving one is an explicit action.
const CAPTURED = path.join(
  process.cwd(),
  'fixtures',
  BRUNCH_ORDERS_ID,
  'sheet-snapshot.json',
);

// What a failed request said, as one sentence: the service's own message
// where its error is the JSON it answers with.
function reasonOf(error: string | null): string | null {
  if (!error) return null;
  let said = error;
  try {
    const parsed = JSON.parse(error) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === 'string') said = parsed.error.message;
  } catch {
    // Not JSON: said as it came.
  }
  said = said.trim();
  return /[.!?]$/.test(said) ? said : `${said}.`;
}

async function load(source: 'captured' | 'live') {
  if (source === 'live') {
    const read = await readWholeSheet();
    // A request that failed leaves its tabs empty: kept, that would be a
    // read of an empty sheet, shown as done.
    const failed = read.requests.find((r) => !r.successful);
    if (failed)
      throw new Error(
        `The sheet could not be read: ${reasonOf(failed.error) ?? `${failed.tool} failed`} Nothing was kept: read it again.`,
      );
    return { read, label: `Live read through Composio at ${read.readAt}` };
  }
  const read = await readKept(CAPTURED, sheetReadSchema);
  if (!read)
    throw new Error(
      `${path.relative(process.cwd(), CAPTURED)} is not kept: capture a read first.`,
    );
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
  await writeKept(CAPTURED, read);
  return { file: path.relative(process.cwd(), CAPTURED), readAt: read.readAt };
}

// The data tabs of a read, in the order the process lists them; a tab the
// sheet does not have comes back empty, so a missing tab shows rather than
// vanishing.
function dataTabs(read: SheetRead): DataTab[] {
  return DATA_TABS.map((name) => ({ name, values: tabValues(read, name) }));
}

const asKept = (read: SheetRead, label: string): KeptRead => {
  const tabs = dataTabs(read);
  const hash = createHash('sha256')
    .update(JSON.stringify(tabs))
    .digest('hex')
    .slice(0, 8);
  return {
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
};

export async function readAndKeep(
  source: 'captured' | 'live',
): Promise<KeptRead> {
  const { read, label } = await load(source);
  const kept = asKept(read, label);
  await writeKept(path.join(READS(), `${kept.id}.json`), kept, {
    compact: true,
  });
  return kept;
}

// What a run is told when the read it was taken with is gone from data/.
export const READ_GONE =
  'This run’s data is no longer kept on the server. Start a new run to read the sheet again.';

export async function keptRead(id: string): Promise<KeptRead | null> {
  // A bare id only: nothing outside the reads folder can be named.
  if (!FILE_ID.test(id)) return null;
  return readKept(path.join(READS(), `${id}.json`), keptReadSchema);
}

// Why a run on this read cannot write to the sheet, or null when it can. A
// captured read may not be what the sheet holds now, so it is only for trying.
export function whyNotWritable(read: KeptRead): string | null {
  if (read.source.startsWith('Captured'))
    return 'This run used a captured read. Start a run from a live read to write to the sheet.';
  const missing = missingSheetEnv();
  return missing.length ? `Missing ${missing.join(', ')}.` : null;
}

// The sheet as a write sees it. Not kept: it only proves the run's read still
// holds, and times the checks at the moment of writing.
export const liveSheet: OutputSheet = {
  async readNow() {
    const read = await readWholeSheet();
    const failed = read.requests.find((r) => !r.successful);
    if (failed) throw new Error(failed.error ?? 'The read failed.');
    return asKept(read, `Live read through Composio at ${read.readAt}`);
  },
  readTab,
  addTab,
  writeRange,
};
