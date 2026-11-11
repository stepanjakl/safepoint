import type { DataShape } from '@/lib/process/model';
import { interpretCell, type FieldType } from '@/lib/sheets/field-types';

import type { KeptRead } from './records';
import { loadConfirmedProfile, loadProfile, profileFingerprint } from './store';
import type {
  DataProfile,
  DefinitionProcess,
  DefinitionSet,
  ProfileColumn,
} from './types';

/*
  A data profile: what the engine knows of a source's columns, proposed once
  from a read (`profileOf`), confirmed by a person, then fixed. A read is held
  to it (records.ts) instead of being typed again from its own values, so one
  decimal or one blank column in a week's data cannot change what an accepted
  formula type-checks against.

  Every change returns a new profile with a new id, and with `confirmedAt`
  cleared: a changed profile is under review until a person confirms it again.
  The confirmed one it came from stays kept as it was (store.ts), so a
  rulebook drafted on it reads exactly what it was drafted on.
*/

// A column's declared type: by its path, `<lookup as>.<column>` for a lookup's,
// before its header alone, which a column of that name in any resource shares.
export const declaredType = (
  data: DataShape,
  header: string,
  path: string = header,
): FieldType | undefined => data.types[path] ?? data.types[header];

const blank = (raw: unknown) => raw === undefined || raw === null || raw === '';
const words = (name: string) => name.replaceAll('_', ' ');

// What a column's cells say it is, as little as they all bear out. Only real
// checkboxes are yes/no: "yes" typed as text stays text unless declared.
function inferred(cells: unknown[]): FieldType | null {
  if (!cells.length) return null;
  const all = (type: FieldType) =>
    cells.every((raw) => !interpretCell(raw, type, false).issue);
  if (all({ kind: 'whole_number' })) return { kind: 'whole_number' };
  if (all({ kind: 'decimal' })) return { kind: 'decimal' };
  if (cells.every((raw) => typeof raw === 'boolean')) return { kind: 'yes_no' };
  return { kind: 'text' };
}

const withId = (profile: Omit<DataProfile, 'id'>): DataProfile => ({
  id: profileFingerprint(profile),
  ...profile,
});

/*
  The profile a read suggests: one column per header of the record tabs, by
  name, and of each lookup's tab, as `<as>.<column>`, typed as the process
  declares or else from every non-blank cell. Rows without a key are not
  records, so they are not read. Assumes a read that fits the declaration: a
  missing tab adds no columns.
*/
export function profileOf(read: KeptRead, data: DataShape): DataProfile {
  const seen = new Map<
    string,
    { name: string; label: string; cells: unknown[]; blanks: boolean }
  >();
  const take = (tabName: string, key: string, prefix: string) => {
    const tab = read.tabs.find((t) => t.name === tabName);
    const [header = [], ...body] = tab?.values ?? [];
    const names = header.map((h) => String(h));
    const at = names.indexOf(key);
    if (at < 0) return;
    names.forEach((name, i) => {
      const column = `${prefix}${name}`;
      const entry = seen.get(column) ?? {
        name,
        label: words(prefix ? `${prefix.slice(0, -1)} ${name}` : name),
        cells: [],
        blanks: false,
      };
      for (const row of body) {
        if (blank(row[at])) continue;
        if (blank(row[i])) entry.blanks = true;
        else entry.cells.push(row[i]);
      }
      seen.set(column, entry);
    });
  };
  for (const tab of data.records.tabs) take(tab, data.records.key, '');
  for (const lookup of data.lookups)
    take(lookup.tab, lookup.key, `${lookup.as}.`);
  const columns: ProfileColumn[] = [...seen].map(([column, entry]) => {
    const declared = declaredType(data, entry.name, column) ?? null;
    return {
      column,
      type: declared ?? inferred(entry.cells),
      origin: declared ? 'declared' : 'inferred',
      label: entry.label,
      blanksSeen: entry.blanks,
      blank: null,
    };
  });
  return withId({ readId: read.id, confirmedAt: null, columns });
}

/*
  The CEL type a column of this type is read as: whole numbers and money (in
  whole minor units, as `interpretCell` gives it) stay exact as ints, a
  weekday is 1 to 7 and a time minutes after midnight, a date its instant in
  milliseconds; any other number is a double.
*/
export function celTypeOf(
  type: FieldType,
): 'int' | 'double' | 'bool' | 'string' {
  switch (type.kind) {
    case 'whole_number':
    case 'money':
    case 'weekday':
    case 'time_of_day':
    case 'date':
    case 'datetime':
      return 'int';
    case 'decimal':
    case 'percent':
      return 'double';
    case 'yes_no':
      return 'bool';
    case 'key':
    case 'text':
    case 'one_of':
      return 'string';
  }
}

