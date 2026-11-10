import { describe, expect, it } from 'vitest';

import { applyDecisions, prepareWrite, undoApplication } from './apply';
import type { DecisionMade, OutputSheet } from './apply';
import { calculate, crossCheck } from './calculate';
import { review, reviewBreakdown, settingOf, states } from './checks';
import {
  ANSWERS,
  blankDeparturesTabs,
  blankInspectionTabs,
  DATED_DOCKS,
  DATED_SHAPES,
  DATETIME_DOCKS,
  futureInspectionTabs,
  INSPECT_HOURS,
  INSPECTED_HOURS,
  MISDECLARED_DOCKS,
  timedInspectionTabs,
  UNOPENED_DOCKS,
  brokenLookupTabs,
  CALCULATED,
  decimalTabs,
  DOCKS,
  docksRead,
  docksTabs,
  duplicateKeyTabs,
  FORMULAS,
  FOUND,
  FOUND_DEFINITIONS,
  gainedTabs,
  HILLSIDE,
  KEYS,
  MOMENTS,
  PROFILE_COLUMNS,
  SENTENCES,
  shape,
  SHAPES,
  STALE_SWEEP_SKIPPED,
  START_HOURS,
  TEXT,
  UNTIMED_DOCKS,
  VERDICTS,
} from './conformance.fixture';
import { debugDefinition, debugDraft } from './debug';
import { accept, choose, confirmIntent, deny, rebaseSet } from './decide';
import { findDefinitions } from './find';
import { fitsRead, staleness } from './fits';
import {
  checkFormula,
  contextFor as formulaContext,
  run as runFormula,
} from './formulas';
import { answer, call, check, standIn, told } from './models.fixture';
import {
  confirmProfile,
  ownerToDraft,
  profileOf,
  setColumnBlank,
  setColumnType,
  withProfile,
} from './profile';
import { checkProposal, propose } from './propose';
import {
  fitting,
  momentColumn,
  namesOf,
  recordsOf,
  type KeptRead,
} from './records';
import { revisionChanges } from './revision-changes';
import { inScratchDirectory } from './scratch.fixture';
import {
  formulaOf,
  sentenceOf,
  shapeProblems,
  unansweredBlanks,
  valuesInWords,
  type Shape,
  type ShapeContext,
} from './shapes';
import {
  fingerprintOf,
  listRevisions,
  loadConfirmedProfile,
  loadRevision,
  loadSet,
  saveProfile,
} from './store';
import {
  BLANKS_UNANSWERED,
  complete,
  type DataProfile,
  type Definition,
  type DefinitionProcess,
  type DefinitionSet,
  type Proposal,
} from './types';
import { workingOf } from './working';
import { writeAgreed, writeDefinition } from './write';

/*
  The engine run end to end on a second process that shares nothing with
  Brunch orders (conformance.fixture.ts): two proposal fields, two lookups,
  decimals, percentages, money, yes/no, dates, blanks, moments under other
  names, and the same process without timing. Every expectation was worked
  out by hand from the data. Stand-in models, a scratch directory, and a
  sheet held in memory: nothing is spent and nothing is written to the
  repository.
*/

inScratchDirectory();

const read = docksRead();
const readOf = async (id: string) => (id === read.id ? read : null);
const FIRST_AT = '2026-11-05T00:00:00.000Z';
const SECOND_AT = '2026-11-05T01:00:00.000Z';

// A blank base fare means the rule does not apply; a sweep is skipped only
// where both its columns say so, and the time says fail; van times unsaid.
const firstProfile = (data = DOCKS.subject.data) => {
  let profile = profileOf(read, data);
  profile = setColumnBlank(profile, 'area.base_fare', 'skip');
  profile = setColumnBlank(profile, 'swept_day', 'skip');
  profile = setColumnBlank(profile, 'swept_time', 'fail');
  return confirmProfile(profile, FIRST_AT);
};
// Then a blank van time fails, and a blank sweep time does not apply.
const secondProfile = (first: DataProfile) =>
  confirmProfile(
    setColumnBlank(
      setColumnBlank(first, 'van_time', 'fail'),
      'swept_time',
      'skip',
    ),
    SECOND_AT,
  );

const byId = (set: DefinitionSet | null, id: string) =>
  set!.definitions.find((d) => d.id === id)!;

// A write's stand-in: the same answer each time it is asked.
const writing = (...answers: object[]) => standIn(...answers.map(check));

// Found and written on the first profile, every definition twice.
async function drafted() {
  const profile = firstProfile();
  await saveProfile(DOCKS, profile);
  const owner = await ownerToDraft(DOCKS);
  const finder = standIn(answer(FOUND));
  await findDefinitions(owner, TEXT, 'v1', read, { resolve: () => finder });
  for (const { id } of FOUND_DEFINITIONS) {
    const writer = writing(ANSWERS[id]!, ANSWERS[id]!);
    await writeAgreed(owner, TEXT, read, id, { resolve: () => writer });
  }
  return { owner, profile, finder, set: (await loadSet(owner, TEXT))! };
}

// Drafted, confirmed, accepted, moved onto the second profile and accepted
// whole: a frozen revision.
async function accepted() {
  const { owner, profile } = await drafted();
  await confirmIntent(owner, TEXT, readOf);
  for (const { id } of FOUND_DEFINITIONS) await accept(owner, TEXT, id, readOf);
  const second = secondProfile(profile);
  await saveProfile(DOCKS, second);
  await rebaseSet(DOCKS, TEXT, read, second);
  const now = withProfile(DOCKS, second);
  for (const id of ['van_before_lockout', 'stale_sweep'])
    await accept(now, TEXT, id, readOf);
  const set = (await loadSet(now, TEXT))!;
  return { owner: now, set, first: profile, second };
}

