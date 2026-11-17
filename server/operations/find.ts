import 'server-only';

import { foundDefinitions, type Asking } from '@/lib/engine/find';
import type { KeptRead } from '@/lib/engine/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/engine/types';
import { saveSet } from '@/server/storage/rules/rulebooks';

/*
  Server-only. Finding, kept: the engine reads the instructions
  (lib/engine/find.ts) and what it finds is saved as the rulebook for
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
