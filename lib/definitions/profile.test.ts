import { describe, expect, it } from 'vitest';

import type { DataShape } from '@/lib/process/model';
import { BRUNCH_ORDERS_DEFINITIONS } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import {
  celTypeOf,
  confirmProfile,
  ownerFor,
  ownerToDraft,
  profiledFor,
  profileOf,
  setColumnBlank,
  setColumnLabel,
  setColumnType,
  withProfile,
} from './profile';
import type { KeptRead } from './records';
import { inScratchDirectory } from './scratch.fixture';
import { definitionSetSchema, type DefinitionProcess } from './types';
import { saveProfile } from './store';

// What a source's columns are, proposed from one read and then fixed. The
// shape here belongs to no process on purpose: nothing may depend on one.

const DATA: DataShape = {
  records: { tabs: ['Items', 'More'], key: 'id', name: 'name' },
  lookups: [{ tab: 'Groups', key: 'group', via: 'group', as: 'grp' }],
  types: { when: { kind: 'weekday' }, code: { kind: 'text' } },
};
const owner: DefinitionProcess = {
  id: 'profile-test',
  subject: {
    record: { singular: 'item', plural: 'items' },
    data: DATA,
    proposal: [{ id: 'amount', label: 'amount', unit: 'units' }],
    reader: 'reader',
  },
};

const readOf = (more: Partial<Record<string, unknown[][]>> = {}): KeptRead => ({
  id: 'read-1',
  readAt: '2026-10-29T08:45:00Z',
  source: 'test',
  spreadsheet: { title: null, url: '' },
  tabs: Object.entries({
    Items: [
      ['id', 'name', 'count', 'size', 'on', 'words', 'none', 'when', 'code'],
      ['a', 'A', 1, 1, true, 'x', '', 'Mon', 7],
      ['b', 'B', 2, 2.5, false, 3, null, 'Tue', 8],
      // Not a record: no key.
      ['', 'C', 'not read', 'not read', 'x', 'x', 'x', 'x', 'x'],
    ],
    More: [
      ['id', 'count', 'extra'],
      ['a', 3, ''],
      ['b', 4, 9],
    ],
    Groups: [
      ['group', 'size'],
      ['g', 4],
    ],
    ...more,
  }).map(([name, values]) => ({ name, values: values! })),
});

const columnOf = (profile: ReturnType<typeof profileOf>, column: string) =>
  profile.columns.find((c) => c.column === column);

describe('a profile proposed from a read', () => {
  const profile = profileOf(readOf(), DATA);

  it('types each column as little as all its cells bear out', () => {
    expect(columnOf(profile, 'count')?.type).toEqual({ kind: 'whole_number' });
    expect(columnOf(profile, 'size')?.type).toEqual({ kind: 'decimal' });
    expect(columnOf(profile, 'on')?.type).toEqual({ kind: 'yes_no' });
    expect(columnOf(profile, 'words')?.type).toEqual({ kind: 'text' });
    expect(columnOf(profile, 'id')?.type).toEqual({ kind: 'text' });
    expect(columnOf(profile, 'count')?.origin).toBe('inferred');
  });

  it('reads yes and no typed as text as text', () => {
    const typed = profileOf(
      readOf({
        Groups: [
          ['group', 'open'],
          ['g', 'yes'],
        ],
      }),
      DATA,
    );
    expect(columnOf(typed, 'grp.open')?.type).toEqual({ kind: 'text' });
  });

  it('lets the types the process declares win', () => {
    expect(columnOf(profile, 'when')).toMatchObject({
      type: { kind: 'weekday' },
      origin: 'declared',
    });
    // Numbers in the sheet, text by declaration.
    expect(columnOf(profile, 'code')).toMatchObject({
      type: { kind: 'text' },
      origin: 'declared',
    });
  });

  it('cannot tell a column blank throughout, and says blanks were seen', () => {
    expect(columnOf(profile, 'none')).toMatchObject({
      type: null,
      blanksSeen: true,
      blank: null,
      label: 'none',
    });
    expect(columnOf(profile, 'count')?.blanksSeen).toBe(false);
  });

  it('joins a column across record tabs, over every cell', () => {
    expect(profile.columns.filter((c) => c.column === 'count')).toHaveLength(1);
    expect(columnOf(profile, 'extra')).toMatchObject({
      type: { kind: 'whole_number' },
      blanksSeen: true,
    });
  });

  it('names a lookup column by its path, and words it', () => {
    expect(columnOf(profile, 'grp.size')).toMatchObject({
      type: { kind: 'whole_number' },
      label: 'grp size',
    });
    expect(columnOf(profile, 'grp.group')?.type).toEqual({ kind: 'text' });
    expect(columnOf(profile, 'size')?.label).toBe('size');
  });

  it('is under review, from the read it came from', () => {
    expect(profile.confirmedAt).toBeNull();
    expect(profile.readId).toBe('read-1');
  });

  it('has the same id for the same read, and another when a type differs', () => {
    expect(profileOf(readOf(), DATA).id).toBe(profile.id);
    expect(profile.id).toMatch(/^[0-9a-f]{12}$/);
    const other = profileOf(
      readOf({
        Groups: [
          ['group', 'size'],
          ['g', 4.5],
        ],
      }),
      DATA,
    );
    expect(other.id).not.toBe(profile.id);
  });

  it('reads the captured sheet with nothing it cannot type', () => {
    const captured = profileOf(
      capturedRead(),
      BRUNCH_ORDERS_DEFINITIONS.subject.data,
    );
    expect(columnOf(captured, 'on_hand')?.type).toEqual({
      kind: 'whole_number',
    });
    expect(columnOf(captured, 'regular_price')?.type).toEqual({
      kind: 'decimal',
    });
    expect(columnOf(captured, 'max_order_units')).toMatchObject({
      type: { kind: 'whole_number' },
      blanksSeen: true,
    });
    expect(columnOf(captured, 'category.safety_pct')?.label).toBe(
      'category safety pct',
    );
  });
});

