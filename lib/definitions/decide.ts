import {
  dependentsOf,
  differencesBetween,
  review,
  settingOf,
  type Draft,
} from './checks';
import { recordsOf, sourceOf, type KeptRead } from './records';
import {
  formulaOf,
  sameShape,
  shapeProblems,
  unansweredBlanks,
  type Shape,
  type ShapeContext,
} from './shapes';
import { ownerFor, withProfile } from './profile';
import { loadSet, putRevision, saveSet, updateSet } from './store';
import {
  BLANKS_UNANSWERED,
  complete,
  type AppliesTo,
  type DataProfile,
  type Definition,
  type DefinitionProcess,
  type DefinitionSet,
  type WrittenVersion,
} from './types';

/*
  A person's decisions. Confirming the intent is a timestamp. Denying a
  definition keeps what they said was wrong, for the model when it writes
  again. Accepting reruns the whole review on the version kept, against the
  read its examples were run on: the same checks writing applies, so a
  version that predates a check, or a file edited by hand, is refused with
  the reason rather than accepted. The decision that completes the rulebook
  keeps it as a revision (store.ts), with the keys of the records of the read it
  was reviewed on. Where writes disagreed, a person chooses a
  version before it can be accepted.
*/

// The records of the read a rulebook was reviewed on, as its profile reads
// them; null when that read is gone or does not fit, so nothing is said of
// which records it has seen.
async function keysOn(
  owner: DefinitionProcess,
  set: DefinitionSet,
  readOf: (id: string) => Promise<KeptRead | null>,
): Promise<string[] | null> {
  const read = set.readId ? await readOf(set.readId) : null;
  if (!read) return null;
  const records = recordsOf(read, (await ownerFor(owner, set)).subject.data);
  return records.problems.length ? null : [...records.keys].sort();
}

// Once a rulebook is complete it is kept as a revision with the records it
// was accepted on, so a record the data gains later can be told from them.
async function freezing(
  owner: DefinitionProcess,
  saved: Promise<DefinitionSet | null>,
  readOf: (id: string) => Promise<KeptRead | null>,
): Promise<DefinitionSet | null> {
  let set = await saved;
  if (set && complete(set)) {
    const acceptedKeys = (await keysOn(owner, set, readOf)) ?? undefined;
    set = await saveSet(owner, { ...set, acceptedKeys });
    await putRevision(owner, set, { reason: 'accepted' });
  }
  return set;
}

export const confirmIntent = (
  owner: DefinitionProcess,
  text: string,
  readOf: (id: string) => Promise<KeptRead | null>,
) =>
  freezing(
    owner,
    updateSet(owner, text, (s) => ({
      ...s,
      intentConfirmedAt: new Date().toISOString(),
    })),
    readOf,
  );

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

// Takes one of the versions a split left, on the person's word. Anything reading
// this definition has to be looked at again, as after any other new version.
export const choose = (
  owner: DefinitionProcess,
  text: string,
  id: string,
  index: number,
) =>
  updateSet(owner, text, (s) => {
    const dependents = dependentsOf(s, id);
    return {
      ...s,
      definitions: s.definitions.map((d) => {
        const version = d.id === id ? d.agreement?.versions[index] : null;
        if (d.id === id && version)
          return {
            ...d,
            // The shape goes with the formula: the sentence is written from it.
            shape: version.shape ?? null,
            unfit: version.unfit ?? null,
            formula: version.formula,
            constants: version.constants,
            groups: version.groups,
            uses: version.uses,
            examples: version.examples,
            model: version.model,
            problem: null,
            approvedAt: null,
            agreement: { ...d.agreement!, status: 'chosen' as const },
          };
        return dependents.has(d.id) ? { ...d, approvedAt: null } : d;
      }),
    };
  });

