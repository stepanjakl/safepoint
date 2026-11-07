import { z } from 'zod';

import { staleness, type Stale } from '@/lib/definitions/fits';
import type { KeptRead } from '@/lib/definitions/records';
import { loadRevision, loadSet, noRules } from '@/lib/definitions/store';
import type { DefinitionProcess, DefinitionSet } from '@/lib/definitions/types';

import {
  BRUNCH_ORDERS_DEFINITIONS,
  BRUNCH_ORDERS_DIRECT_DEFINITIONS,
  brunchOrdersDirectProcess,
  brunchOrdersProcess,
} from './process';

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
  stale: Stale | null;
  // The instructions a run must answer to for its write to reach the sheet.
  published: string;
}> {
  if (evaluation === 'model')
    return {
      owner: BRUNCH_ORDERS_DIRECT_DEFINITIONS,
      set: noRules(text),
      stale: null,
      published: brunchOrdersDirectProcess.instructions.text,
    };
  const owner = BRUNCH_ORDERS_DEFINITIONS;
  const current = await loadSet(owner, text);
  if (!current) throw new Error('No rules are kept for these instructions.');
  const set =
    (rulebook ? await loadRevision(owner, text, rulebook) : null) ?? current;
  return {
    owner,
    set,
    // A rulebook kept as it was accepted may no longer fit the data.
    stale: staleness(owner, text, set, current, read),
    published: brunchOrdersProcess.instructions.text,
  };
}