describe('a profile changed by a person', () => {
  const profile = profileOf(readOf(), DATA);
  const confirmed = confirmProfile(profile, '2026-11-10T00:00:00.000Z');

  it('is confirmed under a new id', () => {
    expect(confirmed.confirmedAt).toBe('2026-11-10T00:00:00.000Z');
    expect(confirmed.id).not.toBe(profile.id);
    expect(confirmed.columns).toEqual(profile.columns);
  });

  it('is under review again after any change, with a new id', () => {
    const typed = setColumnType(confirmed, 'none', { kind: 'decimal' });
    expect(columnOf(typed, 'none')).toMatchObject({
      type: { kind: 'decimal' },
      origin: 'person',
    });
    expect(typed.confirmedAt).toBeNull();
    expect(typed.id).not.toBe(confirmed.id);

    const labelled = setColumnLabel(confirmed, 'grp.size', '  group size ');
    expect(columnOf(labelled, 'grp.size')?.label).toBe('group size');
    expect(labelled.confirmedAt).toBeNull();

    const answered = setColumnBlank(confirmed, 'extra', 'skip');
    expect(columnOf(answered, 'extra')?.blank).toBe('skip');
    expect(answered.confirmedAt).toBeNull();
    // The rest as they were.
    expect(columnOf(answered, 'count')).toEqual(columnOf(confirmed, 'count'));
  });

  it('is left as it was by a change that changes nothing', () => {
    expect(setColumnType(confirmed, 'count', { kind: 'whole_number' })).toBe(
      confirmed,
    );
    expect(setColumnBlank(confirmed, 'extra', null)).toBe(confirmed);
  });

  it('refuses a declared type, a missing column and an empty label', () => {
    expect(() => setColumnType(confirmed, 'when', { kind: 'text' })).toThrow(
      /declared by the process/,
    );
    expect(() => setColumnBlank(confirmed, 'nothing', 'fail')).toThrow(
      /no nothing column/,
    );
    expect(() => setColumnLabel(confirmed, 'count', ' ')).toThrow(/words/);
  });
});

describe('the CEL type a profiled column is read as', () => {
  it('keeps whole numbers exact and any other number a double', () => {
    expect(celTypeOf({ kind: 'whole_number' })).toBe('int');
    expect(
      celTypeOf({ kind: 'money', currency: { code: 'GBP', minor_units: 2 } }),
    ).toBe('int');
    expect(celTypeOf({ kind: 'weekday' })).toBe('int');
    expect(celTypeOf({ kind: 'time_of_day' })).toBe('int');
    expect(celTypeOf({ kind: 'decimal' })).toBe('double');
    expect(celTypeOf({ kind: 'percent' })).toBe('double');
    expect(celTypeOf({ kind: 'yes_no' })).toBe('bool');
    expect(celTypeOf({ kind: 'text' })).toBe('string');
  });
});

describe('the process as a set reads its data', () => {
  const profile = confirmProfile(profileOf(readOf(), DATA));
  const set = definitionSetSchema.parse({
    hash: 'h',
    version: 'v1',
    intent: '',
    intentConfirmedAt: null,
    readId: null,
    foundAt: '',
    model: '',
    definitions: [],
  });

  it('is one object per process and profile, and the process without one', () => {
    const profiled = withProfile(owner, profile);
    expect(profiled.subject.data.profile).toBe(profile);
    expect(withProfile(owner, profile)).toBe(profiled);
    expect(withProfile(profiled, profile)).toBe(profiled);
    expect(withProfile(profiled, null)).toBe(owner);
    expect(profiled.id).toBe(owner.id);
  });

  it('reads a set naming no profile without one, and refuses one not loaded', () => {
    expect(profiledFor(withProfile(owner, profile), set)).toBe(owner);
    const named = { ...set, profileId: profile.id };
    expect(profiledFor(withProfile(owner, profile), named)).toBe(
      withProfile(owner, profile),
    );
    expect(() => profiledFor(owner, named)).toThrow(
      `drafted on data profile ${profile.id}, which was not loaded`,
    );
  });

  describe('from the store', () => {
    inScratchDirectory();

    it('loads the confirmed profile a set names', async () => {
      const named = { ...set, profileId: profile.id };
      await expect(ownerFor(owner, named)).rejects.toThrow(/is not kept/);
      await saveProfile(owner, profile);
      expect((await ownerFor(owner, named)).subject.data.profile).toEqual(
        profile,
      );
      expect(await ownerFor(owner, set)).toBe(owner);
    });

    it('drafts on the kept profile only once it is confirmed', async () => {
      expect(await ownerToDraft(owner)).toBe(owner);
      await saveProfile(owner, setColumnBlank(profile, 'extra', 'fail'));
      await expect(ownerToDraft(owner)).rejects.toThrow(/confirm it/);
      await saveProfile(owner, profile);
      expect((await ownerToDraft(owner)).subject.data.profile?.id).toBe(
        profile.id,
      );
    });
  });
});
