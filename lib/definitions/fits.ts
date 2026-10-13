import { scopeOf, settingOf } from './checks';
import { checkFormula } from './formulas';
import type { KeptRead } from './records';
import { fingerprintOf } from './store';
import { complete, type DefinitionProcess, type DefinitionSet } from './types';

export type Misfit = { id: string; name: string; problem: string };

/*
  Whether an accepted rulebook still fits a read: each accepted formula is
  type-checked against the read's columns as Accept checks it, without the
  examples. A revision is kept as it was accepted, so a column whose type
  changed since (text read as yes or no, say) is found here, on use, rather
  than read wrongly in silence. Empty when it fits.
*/
export function fitsRead(
  owner: DefinitionProcess,
  text: string,
  set: DefinitionSet,
  read: KeptRead,
): Misfit[] {
  return set.definitions.flatMap((definition) => {
    if (!definition.approvedAt || !definition.formula) return [];
    const problem = checkFormula(
      read,
      owner.subject,
      scopeOf(settingOf(owner, text, set, read, definition), definition),
      definition.result,
      definition.formula,
    );
    return problem
      ? [{ id: definition.id, name: definition.name, problem }]
      : [];
  });
}

export type Stale = {
  // The rulebook that no longer fits, and how.
  rulebook: string;
  problems: Misfit[];
  // The current rulebook, when it is another one a run can move to: accepted
  // in full and fitting the read. Null when the rules must be drafted again.
  current: string | null;
};

// Why a run cannot use this rulebook on this read, or null when it can.
export function staleness(
  owner: DefinitionProcess,
  text: string,
  set: DefinitionSet,
  current: DefinitionSet,
  read: KeptRead,
): Stale | null {
  const problems = fitsRead(owner, text, set, read);
  if (!problems.length) return null;
  const movable =
    current !== set &&
    fingerprintOf(current) !== fingerprintOf(set) &&
    complete(current) &&
    !fitsRead(owner, text, current, read).length;
  return {
    rulebook: fingerprintOf(set),
    problems,
    current: movable ? fingerprintOf(current) : null,
  };
}
