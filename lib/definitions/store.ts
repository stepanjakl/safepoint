import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  definitionSetSchema,
  type DefinitionProcess,
  type DefinitionSet,
} from './types';

/*
  Server-only. A process's definitions are kept per version of its
  instructions (the text's hash), in the repository like any approved policy:
  fixtures/<process>/rules/<hash>.json. A file that does not fit the schema is
  an error, never "nothing kept", so a draft cannot overwrite it unseen; a
  save is written beside the file and renamed over it, so a crash mid-save
  leaves the last good version.
*/

export const hashOf = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 12);

// Read when used, so a test can work in a scratch directory.
const dirOf = (owner: DefinitionProcess) =>
  path.join(process.cwd(), 'fixtures', owner.id, 'rules');
const fileOf = (owner: DefinitionProcess, hash: string) =>
  path.join(dirOf(owner), `${hash}.json`);

export class StoredSetError extends Error {}

export async function loadSet(
  owner: DefinitionProcess,
  text: string,
): Promise<DefinitionSet | null> {
  const file = fileOf(owner, hashOf(text));
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

export async function saveSet(
  owner: DefinitionProcess,
  set: DefinitionSet,
): Promise<DefinitionSet> {
  const file = fileOf(owner, set.hash);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(set, null, 2)}\n`);
  await rename(temporary, file);
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