describe('reading the data', () => {
  const data = DOCKS.subject.data;

  it('joins three record tabs and reaches two lookups by their own names', () => {
    const records = fitting(read, data);
    expect(records.problems).toEqual([]);
    expect(records.keys).toEqual(KEYS);
    expect(records.record('D-01')).toMatchObject({
      dock_name: 'Marina Bay North',
      capacity: 20n,
      elevation_m: 3.5,
      has_kiosk: true,
      bikes_present: 9n,
      avg_departures: 9.6,
      occupancy_pct: 0.45,
      crew: 'Alpha',
    });
    // Money in cents, a percentage as its fraction, text percent included.
    expect(records.lookups('D-01')).toEqual({
      area: {
        zone_id: 'Z1',
        zone_label: 'Bayfront',
        surge_pct: 0.2,
        cover_pct: 0.1,
        base_fare: 250n,
      },
      team: { crew_name: 'Alpha', van_capacity: 24n, on_call: true },
    });
    expect(records.record('D-07').occupancy_pct).toBe(0.36);
    expect(records.lookups('D-09').area).not.toHaveProperty('base_fare');
    expect(namesOf(read, data)['D-04']).toBe('Harbour Steps');
  });

  it('types a column of decimals with a whole number in it as decimals', () => {
    const { types, record } = recordsOf(read, data);
    expect(types.record).toMatchObject({
      capacity: 'int',
      elevation_m: 'double',
      avg_departures: 'double',
      occupancy_pct: 'double',
      has_kiosk: 'bool',
      last_inspected: 'int',
    });
    expect(record('D-04').elevation_m).toBe(22);
    expect(types.lookups.area).toMatchObject({
      surge_pct: 'double',
      base_fare: 'int',
    });
    // Blank throughout, so typed by nothing without a profile.
    expect(types.record).not.toHaveProperty('retired_bikes');
  });

  it('works out each moment from when the data was read, under its own name', () => {
    const records = recordsOf(read, data);
    for (const key of KEYS) {
      const row = records.record(key);
      const { swept, lockout, van } = MOMENTS[key]!;
      expect(row[momentColumn('swept')]).toBe(swept);
      expect(row[momentColumn('lockout')]).toBe(lockout);
      expect(row[momentColumn('van')]).toBe(van);
      expect(row[momentColumn('start')]).toBe(START_HOURS);
    }
    expect(records.record('D-02').sweep_age_hours).toBe(70.5);
    expect(records.record('D-06')).not.toHaveProperty('sweep_age_hours');
  });

  it('has no moments at all for a process without timing', () => {
    const records = fitting(read, UNTIMED_DOCKS.subject.data);
    expect(
      Object.keys(records.types.record).filter((c) => c.startsWith('moment')),
    ).toEqual([]);
    expect(records.record('D-01')).not.toHaveProperty('sweep_age_hours');
  });

  it('says exactly what is wrong with a read that does not fit', () => {
    expect(recordsOf(docksRead(brokenLookupTabs()), data).problems).toEqual([
      'D-07\'s zone_code is "Z9", which the Zones tab does not list.',
    ]);
    expect(recordsOf(docksRead(duplicateKeyTabs()), data).problems).toEqual([
      'The Usage tab lists dock_ref D-03 twice (Usage!A5); each record needs one row.',
    ]);
    expect(() => fitting(docksRead(brokenLookupTabs()), data)).toThrow(
      /^The read does not fit what this process reads: D-07's zone_code/,
    );
  });
});

describe('the data profile', () => {
  const data = DOCKS.subject.data;

  it('proposes every column a formula can reach, typed and with its blanks', () => {
    const profile = profileOf(read, data);
    expect(
      profile.columns.map((c) => [
        c.column,
        c.type?.kind ?? null,
        c.blanksSeen,
      ]),
    ).toEqual(PROFILE_COLUMNS.map((c) => [...c]));
    expect(profile.columns.every((c) => c.blank === null)).toBe(true);
    const column = (name: string) =>
      profile.columns.find((c) => c.column === name)!;
    expect(column('area.base_fare')).toMatchObject({
      origin: 'declared',
      label: 'area base fare',
    });
    expect(column('has_kiosk').origin).toBe('inferred');
    expect(column('van_time').label).toBe('van time');
  });

  it('is kept once confirmed, and a draft waits for the confirmation', async () => {
    const proposed = profileOf(read, data);
    await saveProfile(DOCKS, proposed);
    await expect(ownerToDraft(DOCKS)).rejects.toThrow(/confirm it/);
    const profile = firstProfile();
    await saveProfile(DOCKS, profile);
    expect(await loadConfirmedProfile(DOCKS, profile.id)).toEqual(profile);
    const owner = await ownerToDraft(DOCKS);
    expect(owner.subject.data.profile?.id).toBe(profile.id);
  });

  it('holds a later read to it: a decimal in a whole-number column is a problem by its cell', () => {
    const held = withProfile(DOCKS, firstProfile()).subject.data;
    expect(recordsOf(docksRead(decimalTabs()), held).problems).toEqual([
      'Usage!D6 (bikes_present) reads "15.5": Expected a whole number.',
    ]);
    // Without one, the read is typed afresh, and the column becomes decimals.
    const loose = recordsOf(docksRead(decimalTabs()), data);
    expect(loose.problems).toEqual([]);
    expect(loose.types.record.bikes_present).toBe('double');
  });

  it('keeps a column typed when the read has none of it, once a person types it', () => {
    let profile = firstProfile();
    profile = confirmProfile(
      setColumnType(profile, 'retired_bikes', { kind: 'whole_number' }),
    );
    const held = recordsOf(read, withProfile(DOCKS, profile).subject.data);
    expect(held.types.record.retired_bikes).toBe('int');
    expect(held.types.record[momentColumn('van')]).toBe('double');
    // A column the profile lists that the read has lost.
    const tabs = docksTabs();
    for (const row of tabs[0]!.values) row.splice(4, 1);
    expect(
      recordsOf(docksRead(tabs), withProfile(DOCKS, profile).subject.data)
        .problems,
    ).toEqual([
      'None of the Docks, Usage and Visits tabs has a elevation_m column, which the data profile lists.',
    ]);
  });
});

// What a shape reads against: this read, held to a profile or not.
const EARLIER: Definition[] = FOUND_DEFINITIONS.slice(0, 2).map((d) => ({
  ...d,
  constants: [],
  groups: [],
  uses: [],
  formula: (ANSWERS[d.id] as { formula: string }).formula,
  examples: [],
  problem: null,
  model: null,
  approvedAt: null,
  deniedAt: null,
  denial: null,
}));
function contextFor(
  id: keyof typeof SHAPES,
  owner: DefinitionProcess = withProfile(DOCKS, firstProfile()),
): ShapeContext {
  const found = FOUND_DEFINITIONS.find((d) => d.id === id)!;
  const written = ANSWERS[id] as Pick<Definition, 'constants' | 'groups'>;
  return {
    subject: owner.subject,
    records: recordsOf(read, owner.subject.data),
    read,
    consequence: found.consequence,
    constants: written.constants,
    groups: written.groups,
    earlier: EARLIER,
  };
}

