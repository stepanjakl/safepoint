import 'server-only';

import { z } from 'zod';

import { staleness, type Stale } from '@/lib/definitions/fits';
import { noRules } from '@/lib/definitions/fingerprint';
import type { KeptRead } from '@/lib/definitions/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/definitions/types';
import {
  BRUNCH_ORDERS_DEFINITIONS,
  BRUNCH_ORDERS_DIRECT_DEFINITIONS,
  brunchOrdersDirectProcess,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import { loadRevision, loadSet, ownerFor } from '@/server/storage/rulebooks';

// Which of the two Brunch orders processes a request is for.
export const evaluationSchema = z.enum(['rules', 'model']).default('rules');

/*
  What a Propose or Apply request works under. `rules`: the accepted rulebook
  the run calculated on, or the current one, and whether it still fits the
  read. `model`: no rulebook, so nothing can go stale.
*/
export async function rulebookFor(
  evaluation: z.infer<typeof evaluationSchema>,
  text: string,
  rulebook: string | undefined,
  read: KeptRead,
): Promise<{
  owner: DefinitionProcess;
  set: DefinitionSet;
  // The rulebook current for these instructions, which `set` is unless the
  // run pinned another; and whether `set` is the pinned revision, kept as it
  // was accepted. With `model` there are no rules: current is the set it
  // works under, and nothing is pinned.
  current: DefinitionSet;
  pinned: boolean;
  stale: Stale | null;
  // The instructions a run must answer to for its write to reach the sheet.
  published: string;
}> {
  if (evaluation === 'model') {
    const set = noRules(text);
    return {
      owner: BRUNCH_ORDERS_DIRECT_DEFINITIONS,
      set,
      current: set,
      pinned: false,
      stale: null,
      published: brunchOrdersDirectProcess.instructions.text,
    };
  }
  const current = await loadSet(BRUNCH_ORDERS_DEFINITIONS, text);
  if (!current) throw new Error('No rules are kept for these instructions.');
  const revision = rulebook
    ? await loadRevision(BRUNCH_ORDERS_DEFINITIONS, text, rulebook)
    : null;
  const set = revision ?? current;
  // The read is held to the data profile the rules were drafted on, if any.
  const owner = await ownerFor(BRUNCH_ORDERS_DEFINITIONS, set);
  return {
    owner,
    set,
    current,
    pinned: revision !== null,
    // A rulebook kept as it was accepted may no longer fit the data.
    stale: staleness(owner, text, set, current, read),
    published: brunchOrdersProcess.instructions.text,
  };
}