export const confirmProfile = (
  profile: DataProfile,
  at: string = new Date().toISOString(),
): DataProfile => {
  return withId({
    readId: profile.readId,
    confirmedAt: at,
    columns: profile.columns,
  });
};

// One column changed, the rest as they were; unchanged, the same profile.
function changed(
  profile: DataProfile,
  column: string,
  change: (entry: ProfileColumn) => ProfileColumn,
): DataProfile {
  const entry = profile.columns.find((c) => c.column === column);
  if (!entry) throw new Error(`The data profile has no ${column} column.`);
  const next = change(entry);
  if (JSON.stringify(next) === JSON.stringify(entry)) return profile;
  return withId({
    readId: profile.readId,
    confirmedAt: null,
    columns: profile.columns.map((c) => (c === entry ? next : c)),
  });
}

// A declared type is the process's: changing it is a change to its code.
export const setColumnType = (
  profile: DataProfile,
  column: string,
  type: FieldType,
) =>
  changed(profile, column, (entry) => {
    if (entry.origin === 'declared')
      throw new Error(
        `The ${column} column's type is declared by the process, so it is changed there.`,
      );
    return JSON.stringify(entry.type) === JSON.stringify(type)
      ? entry
      : { ...entry, type, origin: 'person' };
  });

export const setColumnLabel = (
  profile: DataProfile,
  column: string,
  label: string,
) => {
  const words = label.trim();
  if (!words) throw new Error('A column needs words to be called by.');
  return changed(profile, column, (entry) => ({ ...entry, label: words }));
};

export const setColumnBlank = (
  profile: DataProfile,
  column: string,
  blank: ProfileColumn['blank'],
) => changed(profile, column, (entry) => ({ ...entry, blank }));

/*
  The process with its data read against this profile, or without one for
  null. The same object for the same process and profile, since records are
  built once per data shape (records.ts) and every call site reads
  `owner.subject.data`.
*/
const baseOf = new WeakMap<DefinitionProcess, DefinitionProcess>();
const profiled = new WeakMap<
  DefinitionProcess,
  Map<string, DefinitionProcess>
>();

export function withProfile(
  owner: DefinitionProcess,
  profile: DataProfile | null,
): DefinitionProcess {
  const base = baseOf.get(owner) ?? owner;
  if (!profile) return base;
  let byId = profiled.get(base);
  if (!byId) profiled.set(base, (byId = new Map()));
  let made = byId.get(profile.id);
  if (!made) {
    made = {
      ...base,
      subject: {
        ...base.subject,
        data: { ...base.subject.data, profile },
      },
    };
    baseOf.set(made, base);
    byId.set(profile.id, made);
  }
  return made;
}

/*
  The process as this set reads its data: on the profile it names, or on none
  when it names none. A set naming a profile the process was not given is an
  error, never read on other types in silence; `ownerFor` loads it.
*/
export function profiledFor(
  owner: DefinitionProcess,
  set: DefinitionSet,
): DefinitionProcess {
  if (!set.profileId) return withProfile(owner, null);
  if (owner.subject.data.profile?.id === set.profileId) return owner;
  throw new Error(
    `These rules were drafted on data profile ${set.profileId}, which was not loaded for them.`,
  );
}

// The process with the confirmed profile a set names loaded, if it names one.
export async function ownerFor(
  owner: DefinitionProcess,
  set: DefinitionSet,
): Promise<DefinitionProcess> {
  if (!set.profileId) return withProfile(owner, null);
  if (owner.subject.data.profile?.id === set.profileId) return owner;
  const profile = await loadConfirmedProfile(owner, set.profileId);
  if (!profile)
    throw new Error(
      `These rules were drafted on data profile ${set.profileId}, which is not kept.`,
    );
  return withProfile(owner, profile);
}

/*
  The process a new draft is written on: the kept profile when a person has
  confirmed it, none when no profile is kept. A profile under review refuses
  the draft, since rules drafted on it would read types nobody confirmed.
*/
export async function ownerToDraft(
  owner: DefinitionProcess,
): Promise<DefinitionProcess> {
  const profile = await loadProfile(owner);
  if (!profile) return withProfile(owner, null);
  if (!profile.confirmedAt)
    throw new Error(
      'The data profile has changes nobody has confirmed: confirm it before drafting.',
    );
  return withProfile(owner, profile);
}