describe('every shape, on this process', () => {
  it.each(Object.keys(SHAPES) as (keyof typeof SHAPES)[])(
    '%s: its formula and sentence, as worked out by hand',
    (id) => {
      const context = contextFor(id);
      const written: Shape = SHAPES[id];
      expect(shapeProblems(written, context)).toEqual([]);
      expect(formulaOf(written, context)).toBe(FORMULAS[id]);
      expect(sentenceOf(written, context)).toBe(SENTENCES[id]);
    },
  );

  it('says what a blank means from the profile: skip, fail, or fail until answered', () => {
    // Without a profile, every blank fails.
    const loose = contextFor('fare_floor', DOCKS);
    expect(formulaOf(SHAPES.fare_floor, loose)).toBe(
      '(has(area.base_fare) && (double(fare) >= double(area.base_fare)))',
    );
    expect(sentenceOf(SHAPES.fare_floor, loose)).toBe(
      'The proposed hire fare must be at least the area base fare. Where the area base fare is blank, it fails.',
    );
    expect(unansweredBlanks(SHAPES.fare_floor, loose)).toEqual([]);
    // Unanswered: fails, and Accept refuses it until a person says.
    const first = contextFor('van_before_lockout');
    expect(unansweredBlanks(SHAPES.van_before_lockout, first)).toEqual([
      { column: 'van_time', label: 'van time' },
    ]);
    // A moment is skipped only where both its columns say skip.
    const second = withProfile(DOCKS, secondProfile(firstProfile()));
    expect(
      formulaOf(SHAPES.stale_sweep, contextFor('stale_sweep', second)),
    ).toBe(STALE_SWEEP_SKIPPED);
    expect(
      sentenceOf(SHAPES.stale_sweep, contextFor('stale_sweep', second)),
    ).toMatch(/Where the last sweep is blank, it does not apply\.$/);
  });

  it('asks which field, where there are two', () => {
    const context = contextFor('fits_free_space');
    expect(
      shapeProblems(
        shape({ kind: 'limit', at: 'most', amount: 'value:free_space' }),
        context,
      ),
    ).toEqual(['limit needs field: the fields are bikes, fare.']);
    expect(
      shapeProblems(
        { ...SHAPES.fits_free_space, field: 'proposed:fare' },
        context,
      ),
    ).toEqual([]);
  });

  it('refuses moments where the process has no timing, naming none', () => {
    const untimed = (id: keyof typeof SHAPES) =>
      shapeProblems(SHAPES[id], contextFor(id, UNTIMED_DOCKS));
    expect(untimed('van_before_lockout')).toEqual([
      'No moment van; the moments are none.',
      'No moment lockout; the moments are none.',
    ]);
    expect(untimed('stale_sweep')).toEqual([
      'No moment swept; the moments are none.',
    ]);
    // What reads no moment is written the same as with timing.
    expect(
      formulaOf(
        SHAPES.fits_free_space,
        contextFor('fits_free_space', UNTIMED_DOCKS),
      ),
    ).toBe(FORMULAS.fits_free_space);
  });

  it('refuses a column of a lookup that is not a number, or not there', () => {
    const context = contextFor('van_holds');
    expect(
      shapeProblems(
        { ...SHAPES.van_holds, amount: 'column:team.on_call' },
        context,
      ),
    ).toEqual(['team.on_call is not a number.']);
    expect(
      shapeProblems(
        { ...SHAPES.van_holds, amount: 'column:area.van_capacity' },
        context,
      ),
    ).toEqual(['No column area.van_capacity.']);
  });
});

describe('type-checking a formula', () => {
  const scope = { values: {}, constants: {}, groups: [] };
  const typed = (formula: string, owner = DOCKS) =>
    checkFormula(read, owner.subject, scope, 'number', formula);

  it('reads both lookups, every field, and the types of every column', () => {
    expect(typed('record.capacity - record.bikes_present')).toBeNull();
    expect(typed('record.avg_departures * (1.0 + area.surge_pct)')).toBeNull();
    expect(typed('team.van_capacity + bikes + fare')).toBeNull();
    expect(typed('record.capacity - record.elevation_m')).toMatch(
      /int and double never mix/,
    );
    expect(typed('record.retired_bikes')).not.toBeNull();
  });
});

