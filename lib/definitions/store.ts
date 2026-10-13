import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { z } from 'zod';

import {
  definitionSetSchema,
  revisionIndexSchema,
  RULEBOOK_SCHEMA,
  type DefinitionProcess,
  type DefinitionSet,
  type Revision,
  type RevisionIndex,
} from './types';

/*
  Server-only. A process's rulebooks are kept in the repository, like any
  approved policy, one folder per version of its instructions:

    fixtures/<process>/rulebooks/<version>-<instructions hash>/
      current.json      the rulebook being drafted and reviewed
      <rulebook id>.json each accepted rulebook, a revision, as it was
      revisions.json    each revision's parent and reason, and the head

  The version names the folder for a reader; the hash of the instructions'
  text is what finds it, since a version name is only this browser's. The
  rulebook id is a fingerprint of what was accepted, so a run that pins one
  reads exactly those formulas however the current rulebook changes after.
  Revisions are reached only through the functions below, so a database can
  take the files' place without the engine changing.

  A file that does not fit the schema is an error, never "nothing kept", so a
  draft cannot overwrite it unseen; a save is written beside the file and
  renamed over it, so a crash mid-save leaves the last good version.
*/

export const hashOf = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 12);

// The exact accepted rulebook: any change to what was accepted changes it.
export const fingerprintOf = (set: DefinitionSet) =>
  hashOf(
    JSON.stringify(
      set.definitions
        .filter((d) => d.approvedAt)
        .map((d) => [d.id, d.formula, d.constants, d.groups, d.approvedAt]),
    ),
  );

const CURRENT = 'current.json';

// Read when used, so a test can work in a scratch directory.
const rulebooksOf = (owner: DefinitionProcess) =>
  path.join(process.cwd(), 'fixtures', owner.id, 'rulebooks');

// The folder kept for these instructions, if there is one.
async function folderOf(
  owner: DefinitionProcess,
  hash: string,
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(rulebooksOf(owner));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const found = entries.find((entry) => entry.endsWith(`-${hash}`));
  return found ? path.join(rulebooksOf(owner), found) : null;
}

export class StoredSetError extends Error {}

async function readSet(file: string): Promise<DefinitionSet | null> {
  return readThrough(file, definitionSetSchema);
}

async function readThrough<T>(
  file: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const where = path.relative(process.cwd(), file);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new StoredSetError(`${where} is not valid JSON.`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new StoredSetError(
      `${where} does not fit the stored shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}.`,
    );
  return parsed.data;
}

async function writeWhole(file: string, content: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(content, null, 2)}\n`);
  await rename(temporary, file);
}

// The rulebook being drafted and reviewed for these instructions.
export async function loadSet(
  owner: DefinitionProcess,
  text: string,
): Promise<DefinitionSet | null> {
  const folder = await folderOf(owner, hashOf(text));
  return folder ? readSet(path.join(folder, CURRENT)) : null;
}

export async function saveSet(
  owner: DefinitionProcess,
  set: DefinitionSet,
): Promise<DefinitionSet> {
  const folder =
    (await folderOf(owner, set.hash)) ??
    path.join(rulebooksOf(owner), `${set.version}-${set.hash}`);
  await writeWhole(path.join(folder, CURRENT), set);
  return set;
}

// Reads the kept set fresh, changes it, and saves it; null when none is kept.
export async function updateSet(
  owner: DefinitionProcess,
  text: string,
  change: (set: DefinitionSet) => DefinitionSet,
): Promise<DefinitionSet | null> {
  const set = await loadSet(owner, text);
  return set ? saveSet(owner, change(set)) : null;
}

const INDEX = 'revisions.json';
const EMPTY: RevisionIndex = { head: null, revisions: [] };

const folderFor = async (owner: DefinitionProcess, set: DefinitionSet) =>
  (await folderOf(owner, set.hash)) ??
  path.join(rulebooksOf(owner), `${set.version}-${set.hash}`);

const indexIn = async (folder: string) =>
  (await readThrough(path.join(folder, INDEX), revisionIndexSchema)) ?? EMPTY;

/*
  Keeps an accepted rulebook as a revision and makes it the head. A revision
  already kept is left as it is, head included: a run going back to the one
  it pinned does not make it current again. Returns its id.
*/
export async function putRevision(
  owner: DefinitionProcess,
  set: DefinitionSet,
  {
    reason,
    parent,
    note = null,
  }: {
    reason: Revision['reason'];
    parent?: string | null;
    note?: string | null;
  },
): Promise<string> {
  const id = fingerprintOf(set);
  const folder = await folderFor(owner, set);
  const index = await indexIn(folder);
  const file = path.join(folder, `${id}.json`);
  if (!(await readSet(file))) await writeWhole(file, set);
  if (index.revisions.some((r) => r.id === id)) return id;
  await writeWhole(path.join(folder, INDEX), {
    head: id,
    revisions: [
      ...index.revisions,
      {
        id,
        parent: parent === undefined ? index.head : parent,
        reason,
        at: new Date().toISOString(),
        schemaVersion: RULEBOOK_SCHEMA,
        note,
      },
    ],
  } satisfies RevisionIndex);
  return id;
}

// A revision a run pinned, or null when it is not kept.
export async function loadRevision(
  owner: DefinitionProcess,
  text: string,
  id: string,
): Promise<DefinitionSet | null> {
  if (!/^[0-9a-f]{12}$/.test(id)) return null;
  const folder = await folderOf(owner, hashOf(text));
  return folder ? readSet(path.join(folder, `${id}.json`)) : null;
}

// Every revision for these instructions, newest first, and the head.
export async function listRevisions(
  owner: DefinitionProcess,
  text: string,
): Promise<RevisionIndex> {
  const folder = await folderOf(owner, hashOf(text));
  const index = folder ? await indexIn(folder) : EMPTY;
  return { ...index, revisions: [...index.revisions].reverse() };
}

export const headOf = async (owner: DefinitionProcess, text: string) =>
  (await listRevisions(owner, text)).head;
