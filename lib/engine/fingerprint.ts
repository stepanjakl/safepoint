import { createHash } from 'node:crypto';

import type { DataProfile, DefinitionSet } from './types';

/*
  What names a rulebook, an instructions text or a data profile: hashes of
  their content, so two of the same content have the same name wherever they
  are kept (server/storage/rules/rulebooks.ts).
*/

export const hashOf = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 12);

// The exact accepted rulebook: any change to what was accepted changes it,
// and so does the data profile it reads on and the records it was accepted
// on, since both change what a run's checks say; a rulebook with neither
// keeps its old id.
export const fingerprintOf = (set: DefinitionSet) => {
  const accepted = set.definitions
    .filter((d) => d.approvedAt)
    .map((d) => [d.id, d.formula, d.constants, d.groups, d.approvedAt]);
  const reads = {
    ...(set.profileId ? { profile: set.profileId } : {}),
    ...(set.acceptedKeys ? { keys: set.acceptedKeys } : {}),
  };
  return hashOf(
    JSON.stringify(
      Object.keys(reads).length ? { ...reads, accepted } : accepted,
    ),
  );
};

// A data profile's id: any change to it, confirmation included, changes it.
export const profileFingerprint = (profile: Omit<DataProfile, 'id'>) =>
  hashOf(
    JSON.stringify([profile.readId, profile.confirmedAt, profile.columns]),
  );

/*
  The set a process with no rulebook works under: no calculations, no checks.
  A proposal on it is the model's alone, and a person's review its only check.
  Never saved: nothing in it is drafted or approved.
*/
export const noRules = (text: string): DefinitionSet => ({
  hash: hashOf(text),
  version: '',
  intent: '',
  intentConfirmedAt: null,
  readId: null,
  foundAt: '',
  model: '',
  definitions: [],
});