describe('drafting', () => {
  it('finds and writes every definition, each agreeing twice', async () => {
    const { set, finder, owner } = await drafted();
    expect(told(finder)).toContain(
      'Docks: dock_ref, dock_name, zone_code, capacity',
    );
    expect(told(finder)).toContain('bikes to bring and hire fare');
    expect(set.profileId).toBe(owner.subject.data.profile!.id);
    expect(set.accounting?.[4]).toEqual({
      sentence: "Free space is the dock's capacity less the bikes present.",
      kind: 'quantity',
      definitions: ['free_space'],
    });
    for (const { id } of FOUND_DEFINITIONS) {
      const d = byId(set, id);
      expect(d.problem, id).toBeNull();
      expect(d.agreement, id).toMatchObject({ status: 'agreed', runs: 2 });
    }
    expect(byId(set, 'free_space').formula).toBe(
      'record.capacity - record.bikes_present',
    );
    for (const [id, formula] of Object.entries(FORMULAS))
      expect(byId(set, id).formula, id).toBe(formula);
    expect(byId(set, 'covers_departures').uses).toEqual([
      'expected_departures',
    ]);
    expect(byId(set, 'hillside_fare_cap').groups).toEqual([HILLSIDE]);
  });

  it('tells a writer how money and percentages are held', async () => {
    const profile = firstProfile();
    await saveProfile(DOCKS, profile);
    const owner = await ownerToDraft(DOCKS);
    const finder = standIn(answer(FOUND));
    await findDefinitions(owner, TEXT, 'v1', read, { resolve: () => finder });
    const writer = writing(ANSWERS.expected_departures!);
    await writeDefinition(owner, TEXT, read, 'expected_departures', {
      resolve: () => writer,
    });
    expect(told(writer)).toMatch(/Percentages \([^)]*surge_pct[^)]*\) are/);
    expect(told(writer)).toContain('25% is 0.25');
    expect(told(writer)).toMatch(/Amounts of money \([^)]*base_fare[^)]*\)/);
    expect(told(writer)).toContain('- area: the Zones row whose zone_id');
    expect(told(writer)).toContain('- fare: the proposed hire fare, in cents');
  });

  it('tells a writer of a process without timing that there are no moments', async () => {
    const finder = standIn(answer(FOUND));
    await findDefinitions(UNTIMED_DOCKS, TEXT, 'v1', read, {
      resolve: () => finder,
    });
    const writer = writing(ANSWERS.fare_floor!);
    const set = await writeDefinition(UNTIMED_DOCKS, TEXT, read, 'fare_floor', {
      resolve: () => writer,
    });
    expect(told(writer)).toContain('There are no moments.');
    expect(told(writer)).toContain(
      'proposed:bikes (the bikes to bring, in bikes), proposed:fare (the hire fare, in cents)',
    );
    // No profile: a blank base fare fails, so D-09 and D-10 cannot hold.
    expect(byId(set, 'fare_floor').formula).toBe(
      '(has(area.base_fare) && (double(fare) >= double(area.base_fare)))',
    );
  });

  it('splits two writes that put the same limit on different fields', async () => {
    await drafted();
    const onFare = {
      ...ANSWERS.no_kiosk_cap,
      shape: { ...SHAPES.no_kiosk_cap, field: 'fare' },
      examples: [
        {
          key: 'D-03',
          inputs: { bikes: null, fare: 8 },
          result: true,
          why: '',
        },
        {
          key: 'D-03',
          inputs: { bikes: null, fare: 9 },
          result: false,
          why: '',
        },
        {
          key: 'D-01',
          inputs: { bikes: null, fare: 12 },
          result: true,
          why: '',
        },
      ],
    };
    const writer = writing(ANSWERS.no_kiosk_cap!, onFare);
    const set = await writeAgreed(
      withProfile(DOCKS, firstProfile()),
      TEXT,
      read,
      'no_kiosk_cap',
      { resolve: () => writer },
    );
    const split = byId(set, 'no_kiosk_cap');
    expect(split.agreement).toMatchObject({ status: 'split', runs: 2 });
    // D-03 has no kiosk: 9 bikes is over 8 whatever the fare.
    expect(split.agreement?.differences[0]).toEqual({
      key: 'D-03',
      inputs: { bikes: 9, fare: 0 },
      results: ['false', 'true'],
    });
    const chosen = await choose(
      withProfile(DOCKS, firstProfile()),
      TEXT,
      'no_kiosk_cap',
      1,
    );
    expect(byId(chosen, 'no_kiosk_cap')).toMatchObject({
      agreement: { status: 'chosen' },
      shape: { field: 'fare' },
    });
  });

  it('refuses a rule only when every write refuses', async () => {
    const { owner } = await drafted();
    const refusal = {
      constants: [],
      groups: [],
      shape: null,
      none_fits: { reason: 'needs_or', explain: 'It says or.' },
      examples: [],
    };
    const writer = writing(...Array.from({ length: 6 }, () => refusal));
    const set = await writeAgreed(owner, TEXT, read, 'whole_racks', {
      resolve: () => writer,
    });
    expect(byId(set, 'whole_racks')).toMatchObject({
      formula: null,
      unfit: 'It says or.',
    });
  });

  it('reviews a written definition part by part, as Accept does', async () => {
    const { owner, set } = await drafted();
    const definition = byId(set, 'covers_departures');
    const setting = settingOf(owner, TEXT, set, read, definition);
    const draft = {
      formula: definition.formula!,
      constants: definition.constants,
      groups: definition.groups,
      examples: definition.examples,
    };
    expect(review(setting, draft).problems).toEqual([]);
    const parts = reviewBreakdown(setting, draft);
    expect(parts.every((p) => p.problems.length === 0)).toBe(true);
    expect(parts.find((p) => p.id === 'both-ways')?.note).toBe(
      'On this read it can hold and can fail.',
    );
    // A number mixing whole and decimal columns is refused before it runs.
    const mixed = byId(set, 'free_space');
    const wrong = reviewBreakdown(settingOf(owner, TEXT, set, read, mixed), {
      formula: 'record.capacity - record.elevation_m',
      constants: [],
      groups: [],
      examples: mixed.examples,
    });
    expect(wrong.find((p) => p.id === 'fits')?.problems[0]).toMatch(
      /int and double never mix/,
    );
  });
});

describe('accepting', () => {
  it('accepts each in turn, refusing a rule whose blanks nobody answered', async () => {
    const { owner } = await drafted();
    await confirmIntent(owner, TEXT, readOf);
    for (const { id } of FOUND_DEFINITIONS)
      await accept(owner, TEXT, id, readOf);
    const set = await loadSet(owner, TEXT);
    const open = set!.definitions.filter((d) => !d.approvedAt);
    expect(open.map((d) => d.id)).toEqual(['van_before_lockout']);
    expect(open[0]!.problem).toBe(
      `${BLANKS_UNANSWERED}: the van time. Does a rule reading one not apply, or fail?`,
    );
    expect(complete(set!)).toBe(false);
    // A denial is kept with its note, and taken back by accepting again.
    const denied = byId(
      await deny(owner, TEXT, 'whole_racks', 'Racks are of 5.'),
      'whole_racks',
    );
    expect(denied).toMatchObject({
      approvedAt: null,
      denial: 'Racks are of 5.',
    });
    const again = byId(
      await accept(owner, TEXT, 'whole_racks', readOf),
      'whole_racks',
    );
    expect(again).toMatchObject({ denial: null, problem: null });
    expect(again.approvedAt).not.toBeNull();
  });

  it('moves onto a newer profile, withdrawing only what it changes, then freezes', async () => {
    const { owner, profile } = await drafted();
    await confirmIntent(owner, TEXT, readOf);
    for (const { id } of FOUND_DEFINITIONS)
      await accept(owner, TEXT, id, readOf);
    const second = secondProfile(profile);
    await saveProfile(DOCKS, second);
    const rebased = (await rebaseSet(DOCKS, TEXT, read, second))!;
    expect(rebased.profileId).toBe(second.id);
    expect(byId(rebased, 'stale_sweep')).toMatchObject({
      formula: STALE_SWEEP_SKIPPED,
      approvedAt: null,
      problem: null,
    });
    expect(
      rebased.definitions.filter((d) => !d.approvedAt).map((d) => d.id),
    ).toEqual(['van_before_lockout', 'stale_sweep']);
    const now = withProfile(DOCKS, second);
    for (const id of ['van_before_lockout', 'stale_sweep'])
      await accept(now, TEXT, id, readOf);
    const set = (await loadSet(now, TEXT))!;
    expect(complete(set)).toBe(true);
    expect(set.acceptedKeys).toEqual(KEYS);
    const { head, revisions } = await listRevisions(now, TEXT);
    expect(head).toBe(fingerprintOf(set));
    expect(revisions).toMatchObject([{ reason: 'accepted', parent: null }]);
    expect(await loadRevision(now, TEXT, head!)).toEqual(set);
  });
});

