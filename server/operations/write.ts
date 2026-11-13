import type { Asking } from '@/lib/definitions/find';
import { settingOf, type Setting } from '@/lib/definitions/checks';
import { fitting, type KeptRead } from '@/lib/definitions/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/definitions/types';
import {
  keeping,
  writeOnce,
  writeUntilAgreed,
  type WriteRuns,
  type Written,
} from '@/lib/definitions/write';
import type { Agreement } from '@/lib/definitions/types';
import { loadSet, ownerFor, updateSet } from '@/server/storage/rulebooks';

/*
  Server-only. Writing a definition, kept: the engine writes it
  (lib/definitions/write.ts) on the rulebook as it is kept now, and what it
  comes to is saved onto that rulebook, taking its turn with any other update
  of it.
*/

const settingFor = async (
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
) => {
  const set = await loadSet(owner, text);
  // The read is held to the profile the set was drafted on, if it names one.
  const reading = set ? await ownerFor(owner, set) : owner;
  fitting(read, reading.subject.data);
  const definition = set?.definitions.find((d) => d.id === id);
  return set && definition
    ? settingOf(reading, text, set, read, definition)
    : null;
};

// Keeps a write, or says why there is nothing to keep.
const keep = (
  setting: Setting,
  written: Written,
  agreement: Agreement | null,
  note: string | null = null,
) =>
  updateSet(
    setting.owner,
    setting.text,
    keeping(setting, written, agreement, note),
  );

// One write, kept as it stands.
export async function writeDefinition(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
  asking: Asking = {},
): Promise<DefinitionSet | null> {
  const setting = await settingFor(owner, text, read, id);
  if (!setting) return null;
  return keep(setting, await writeOnce(setting, asking), null);
}

// Writes a definition until two writes agree, and keeps what that comes to.
export async function writeAgreed(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
  options: Asking & WriteRuns = {},
): Promise<DefinitionSet | null> {
  const setting = await settingFor(owner, text, read, id);
  if (!setting) return null;
  const { written, agreement, note } = await writeUntilAgreed(setting, options);
  return keep(setting, written, agreement, note);
}
