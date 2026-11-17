import 'server-only';

import { staleness, type Stale } from '@/lib/engine/fits';
import { noRules } from '@/lib/engine/fingerprint';
import type { KeptRead } from '@/lib/engine/records';
import type { DefinitionProcess, DefinitionSet } from '@/lib/engine/types';
import type { RunProcess } from '@/server/operations/kept-processes';
import { loadRevision, loadSet, ownerFor } from '@/server/storage/rulebooks';

/*
  What a run of a process works under. Evaluated by `rules`: the accepted
  rulebook the run calculated on, or the current one, and whether it still
  fits the read. By `model`: no rulebook, so nothing can go stale.
*/
export async function rulebookFor(
  { summary, runs }: RunProcess,
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
  const { definitions, evaluation } = runs;
  if (evaluation === 'model') {
    const set = noRules(text);
    return {
      owner: definitions,
      set,
      current: set,
      pinned: false,
      stale: null,
      published: summary.instructions.text,
    };
  }
  const current = await loadSet(definitions, text);
  if (!current) throw new Error('No rules are kept for these instructions.');
  const revision = rulebook
    ? await loadRevision(definitions, text, rulebook)
    : null;
  const set = revision ?? current;
  // The read is held to the data profile the rules were drafted on, if any.
  const owner = await ownerFor(definitions, set);
  return {
    owner,
    set,
    current,
    pinned: revision !== null,
    // A rulebook kept as it was accepted may no longer fit the data.
    stale: staleness(owner, text, set, current, read),
    published: summary.instructions.text,
  };
}