describe('a frozen revision in use', () => {
  it('fits the read it was accepted on, and a decimal read fails only without a profile', async () => {
    const { owner, set } = await accepted();
    expect(fitsRead(owner, TEXT, set, read)).toEqual([]);
    expect(staleness(owner, TEXT, set, set, read)).toBeNull();
    // Held to its profile, a decimal is the read's problem, not the rules'.
    expect(fitsRead(owner, TEXT, set, docksRead(decimalTabs()))).toEqual([]);
    // Drafted on no profile, the same read retypes the column under it.
    const loose = { ...set, profileId: undefined };
    const misfits = fitsRead(DOCKS, TEXT, loose, docksRead(decimalTabs()));
    expect(misfits.map((m) => m.id)).toEqual(['free_space']);
    expect(misfits[0]!.problem).toMatch(/int and double never mix/);
    expect(
      staleness(DOCKS, TEXT, loose, loose, docksRead(decimalTabs())),
    ).toMatchObject({ current: null, problems: misfits });
  });

  it('works every calculation out for every dock, as by hand', async () => {
    const { owner, set } = await accepted();
    const calculation = calculate(owner, set, read);
    expect(calculation.calculations.map((c) => c.id)).toEqual([
      'free_space',
      'expected_departures',
    ]);
    for (const row of calculation.rows) {
      const hand = CALCULATED[row.key]!;
      expect(row.values.free_space!.value, row.key).toBe(hand.free_space);
      expect(row.values.expected_departures!.value, row.key).toBeCloseTo(
        hand.expected_departures,
        9,
      );
    }
    expect(calculation.rows[3]).toMatchObject({ name: 'Harbour Steps' });
    const model = standIn(
      answer({
        records: KEYS.map((key) => ({
          key,
          values: {
            free_space: {
              value: CALCULATED[key]!.free_space,
              working: 'By hand.',
            },
            expected_departures: {
              value: CALCULATED[key]!.expected_departures,
              working: 'By hand.',
            },
          },
        })),
      }),
    );
    const crossed = await crossCheck(owner, set, read, read.id, TEXT, {
      resolve: () => model,
    });
    expect(crossed).toMatchObject({ agreed: 20, total: 20 });
  });

  it.each(VERDICTS)(
    'checks $key at $values: $verdict',
    async ({ key, values, verdict, failing }) => {
      const { owner, set } = await accepted();
      const checked = checkProposal(owner, set, read, key, values);
      expect(checked.checks.filter((c) => !c.holds).map((c) => c.id)).toEqual(
        failing,
      );
      expect(checked.verdict).toBe(verdict);
    },
  );

  it('says which checks do not apply, and holds a value below the minimum', async () => {
    const { owner, set } = await accepted();
    const d09 = checkProposal(owner, set, read, 'D-09', { bikes: 0, fare: 1 });
    // No base fare in the Gardens yet: the floor does not apply.
    expect(d09.checks.find((c) => c.id === 'fare_floor')).toMatchObject({
      holds: true,
      applies: false,
    });
    expect(d09.verdict).toBe('ready');
    const below = checkProposal(owner, set, read, 'D-10', {
      bikes: -4,
      fare: 0,
    });
    expect(below.verdict).toBe('blocked');
    expect(below.checks.filter((c) => !c.holds)).toEqual([
      expect.objectContaining({
        id: 'min:bikes',
        name: 'Proposed bikes to bring at least 0 bikes',
      }),
    ]);
  });

  it('checks a dock left as it is with its bikes at none, and judges no fare nobody proposed', async () => {
    const { owner, set } = await accepted();
    // Nothing brought: D-01's 9 fall short of 12.672, for a person.
    const d01 = checkProposal(owner, set, read, 'D-01', { bikes: 0 });
    expect(d01.checks.filter((c) => !c.holds).map((c) => c.id)).toEqual([
      'covers_departures',
    ]);
    expect(d01.verdict).toBe('decide');
    // The fare is not proposed, so no rule about it applies.
    expect(d01.checks.find((c) => c.id === 'fare_floor')).toMatchObject({
      holds: true,
      applies: false,
    });
    expect(checkProposal(owner, set, read, 'D-08', { bikes: 0 }).verdict).toBe(
      'ready',
    );
  });

  it('fails only what reads a calculation that cannot be worked out', async () => {
    const { owner, set } = await accepted();
    const blank = docksRead(blankDeparturesTabs());
    const checked = checkProposal(owner, set, blank, 'D-08', {
      bikes: 0,
      fare: 200,
    });
    const failing = checked.checks.filter((c) => !c.holds);
    expect(failing.map((c) => c.id)).toEqual(['covers_departures']);
    expect(failing[0]!.error).toMatch(
      /^Expected departures cannot be worked out:/,
    );
    expect(checked.verdict).toBe('decide');
  });

  it('gives a dock new since acceptance to a person, naming the group by its words', async () => {
    const { owner, set } = await accepted();
    const gained = docksRead(gainedTabs());
    const checked = checkProposal(owner, set, gained, 'D-11', {
      bikes: 4,
      fare: 260,
    });
    expect(checked.verdict).toBe('decide');
    expect(checked.checks.filter((c) => !c.holds)).toEqual([
      expect.objectContaining({
        id: 'new:record',
        steps: [
          'D-11 was not among the docks the rules were accepted on',
          `The rules name groups by their words: "${HILLSIDE.quote}"`,
        ],
      }),
    ]);
  });

  it('is unchecked where the rulebook has nothing to check', async () => {
    const { owner, set } = await accepted();
    const numbers = {
      ...set,
      definitions: set.definitions.filter((d) => d.result === 'number'),
    };
    expect(
      checkProposal(owner, numbers, read, 'D-01', { bikes: 4, fare: 260 })
        .verdict,
    ).toBe('unchecked');
  });
});

