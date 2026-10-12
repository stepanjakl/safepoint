import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  definitionSetSchema,
  type DefinitionProcess,
  type DefinitionSet,
} from './types';

/*
  Server-only. A process's rulebooks are kept in the repository, like any
  approved policy, one folder per version of its instructions:

    fixtures/<process>/rulebooks/<version>-<instructions hash>/
      current.json      the rulebook being drafted and reviewed
      <rulebook id>.json each accepted rulebook a run calculated on, as it was

  The version names the folder for a reader; the hash of the instructions'
  text is what finds it, since a version name is only this browser's. The
  rulebook id is a fingerprint of what was accepted, so a run that pins one
  reads exactly those formulas however the current rulebook changes after.

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
  const parsed = definitionSetSchema.safeParse(json);
  if (!parsed.success)
    throw new StoredSetError(
      `${where} does not fit the stored shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}.`,
    );
  return parsed.data;
}

async function writeWhole(file: string, set: DefinitionSet) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(set, null, 2)}\n`);
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

/*
  An accepted rulebook, kept as it is when a run first uses it and never
  written again: its name is its content's fingerprint. Returns the id.
*/
export async function keepAccepted(
  owner: DefinitionProcess,
  set: DefinitionSet,
): Promise<string> {
  const id = fingerprintOf(set);
  const folder =
    (await folderOf(owner, set.hash)) ??
    path.join(rulebooksOf(owner), `${set.version}-${set.hash}`);
  const file = path.join(folder, `${id}.json`);
  if (!(await readSet(file))) await writeWhole(file, set);
  return id;
}

// The accepted rulebook a run pinned, or null when it is not kept.
export async function loadAccepted(
  owner: DefinitionProcess,
  text: string,
  id: string,
): Promise<DefinitionSet | null> {
  if (!/^[0-9a-f]{12}$/.test(id)) return null;
  const folder = await folderOf(owner, hashOf(text));
  return folder ? readSet(path.join(folder, `${id}.json`)) : null;
}
