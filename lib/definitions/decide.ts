import { review, settingOf } from './checks';
import { recordsOf, type KeptRead } from './records';
import { loadSet, updateSet } from './store';
import type { DefinitionProcess, DefinitionSet } from './types';

/*
  A person's decisions. Confirming the intent is a timestamp. Denying a
  definition keeps what they said was wrong, for the model when it writes
  again. Accepting reruns the whole review on the version kept, against the
  read its examples were run on: the same checks writing applies, so a
  version that predates a check, or a file edited by hand, is refused with
  the reason rather than accepted.
*/

export const confirmIntent = (owner: DefinitionProcess, text: string) =>
  updateSet(owner, text, (s) => ({
    ...s,
    intentConfirmedAt: new Date().toISOString(),
  }));

export async function deny(
  owner: DefinitionProcess,
  text: string,
  id: string,
  note: string | undefined,
): Promise<DefinitionSet | null> {
  return updateSet(owner, text, (s) => ({
    ...s,
    definitions: s.definitions.map((d) =>
      d.id === id
        ? {
            ...d,
            approvedAt: null,
            deniedAt: new Date().toISOString(),
            denial: note?.trim() || null,
          }
        : d,
    ),
  }));
}

export async function accept(
  owner: DefinitionProcess,
  text: string,
  id: string,
  readOf: (id: string) => Promise<KeptRead | null>,
): Promise<DefinitionSet | null> {
  const set = await loadSet(owner, text);
  const definition = set?.definitions.find((d) => d.id === id);
  if (!set || !definition) return null;
  const read = set.readId ? await readOf(set.readId) : null;
  const refuse = (problem: string) =>
    updateSet(owner, text, (s) => ({
      ...s,
      definitions: s.definitions.map((d) =>
        d.id === id ? { ...d, approvedAt: null, problem } : d,
      ),
    }));
  if (!definition.formula)
    return refuse('Nothing is written to accept yet: write it first.');
  if (!read)
    return refuse(
      'The read its examples were run on is no longer kept: write it again on a new read.',
    );
  if (recordsOf(read, owner.subject.data).problems.length)
    return refuse(
      'The read its examples were run on does not fit what this process reads: fix the sheet, read it again, and write it again.',
    );
  const { problems, ran } = review(
    settingOf(owner, text, set, read, definition),
    {
      formula: definition.formula,
      constants: definition.constants,
      groups: definition.groups,
      examples: definition.examples,
    },
  );
  if (!ran || problems.length)
    return updateSet(owner, text, (s) => ({
      ...s,
      definitions: s.definitions.map((d) =>
        d.id === id
          ? {
              ...d,
              approvedAt: null,
              ...(ran ? { examples: ran.examples, uses: ran.uses } : {}),
              problem: ran?.problem ?? `Not accepted: ${problems.join(' ')}`,
            }
          : d,
      ),
    }));
  return updateSet(owner, text, (s) => ({
    ...s,
    definitions: s.definitions.map((d) =>
      d.id === id
        ? {
            ...d,
            examples: ran.examples,
            uses: ran.uses,
            problem: null,
            approvedAt: new Date().toISOString(),
            deniedAt: null,
            denial: null,
          }
        : d,
    ),
  }));
}
