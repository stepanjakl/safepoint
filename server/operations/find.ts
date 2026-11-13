import { foundDefinitions, type Asking } from '@/lib/definitions/find';
import type { KeptRead } from '@/lib/definitions/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/definitions/types';
import { saveSet } from '@/server/storage/rulebooks';

/*
  Server-only. Finding, kept: the engine reads the instructions
  (lib/definitions/find.ts) and what it finds is saved as the rulebook for
  them.
*/

// Replaces any set kept for these instructions, approvals and all.
export async function findDefinitions(
  owner: DefinitionProcess,
  text: string,
  version: string,
  read: KeptRead | null,
  asking: Asking = {},
): Promise<DefinitionSet> {
  return saveSet(
    owner,
    await foundDefinitions(owner, text, version, read, asking),
  );
}
