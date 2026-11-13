import 'server-only';

import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  hashOf,
  fingerprintOf,
  profileFingerprint,
} from '@/lib/definitions/fingerprint';
import { withProfile } from '@/lib/definitions/profile';
import {
  dataProfileSchema,
  definitionSetSchema,
  revisionIndexSchema,
  RULEBOOK_SCHEMA,
  type DataProfile,
  type DefinitionProcess,
  type DefinitionSet,
  type Revision,
  type RevisionIndex,
} from '@/lib/definitions/types';

import { inTurn, readKept, StoredFileError, writeKept } from './files';

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

// Kept under its old name for what catches it.
export const StoredSetError = StoredFileError;

const readSet = (file: string) => readKept(file, definitionSetSchema);

// The rulebook being drafted and reviewed for these instructions.
export async function loadSet(
  owner: DefinitionProcess,
  text: string,
): Promise<DefinitionSet | null> {
  const folder = await folderOf(owner, hashOf(text));
  return folder ? readSet(path.join(folder, CURRENT)) : null;
}

/*
  Saves and updates of one rulebook take turns within this process, so an
  update reads what the one before it saved rather than both reading the same
  set and the later save dropping the other's change. Other rulebooks do not
  wait. Nothing run in a turn may save or update the same rulebook.
*/
const inTurnFor = <T>(
  owner: DefinitionProcess,
  hash: string,
  task: () => Promise<T>,
) => inTurn(path.join(rulebooksOf(owner), hash), task);

async function writeSet(owner: DefinitionProcess, set: DefinitionSet) {
  const folder =
    (await folderOf(owner, set.hash)) ??
    path.join(rulebooksOf(owner), `${set.version}-${set.hash}`);
  await writeKept(path.join(folder, CURRENT), set);
  return set;
}

export const saveSet = (owner: DefinitionProcess, set: DefinitionSet) =>
  inTurnFor(owner, set.hash, () => writeSet(owner, set));

// Reads the kept set fresh, changes it, and saves it; null when none is kept.
export const updateSet = (
  owner: DefinitionProcess,
  text: string,
  change: (set: DefinitionSet) => DefinitionSet,
): Promise<DefinitionSet | null> =>
  inTurnFor(owner, hashOf(text), async () => {
    const set = await loadSet(owner, text);
    return set ? writeSet(owner, change(set)) : null;
  });

const INDEX = 'revisions.json';
const EMPTY: RevisionIndex = { head: null, revisions: [] };

const folderFor = async (owner: DefinitionProcess, set: DefinitionSet) =>
  (await folderOf(owner, set.hash)) ??
  path.join(rulebooksOf(owner), `${set.version}-${set.hash}`);

const indexIn = async (folder: string) =>
  (await readKept(path.join(folder, INDEX), revisionIndexSchema)) ?? EMPTY;

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
  // The index is read, added to and written, so it takes its turn too.
  return inTurnFor(owner, set.hash, async () => {
    const id = fingerprintOf(set);
    const folder = await folderFor(owner, set);
    const index = await indexIn(folder);
    const file = path.join(folder, `${id}.json`);
    if (!(await readSet(file))) await writeKept(file, set);
    if (index.revisions.some((r) => r.id === id)) return id;
    await writeKept(path.join(folder, INDEX), {
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
  });
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

/*
  A process's data profile is reviewed in git like its rulebooks, one folder
  for the source it reads:

    fixtures/<process>/profile/
      current.json   the profile under review, or the one last confirmed
      <profile id>.json each confirmed profile, as it was confirmed

  A confirmed profile is written once and never again: a rulebook names the
  one it was drafted on, and reads exactly that.
*/
const profileFolderOf = (owner: DefinitionProcess) =>
  path.join(process.cwd(), 'fixtures', owner.id, 'profile');

// A profile whose id is not its content was edited by hand or half-written.
function sound(profile: DataProfile | null, where: string) {
  if (profile && profile.id !== profileFingerprint(profile))
    throw new StoredSetError(
      `${where} does not match its id: it was changed after it was made.`,
    );
  return profile;
}

export async function loadProfile(
  owner: DefinitionProcess,
): Promise<DataProfile | null> {
  const file = path.join(profileFolderOf(owner), CURRENT);
  return sound(
    await readKept(file, dataProfileSchema),
    path.relative(process.cwd(), file),
  );
}

// Keeps a profile as the one under review; a confirmed one is kept as
// confirmed too (`putProfile`).
export async function saveProfile(
  owner: DefinitionProcess,
  profile: DataProfile,
): Promise<DataProfile> {
  sound(profile, 'The profile');
  if (profile.confirmedAt) await putProfile(owner, profile);
  await writeKept(path.join(profileFolderOf(owner), CURRENT), profile);
  return profile;
}

// Keeps a confirmed profile under its id, once; returns the id.
export async function putProfile(
  owner: DefinitionProcess,
  profile: DataProfile,
): Promise<string> {
  sound(profile, 'The profile');
  if (!profile.confirmedAt)
    throw new Error('Only a confirmed data profile is kept as confirmed.');
  const file = path.join(profileFolderOf(owner), `${profile.id}.json`);
  if (!(await readKept(file, dataProfileSchema)))
    await writeKept(file, profile);
  return profile.id;
}

// A confirmed profile a rulebook names, or null when it is not kept.
export async function loadConfirmedProfile(
  owner: DefinitionProcess,
  id: string,
): Promise<DataProfile | null> {
  if (!/^[0-9a-f]{12}$/.test(id)) return null;
  const file = path.join(profileFolderOf(owner), `${id}.json`);
  const where = path.relative(process.cwd(), file);
  const profile = sound(await readKept(file, dataProfileSchema), where);
  if (profile && (profile.id !== id || !profile.confirmedAt))
    throw new StoredSetError(`${where} is not the confirmed profile ${id}.`);
  return profile;
}

// The process with the confirmed profile a set names loaded, if it names one.
export async function ownerFor(
  owner: DefinitionProcess,
  set: DefinitionSet,
): Promise<DefinitionProcess> {
  if (!set.profileId) return withProfile(owner, null);
  if (owner.subject.data.profile?.id === set.profileId) return owner;
  const profile = await loadConfirmedProfile(owner, set.profileId);
  if (!profile)
    throw new Error(
      `These rules were drafted on data profile ${set.profileId}, which is not kept.`,
    );
  return withProfile(owner, profile);
}

/*
  The process a new draft is written on: the kept profile when a person has
  confirmed it, none when no profile is kept. A profile under review refuses
  the draft, since rules drafted on it would read types nobody confirmed.
*/
export async function ownerToDraft(
  owner: DefinitionProcess,
): Promise<DefinitionProcess> {
  const profile = await loadProfile(owner);
  if (!profile) return withProfile(owner, null);
  if (!profile.confirmedAt)
    throw new Error(
      'The data profile has changes nobody has confirmed: confirm it before drafting.',
    );
  return withProfile(owner, profile);
}