describe('what a person debugging sees', () => {
  it('names the fields a rule reads, and the columns no rule reads', async () => {
    const { owner, set } = await accepted();
    const covers = debugDefinition(
      owner,
      TEXT,
      set,
      read,
      'covers_departures',
    )!;
    expect(covers.fields).toEqual([{ id: 'bikes', label: 'bikes to bring' }]);
    expect(covers.inputs).toEqual({ bikes: 0, fare: 0 });
    expect(covers.source.columns).toEqual({
      own: ['bikes_present', 'area.cover_pct'],
      through: ['avg_departures', 'area.surge_pct'],
    });
    expect(covers.about).toEqual({ record: 'dock', key: 'dock_ref' });
    // With nothing brought, only what is present can reach each target.
    expect(covers.records.filter((r) => r.result).map((r) => r.key)).toEqual([
      'D-06',
      'D-08',
      'D-09',
      'D-10',
    ]);
    // A column a moment is worked out from is read by the rule reading it.
    expect(
      debugDraft(owner, TEXT, set, read).columns!.unread.toSorted(),
    ).toEqual([
      'area.zone_label',
      'elevation_m',
      'last_inspected',
      'notes',
      'occupancy_pct',
      'sweep_age_hours',
      'team.on_call',
    ]);
  });

  it('shows an example’s working in the rule’s own words', async () => {
    const { owner, set } = await accepted();
    const [first] = workingOf(owner, set, read, byId(set, 'covers_departures'));
    expect(first).toEqual([
      'the proposed bikes to bring is 4; the bikes present is 9; the expected departures is 11.52; the area cover pct is 0.1',
    ]);
    expect(revisionChanges(null, set).added).toHaveLength(11);
  });
});

describe('proposing and writing', () => {
  const set = (key: string, bikes: number, fare: number) => ({
    key,
    action: 'set',
    values: { bikes, fare },
    reason: 'Worked out.',
    cited: [{ tab: 'Usage', row: 2, column: 'bikes_present' }],
    unsure: null,
  });
  const leave = (key: string) => ({
    key,
    action: 'leave',
    values: null,
    reason: 'Nothing to change.',
    cited: [],
    unsure: null,
  });
  const ANSWER = {
    records: [
      set('D-01', 4, 260),
      leave('D-02'),
      set('D-03', 4, 300),
      leave('D-04'),
      set('D-05', 4, 220),
      set('D-06', 0, 240),
      leave('D-07'),
      leave('D-08'),
      set('D-09', 0, 150),
      leave('D-10'),
    ],
  };

  async function proposed() {
    const done = await accepted();
    const model = standIn(
      call('try_proposals', {
        proposals: [{ key: 'D-02', values: { bikes: 4, fare: 250 } }],
      }),
      call('submit_proposals', ANSWER),
    );
    const proposal = await propose(done.owner, done.set, read, read.id, TEXT, {
      resolve: () => model,
    });
    return { ...done, model, proposal };
  }

  it('keeps code’s verdict on every dock, left ones included', async () => {
    const { proposal, model } = await proposed();
    const verdicts = Object.fromEntries(
      Object.entries(proposal.records).map(([key, r]) => [key, r.verdict]),
    );
    expect(verdicts).toEqual({
      'D-01': 'ready',
      // Left: short of cover, and swept 70.5 hours before.
      'D-02': 'decide',
      'D-03': 'ready',
      'D-04': 'decide',
      'D-05': 'ready',
      'D-06': 'ready',
      'D-07': 'decide',
      'D-08': 'ready',
      'D-09': 'ready',
      'D-10': 'ready',
    });
    expect(proposal.records['D-01']!.cited).toEqual(['Usage!D2']);
    expect(told(model)).toContain('bikes (the bikes to bring, in bikes)');
    expect(told(model)).toContain(
      "Its Crews row is the one whose crew_name is the dock's crew.",
    );
  });

  // A sheet in memory, recording what was asked of it.
  function memorySheet(now: KeptRead) {
    const sheet: OutputSheet & { grid: unknown[][] | null } = {
      grid: null,
      readNow: async () => now,
      readTab: async () => sheet.grid,
      addTab: async () => {
        sheet.grid = [];
      },
      writeRange: async (_, range, values) => {
        const [from = 'A1'] = range.split(':');
        const left = from.charCodeAt(0) - 65;
        const top = Number(from.slice(1)) - 1;
        const grid = (sheet.grid ??= []);
        values.forEach((row, r) => {
          const line = (grid[top + r] ??= []);
          row.forEach((cell, c) => {
            line[left + c] = cell;
          });
        });
      },
    };
    return sheet;
  }

  it('writes both fields of what was decided to the output tab, and undoes it', async () => {
    const { owner, set: rulebook, proposal } = await proposed();
    const at = '2026-11-05T02:00:00.000Z';
    const decisions: Record<string, DecisionMade> = Object.fromEntries(
      KEYS.map((key) => [key, { kind: 'approve', at }]),
    );
    decisions['D-04'] = { kind: 'reject', at };
    decisions['D-06'] = { kind: 'change', values: { bikes: 0, fare: 230 }, at };
    const sheet = memorySheet(read);
    const prepared = await prepareWrite(
      owner,
      rulebook,
      read,
      proposal,
      decisions,
      sheet,
    );
    expect(prepared.problems).toEqual([]);
    expect(prepared.block).toMatchObject({
      range: 'A1:C6',
      after: [
        ['dock_ref', 'bikes', 'fare'],
        ['D-01', 4, 260],
        ['D-03', 4, 300],
        ['D-05', 4, 220],
        ['D-06', 0, 230],
        ['D-09', 0, 150],
      ],
    });
    expect(prepared.changes.filter((c) => c.key === 'D-06')).toEqual([
      { key: 'D-06', field: 'bikes', cell: 'Plan!B5', before: null, after: 0 },
      { key: 'D-06', field: 'fare', cell: 'Plan!C5', before: null, after: 230 },
    ]);
    // A dock left as it is is checked, though nothing is written for it.
    expect(prepared.decisions['D-02']).toMatchObject({
      values: null,
      verdict: 'decide',
    });
    expect(prepared.decisions['D-04']).toMatchObject({ verdict: null });
    const fingerprint = fingerprintOf(rulebook);
    const written = await applyDecisions(
      owner,
      rulebook,
      read,
      fingerprint,
      proposal,
      decisions,
      [],
      sheet,
    );
    expect(written).toMatchObject({
      kind: 'written',
      application: { status: 'verified', tab: 'Plan' },
    });
    expect(sheet.grid?.[2]).toEqual(['D-03', 4, 300]);
    const undone = await undoApplication(owner, read.id, fingerprint, sheet);
    expect(undone).toMatchObject({ application: { status: 'undone' } });
    expect(sheet.grid?.[2]).toEqual(['', '', '']);
  });

  it('refuses to write a change missing a field', async () => {
    const { owner, set: rulebook, proposal } = await proposed();
    const at = '2026-11-05T02:00:00.000Z';
    const decisions: Record<string, DecisionMade> = Object.fromEntries(
      KEYS.map((key) => [key, { kind: 'approve', at }]),
    );
    decisions['D-01'] = { kind: 'change', values: { bikes: 4 }, at };
    const prepared = await prepareWrite(
      owner,
      rulebook,
      read,
      proposal as Proposal,
      decisions,
      memorySheet(read),
    );
    expect(prepared.problems).toEqual([
      'D-01 needs a whole number for hire fare.',
    ]);
  });
});