/*
  A person's correction of how finding read a check: for every record, or only
  for some. The shape written is held to this reading (checks.ts), so where
  finding read the words wrongly no write could ever satisfy it. The label
  changes on the rulebook under review, what was accepted of it and of what
  reads it is withdrawn, and the version kept is reviewed again so its problem
  says what the new reading makes of it. The rule is then written again as
  before; a revision is never touched.
*/
export async function setAppliesTo(
  owner: DefinitionProcess,
  text: string,
  id: string,
  value: AppliesTo,
  readOf: (id: string) => Promise<KeptRead | null>,
): Promise<DefinitionSet | null> {
  const set = await loadSet(owner, text);
  const definition = set?.definitions.find((d) => d.id === id);
  if (!set || !definition) return null;
  if (definition.result !== 'check') return set;
  owner = await ownerFor(owner, set);
  const read = set.readId ? await readOf(set.readId) : null;
  const dependents = dependentsOf(set, id);
  return updateSet(owner, text, (s) => {
    const relabelled: DefinitionSet = {
      ...s,
      definitions: s.definitions.map((d) =>
        d.id === id ? { ...d, appliesTo: value } : d,
      ),
    };
    const next = relabelled.definitions.find((d) => d.id === id)!;
    // A rule with nothing written has nothing to review yet.
    const reviewed =
      read && next.formula
        ? review(settingOf(owner, text, relabelled, read, next), {
            formula: next.formula,
            shape: next.shape,
            constants: next.constants,
            groups: next.groups,
            examples: next.examples,
          })
        : null;
    return {
      ...relabelled,
      definitions: relabelled.definitions.map((d) => {
        if (d.id !== id)
          return dependents.has(d.id) ? { ...d, approvedAt: null } : d;
        const { ran, problems } = reviewed ?? { ran: null, problems: [] };
        return {
          ...d,
          approvedAt: null,
          ...(ran ? { examples: ran.examples, uses: ran.uses } : {}),
          problem: !d.formula
            ? d.problem
            : !reviewed
              ? 'The read its examples were run on is no longer kept: write it again on a new read.'
              : (ran?.problem ?? (problems.length ? problems.join(' ') : null)),
        };
      }),
    };
  });
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
  // Accepted against the data profile it was drafted on, if it names one.
  owner = await ownerFor(owner, set);
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
  if (definition.agreement?.status === 'split')
    return refuse(
      'The versions written disagree: choose one before accepting it.',
    );
  if (!read)
    return refuse(
      'The read its examples were run on is no longer kept: write it again on a new read.',
    );
  if (recordsOf(read, owner.subject.data).problems.length)
    return refuse(
      `The read its examples were run on does not fit what this process reads: fix the ${sourceOf(owner.subject.data).noun}, read it again, and write it again.`,
    );
  // The sentence a person approved is written from the shape: the formula
  // kept must be the one that shape gives.
  if (definition.shape) {
    const context: ShapeContext = {
      subject: owner.subject,
      records: recordsOf(read, owner.subject.data),
      read,
      consequence: definition.consequence,
      constants: definition.constants,
      groups: definition.groups,
      earlier: set.definitions.slice(0, set.definitions.indexOf(definition)),
    };
    const unsaid = shapeProblems(definition.shape, context);
    if (unsaid.length)
      return refuse(
        `The rule as written no longer reads on this data (${unsaid.join(' ')}): write it again.`,
      );
    let written: string | null;
    try {
      written = formulaOf(definition.shape, context);
    } catch {
      written = null;
    }
    if (written !== definition.formula)
      return refuse(
        'The formula kept is not the one the rule as written gives: write it again.',
      );
    // What a blank means is the data's to say, once, not this rule's.
    const open = unansweredBlanks(definition.shape, context);
    if (open.length)
      return refuse(
        `${BLANKS_UNANSWERED}: ${open.map((c) => `the ${c.label}`).join(', ')}. Does a rule reading one not apply, or fail?`,
      );
  }
  const { problems, ran } = review(
    settingOf(owner, text, set, read, definition),
    {
      formula: definition.formula,
      shape: definition.shape,
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
  const accepted = updateSet(owner, text, (s) => ({
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
  return freezing(owner, accepted, readOf);
}

/*
  Moves the rulebook under review onto a newer confirmed data profile, as
  answering a blank or correcting a type makes one. Each check written as a
  shape that leaves blanks to the profile is written again from its shape,
  in every version too; every definition is reviewed again on this read.
  What changed, or no longer passes, is accepted again, with what reads it.
  Versions that now behave alike agree, and ones that now differ split. A
  revision is never touched: it keeps the profile it was accepted on.
*/
export async function rebaseSet(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  profile: DataProfile,
): Promise<DefinitionSet | null> {
  if (!profile.confirmedAt)
    throw new Error('Only a confirmed data profile can be drafted on.');
  const set = await loadSet(owner, text);
  if (!set) return null;
  const profiled = withProfile(owner, profile);
  const records = recordsOf(read, profiled.subject.data);
  if (records.problems.length)
    throw new Error(
      `The read does not fit the data profile: ${records.problems.slice(0, 3).join(' ')}`,
    );
  const definitions: Definition[] = [];
  const unapproved = new Set<string>();
  for (const definition of set.definitions) {
    const earlier = [...definitions];
    const contextOf = (
      written: Pick<Definition, 'constants' | 'groups'>,
    ): ShapeContext => ({
      subject: profiled.subject,
      records,
      read,
      consequence: definition.consequence,
      constants: written.constants,
      groups: written.groups,
      earlier,
    });
    // Only a shape that leaves blanks to the profile reads differently on it.
    const rewritten = (
      written: Pick<Definition, 'constants' | 'groups' | 'formula'> & {
        shape?: Shape | null;
      },
    ) => {
      const { shape } = written;
      if (!shape || shape.if_blank || !written.formula) return written.formula;
      const context = contextOf(written);
      return shapeProblems(shape, context).length
        ? written.formula
        : formulaOf(shape, context);
    };
    const formula = rewritten(definition);
    const versions = definition.agreement?.versions.map(
      (v): WrittenVersion => ({ ...v, formula: rewritten(v) ?? v.formula }),
    );
    let next: Definition = {
      ...definition,
      formula,
      ...(definition.agreement && versions
        ? { agreement: { ...definition.agreement, versions } }
        : {}),
    };
    const working = {
      ...set,
      profileId: profile.id,
      definitions: [...earlier, next],
    };
    const setting = settingOf(profiled, text, working, read, next);
    if (next.formula) {
      const { problems, ran } = review(setting, {
        formula: next.formula,
        shape: next.shape,
        constants: next.constants,
        groups: next.groups,
        examples: next.examples,
      });
      next = {
        ...next,
        ...(ran ? { examples: ran.examples, uses: ran.uses } : {}),
        problem: ran?.problem ?? (problems.length ? problems.join(' ') : null),
      };
      if (formula !== definition.formula || !ran || problems.length)
        unapproved.add(next.id);
    }
    // Two writes compared again: the same shape behaves the same.
    const agreement = next.agreement;
    if (
      agreement &&
      (agreement.status === 'agreed' || agreement.status === 'split') &&
      agreement.versions.length === 2 &&
      agreement.versions.every((v) => v.formula)
    ) {
      const [a, b] = agreement.versions as [WrittenVersion, WrittenVersion];
      const draftOf = (v: WrittenVersion): Draft => ({
        formula: v.formula,
        shape: v.shape,
        constants: v.constants,
        groups: v.groups,
        examples: v.examples,
      });
      const differences =
        a.shape &&
        b.shape &&
        sameShape(
          { ...contextOf(a), shape: a.shape },
          { ...contextOf(b), shape: b.shape },
        )
          ? []
          : differencesBetween(setting, draftOf(a), draftOf(b));
      const status = differences.length ? 'split' : 'agreed';
      if (status !== agreement.status) unapproved.add(next.id);
      next = { ...next, agreement: { ...agreement, status, differences } };
    }
    definitions.push(next);
  }
  const rebased: DefinitionSet = {
    ...set,
    profileId: profile.id,
    readId: read.id,
    definitions,
  };
  const cleared = new Set(unapproved);
  for (const id of unapproved)
    for (const dependent of dependentsOf(rebased, id)) cleared.add(dependent);
  return saveSet(owner, {
    ...rebased,
    definitions: definitions.map((d) =>
      cleared.has(d.id) ? { ...d, approvedAt: null } : d,
    ),
  });
}
