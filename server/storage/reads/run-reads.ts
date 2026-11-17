import 'server-only';

import { createHash } from 'node:crypto';
import path from 'node:path';

import { and, eq } from 'drizzle-orm';

import {
  keptReadSchema,
  type DataTab,
  type KeptRead,
} from '@/lib/engine/records';
import type { OutputSheet } from '@/lib/engine/apply';
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

import { database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { reads } from '@/server/db/schema';
import {
  keptProcesses,
  rulebookProcess,
  type RunReads,
} from '@/server/operations/kept-processes';

import { readKept, writeKept } from '@/server/storage/files';
import { FILE_ID } from '@/server/storage/ids';
import { parseStored } from '@/server/storage/stored';

/*
  Server-only. A run reads the sheet once, and every later step uses that
  read: it is kept here under an id in the `reads` table, and the run in the
  browser holds only the id. Only the data tabs are kept. Every function here
  is given the process's `RunReads` (what it declares: where its reads are
  kept, which tabs, and the captured copy), from the registry.
*/

/*
  The process whose reads a process's are kept under: the one place that says
  whose reads a process works on (a direct process proposes on the reads kept
  under the rulebook one). keptRead and keep use it, and so do the rows made
  on a read (proposals, cross-checks, parts), as their `read_process`, so the
  two cannot disagree. An id no process keeps, as an old file's folder, is
  read as the rulebook process's, as it always was.
*/
export function readProcessOf(owner: { id: string }): string {
  const kept = keptProcesses().find(
    (entry) => entry.runs?.definitions.id === owner.id,
  );
  return (kept?.runs ?? rulebookProcess().runs).reads.process;
}

// The last live read saved in the repository, so tests and the default view
// need no network. Saving one is an explicit action. Not traced by itself:
// next.config.ts includes the files where they are read.
const capturedPath = (of: RunReads) =>
  path.join(/*turbopackIgnore: true*/ process.cwd(), of.captured);

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

async function load(of: RunReads, source: 'captured' | 'live') {
  const captured = capturedPath(of);
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
  const read = await readKept(captured, sheetReadSchema);
  if (!read)
    throw new Error(
      `${path.relative(process.cwd(), captured)} is not kept: capture a read first.`,
    );
  return {
    read,
    label: `Captured read from ${read.readAt} (${of.captured})`,
  };
}

// Saves a live read as the captured one; refused if any request failed.
export async function captureRead(
  of: RunReads,
): Promise<{ file: string; readAt: string }> {
  const read = await readWholeSheet();
  if (!read.requests.every((r) => r.successful))
    throw new Error('The read failed; nothing was saved.');
  const captured = capturedPath(of);
  await writeKept(captured, read);
  return { file: path.relative(process.cwd(), captured), readAt: read.readAt };
}

// The data tabs of a read, in the order the process lists them; a tab the
// sheet does not have comes back empty, so a missing tab shows rather than
// vanishing.
function dataTabs(of: RunReads, read: SheetRead): DataTab[] {
  return of.tabs.map((name) => ({ name, values: tabValues(read, name) }));
}

const asKept = (of: RunReads, read: SheetRead, label: string): KeptRead => {
  const tabs = dataTabs(of, read);
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

// Written once: an id is the time read and a hash of what was read, so a
// second keep of it is the same read and leaves the first as it was.
async function keep(of: RunReads, read: KeptRead): Promise<KeptRead> {
  const body = keptReadSchema.parse(read);
  const db = await database();
  await ensureProcess(db, of.process);
  const inserted = await db
    .insert(reads)
    .values({
      process: of.process,
      id: body.id,
      readAt: new Date(body.readAt),
      source: body.source,
      body,
    })
    .onConflictDoNothing()
    .returning({ id: reads.id });
  // Already kept: what is kept is what the id names.
  return inserted.length ? body : ((await keptRead(of, body.id)) ?? body);
}

export async function readAndKeep(
  of: RunReads,
  source: 'captured' | 'live',
): Promise<KeptRead> {
  const { read, label } = await load(of, source);
  return keep(of, asKept(of, read, label));
}

// What a run is told when the read it was taken with is no longer kept.
export const READ_GONE =
  'This run’s data is no longer kept on the server. Start a new run to read the sheet again.';

export async function keptRead(
  of: RunReads,
  id: string,
): Promise<KeptRead | null> {
  // A bare id only, as when it named a file.
  if (!FILE_ID.test(id)) return null;
  const [row] = await (
    await database()
  )
    .select({ body: reads.body })
    .from(reads)
    .where(and(eq(reads.process, of.process), eq(reads.id, id)));
  return row
    ? parseStored(row.body, keptReadSchema, `The kept read ${of.process}/${id}`)
    : null;
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
export const liveSheetOf = (of: RunReads): OutputSheet => ({
  async readNow() {
    const read = await readWholeSheet();
    const failed = read.requests.find((r) => !r.successful);
    if (failed) throw new Error(failed.error ?? 'The read failed.');
    return asKept(of, read, `Live read through Composio at ${read.readAt}`);
  },
  readTab,
  addTab,
  writeRange,
});