/*
  Limits found: what the engine cannot express, recorded rather than
  designed here. Each says exactly what is unsupported.
*/
describe('limits', () => {
  // A date column is a moment only where the process declares it one
  // (DATED_DOCKS); undeclared, it is a number, the instant in milliseconds.
  it('reads an undeclared date column as a number, not a moment', () => {
    const context = contextFor('stale_sweep');
    expect(
      recordsOf(read, DOCKS.subject.data).types.record.last_inspected,
    ).toBe('int');
    expect(
      shapeProblems(
        shape({
          kind: 'flag',
          when: [
            {
              left: 'moment:last_inspected',
              op: 'before',
              right: 'moment:read',
            },
          ],
        }),
        context,
      ),
    ).toEqual([
      'No moment last_inspected; the moments are start, read, swept, lockout, van.',
    ]);
  });
  // A constant is quoted in the instructions' own unit: "30 days" states
  // 30, never the 720 hours hours_since compares with.
  it.todo('a duration stated in days or weeks, compared with hours since');
  it.todo(
    'a source that is not sheet-shaped: tabs of rows with a header, and cells cited as <tab>!A1 (planned)',
  );
  it.todo(
    'one record over several rows of a tab: a key listed twice is a read problem',
  );
  it.todo('a check reading more than one record at a time');
  it.todo('a proposal field that is not a whole number');

  // A money column is held in minor units (base_fare 2.50 is 250), but a
  // constant is checked against the words that state it: "S$3.00" states 3,
  // never 300. A rule written in the currency, not its minor unit, cannot
  // quote a constant that compares with the column.
  it.skip('quotes a currency amount as the minor units a money column holds', () => {
    expect(states('at most S$3.00', 300)).toBe(true);
  });
  // What it does now: the words state 3, which compares with 3 cents.
  it('reads a currency amount in its words as the main unit', () => {
    expect(states('at most S$3.00', 3)).toBe(true);
  });

  // Words are read as English: numbers in words, weekday names, plurals.
  it.todo(
    'instructions in another language: a constant stated in words, or a group naming records by a plural, is refused',
  );

  // Types are declared by header (DataShape.types), so two tabs with a column
  // of the same name -- a record's and a lookup's -- share one declared type.
  it.todo(
    'declaring a type for one tab’s column where another tab shares its name',
  );
});

