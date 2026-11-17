import type { Definition, DefinitionSet } from './types';

// What one accepted rulebook changed from the one it came from, by name.
export type RevisionChanges = {
  added: string[];
  removed: string[];
  changed: string[];
};

// What a definition says, without when or by whom it was settled: a rewrite
// that lands on the same rule is not a change.
const meaningOf = (d: Definition) =>
  JSON.stringify([
    d.name,
    d.text,
    d.result,
    d.consequence,
    d.formula,
    d.constants.map((c) => [c.id, c.value]),
    d.groups.map((g) => [g.id, g.keys]),
  ]);

const accepted = (set: DefinitionSet | null) =>
  new Map(
    (set?.definitions ?? [])
      .filter((d) => d.approvedAt)
      .map((d) => [d.id, d] as const),
  );

/*
  Compares the accepted definitions of two rulebooks by id. With no parent,
  everything the revision holds was added.
*/
export function revisionChanges(
  parent: DefinitionSet | null,
  revision: DefinitionSet,
): RevisionChanges {
  const before = accepted(parent);
  const after = accepted(revision);
  return {
    added: [...after.values()]
      .filter((d) => !before.has(d.id))
      .map((d) => d.name),
    removed: [...before.values()]
      .filter((d) => !after.has(d.id))
      .map((d) => d.name),
    changed: [...after.values()]
      .filter((d) => {
        const was = before.get(d.id);
        return was !== undefined && meaningOf(was) !== meaningOf(d);
      })
      .map((d) => d.name),
  };
}