describe('dated moments', () => {
  const data = DATED_DOCKS.subject.data;
  // A shape on a dated process, with the constant it names.
  const datedContext = (
    owner: DefinitionProcess = DATED_DOCKS,
    on: KeptRead = read,
    consequence: 'block' | 'decide' = 'decide',
  ): ShapeContext => ({
    subject: owner.subject,
    records: recordsOf(on, owner.subject.data),
    read: on,
    consequence,
    constants: [INSPECT_HOURS],
    groups: [],
    earlier: [],
  });
  const overdue = (context: ShapeContext, key: string) =>
    run(formulaOf(DATED_SHAPES.overdue, context), key, context);
  const run = (formula: string, key: string, context: ShapeContext) =>
    runFormula(
      formula,
      formulaContext(
        context.read,
        key,
        context.subject,
        {
          inputs: { bikes: 4, fare: 0 },
          constants: { inspect_hours: 720 },
          groups: {},
        },
        {},
      ),
    );

  it('is the instant its cell holds, as hours from the read, and its hours since', () => {
    const records = fitting(read, data);
    for (const key of KEYS) {
      const row = records.record(key);
      expect(row[momentColumn('inspected')], key).toBe(INSPECTED_HOURS[key]);
      expect(row.inspection_age_hours, key).toBe(-INSPECTED_HOURS[key]!);
      expect(row.inspection_hours_left, key).toBe(INSPECTED_HOURS[key]);
    }
    // The weekly moments beside it are as they were.
    expect(records.record('D-01')[momentColumn('van')]).toBe(26.5);
    // Held to a profile, it stays a double whatever the read holds.
    const held = recordsOf(
      docksRead(blankInspectionTabs()),
      withProfile(DATED_DOCKS, confirmProfile(profileOf(read, data))).subject
        .data,
    );
    expect(held.types.record[momentColumn('inspected')]).toBe('double');
    expect(held.record('D-06')).not.toHaveProperty(momentColumn('inspected'));
    expect(held.record('D-06')).not.toHaveProperty('inspection_age_hours');
  });

  it('is a date at the start of its day, and a date-time at its time', () => {
    const records = recordsOf(
      docksRead(timedInspectionTabs()),
      DATETIME_DOCKS.subject.data,
    );
    // 08:45 on 20 Oct in Singapore is 00:45Z: 382.75 hours before the read.
    expect(records.record('D-01')[momentColumn('inspected')]).toBe(-382.75);
    expect(records.record('D-02')[momentColumn('inspected')]).toBe(-367.5);
  });

  it('flags a dock not inspected for 720 hours, and fails one inspected after the read', () => {
    const context = datedContext();
    expect(shapeProblems(DATED_SHAPES.overdue, context)).toEqual([]);
    expect(formulaOf(DATED_SHAPES.overdue, context)).toBe(
      '((has(record.moment__inspected)) && (record.moment__inspected <= 0.0) && (!((0.0 - record.moment__inspected) > double(constants.inspect_hours))))',
    );
    expect(sentenceOf(DATED_SHAPES.overdue, context)).toBe(
      'Flag it for a person when the hours from the last inspection to when the data is read is more than 720 (“more than 720 hours”). Where the last inspection is after the data is read, it fails.',
    );
    // 871.5, 823.5 and 751.5 hours since: flagged.
    expect(KEYS.filter((key) => overdue(context, key) === false)).toEqual([
      'D-03',
      'D-04',
      'D-09',
    ]);
    // Booked for after the read: never a negative number of hours.
    const ahead = datedContext(DATED_DOCKS, docksRead(futureInspectionTabs()));
    expect(ahead.records.record('D-10')[momentColumn('inspected')]).toBe(112.5);
    expect(overdue(ahead, 'D-10')).toBe(false);
  });

  it('allows bringing bikes only where the inspection came before the read', () => {
    const context = datedContext(DATED_DOCKS, read, 'block');
    expect(formulaOf(DATED_SHAPES.inspected_first, context)).toBe(
      'bikes == 0 || (has(record.moment__inspected) && (record.moment__inspected < 0.0))',
    );
    expect(sentenceOf(DATED_SHAPES.inspected_first, context)).toBe(
      'The proposed bikes to bring is allowed only when the last inspection is before the data is read. Proposing 0 bikes is always allowed.',
    );
    const ahead = datedContext(
      DATED_DOCKS,
      docksRead(futureInspectionTabs()),
      'block',
    );
    const formula = formulaOf(DATED_SHAPES.inspected_first, ahead);
    expect(run(formula, 'D-09', ahead)).toBe(true);
    expect(run(formula, 'D-10', ahead)).toBe(false);
    // Against the weekly start, where there is one, which is never blank.
    expect(formulaOf(DATED_SHAPES.inspected_before_start, context)).toBe(
      'bikes == 0 || (has(record.moment__inspected) && (record.moment__inspected < record.moment__start))',
    );
  });

  it('takes what a blank date means from the profile', () => {
    const blank = docksRead(blankInspectionTabs());
    const proposed = profileOf(blank, data);
    expect(
      proposed.columns.find((c) => c.column === 'last_inspected'),
    ).toMatchObject({ type: { kind: 'date' }, blanksSeen: true, blank: null });
    const unanswered = withProfile(DATED_DOCKS, confirmProfile(proposed));
    expect(
      unansweredBlanks(DATED_SHAPES.overdue, datedContext(unanswered, blank)),
    ).toEqual([{ column: 'last_inspected', label: 'last inspected' }]);
    const skipped = withProfile(
      DATED_DOCKS,
      confirmProfile(setColumnBlank(proposed, 'last_inspected', 'skip')),
    );
    const context = datedContext(skipped, blank);
    expect(unansweredBlanks(DATED_SHAPES.overdue, context)).toEqual([]);
    expect(formulaOf(DATED_SHAPES.overdue, context)).toBe(
      '!(has(record.moment__inspected)) || (record.moment__inspected <= 0.0 && (!((0.0 - record.moment__inspected) > double(constants.inspect_hours))))',
    );
    expect(sentenceOf(DATED_SHAPES.overdue, context)).toMatch(
      /Where the last inspection is blank, it does not apply\. Where the last inspection is after the data is read, it fails\.$/,
    );
    expect(overdue(context, 'D-06')).toBe(true);
  });

  it('shows its date in the worked example, with its time where it has one', () => {
    const working = (owner: DefinitionProcess, on: KeptRead) => {
      const context = datedContext(owner, on);
      return valuesInWords(
        DATED_SHAPES.overdue,
        context,
        'D-01',
        formulaContext(
          on,
          'D-01',
          owner.subject,
          {
            inputs: {},
            constants: { inspect_hours: 720 },
            groups: {},
          },
          {},
        ),
      );
    };
    expect(working(DATED_DOCKS, read)).toBe(
      'the hours from the last inspection to when the data is read is 391.5; 720 (“more than 720 hours”) is 720; the last inspection is Tue, 20 Oct 2026',
    );
    expect(working(DATETIME_DOCKS, docksRead(timedInspectionTabs()))).toMatch(
      /the last inspection is Tue, 20 Oct 2026, 08:45$/,
    );
  });

  it('works without a weekly opening: no start, dated moments and observed ones', () => {
    const records = fitting(read, UNOPENED_DOCKS.subject.data);
    expect(records.record('D-01')).not.toHaveProperty(momentColumn('start'));
    expect(records.record('D-01')[momentColumn('swept')]).toBe(-13.5);
    expect(records.record('D-01')[momentColumn('inspected')]).toBe(-391.5);
    expect(records.record('D-01').inspection_hours_left).toBe(-391.5);
    const context = datedContext(UNOPENED_DOCKS);
    expect(shapeProblems(DATED_SHAPES.overdue, context)).toEqual([]);
    expect(shapeProblems(DATED_SHAPES.inspected_before_start, context)).toEqual(
      ['No moment start; the moments are read, swept, inspected.'],
    );
  });

  it('reports a declaration that needs an opening it lacks, or dates a column without them, once', () => {
    const { problems } = recordsOf(read, MISDECLARED_DOCKS.subject.data);
    expect(problems).toEqual([
      'The process declares hours_to_lock as hours until a weekday and time, but no weekly opening to place it in: give it a dated column, or declare when the period opens.',
      'The process declares the moment lockout as a deadline, which is placed by the weekly opening, but declares none: give it a dated column, or declare when the period opens.',
      'The process declares the moment noted from the notes column, which is not typed as a date or date-time.',
    ]);
    expect(() => fitting(read, MISDECLARED_DOCKS.subject.data)).toThrow(
      /hours_to_lock/,
    );
  });

  it('tells a shape writer what a dated moment is, and hours since it', async () => {
    const finder = standIn(answer(FOUND));
    await findDefinitions(DATED_DOCKS, TEXT, 'v1', read, {
      resolve: () => finder,
    });
    const writer = writing(ANSWERS.fare_floor!);
    await writeDefinition(DATED_DOCKS, TEXT, read, 'fare_floor', {
      resolve: () => writer,
    });
    expect(told(writer)).toContain(
      '- inspected: the date in last_inspected; hours_since may read it, and fails where it is after the read',
    );
    const formulas = writing(ANSWERS.free_space!);
    await writeDefinition(DATED_DOCKS, TEXT, read, 'free_space', {
      resolve: () => formulas,
    });
    expect(told(formulas)).toContain(
      '- inspection_age_hours: how long ago the instant in last_inspected was; negative where it is still to come.',
    );
    expect(told(formulas)).toContain(
      'Dates and date-times (last_inspected) are ints',
    );
  });

  it('counts the date column as read by the rule that reads its moment', () => {
    const set: DefinitionSet = {
      hash: '',
      version: 'v1',
      intent: '',
      intentConfirmedAt: null,
      readId: read.id,
      foundAt: '',
      model: '',
      definitions: [
        {
          ...EARLIER[0]!,
          id: 'overdue',
          result: 'check',
          consequence: 'decide',
          formula: formulaOf(DATED_SHAPES.overdue, datedContext()),
        },
      ],
    };
    expect(
      debugDraft(DATED_DOCKS, TEXT, set, read).columns!.unread,
    ).not.toContain('last_inspected');
  });
});
