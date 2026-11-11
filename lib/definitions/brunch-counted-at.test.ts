import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
import { checkProposal } from './propose';
import { profileOf, withProfile } from './profile';
import { recordsOf, type DataTab, type KeptRead } from './records';
import { formulaOf, type ShapeContext } from './shapes';
import { dataProfileSchema, definitionSetSchema } from './types';

/*
  Brunch orders’ stock count, when the sheet gains a counted_at column: the
  date and time of a count, in the Stock tab, beside the weekday and time it
  was known by. weekly-timing.test.ts and brunch-unchanged.test.ts hold what
  a sheet without the column gives; this holds what one with it gives, on
  the accepted v3 rulebook and the confirmed data profile, which does not
  list the column. Only read here, never written.

  The captured read is Thursday 8 Oct 2026 17:03:15.658 in London (BST, so
  16:03:15.658Z). A count by its weekday and time, Thu 07:30, is 9.55 hours
  ago and Tue 18:00 is 47.05 hours ago. Every date below is worked out from
  that: e.g. Wed 7 Oct 07:30 is 33 h 33 m 15.658 s ago, 33.55 hours.
*/

const ACCEPTED =
  'fixtures/brunch-orders/rulebooks/v3-86c4ba5959e9/b1888d2d07c2.json';
const PROFILE = 'fixtures/brunch-orders/profile/481dc0e61bc1.json';

const set = definitionSetSchema.parse(
  JSON.parse(readFileSync(ACCEPTED, 'utf8')),
);
const profile = dataProfileSchema.parse(
  JSON.parse(readFileSync(PROFILE, 'utf8')),
);
const profiled = withProfile(owner, profile);

// A spreadsheet serial number: days since 30 Dec 1899, 7 Oct 2026 being 46302.
const SERIAL_OCT_8 = 46303;

// The Stock tab with a counted_at column, blank where `cells` says nothing.
function withCountedAt(cells: Record<string, string | number>): KeptRead {
  const tabs: DataTab[] = capturedTabs();
  const [header, ...rows] = tabs.find((tab) => tab.name === 'Stock')!.values;
  header!.push('counted_at');
  for (const row of rows) row[6] = cells[String(row[0])] ?? '';
  return capturedRead(tabs);
}

// Counts with a date: a text date-time, and date-time cells as serial numbers.
const CELLS: Record<string, string | number> = {
  // Bakery, 24 hours: Wed 7 Oct 07:30, 33.55 hours ago. Stale by its date;
  // its weekday and time, Thu 07:30, said 9.55.
  'SD-01': '2026-10-07 07:30',
  // Produce, 24: Thu 8 Oct 12:00 as a serial, 5.05 hours ago.
  'AV-RR': SERIAL_OCT_8 + 0.5,
  // Dairy, 48: Mon 5 Oct 07:30, 81.55 hours ago.
  'FT-200': '2026-10-05 07:30',
  // Produce, 24: Thu 8 Oct 07:30, 9.55 hours ago, as its weekday said.
  'LM-04': '2026-10-08 07:30',
  // Ambient, 168: Thu 24 Sep 07:30, 345.55 hours ago, though its weekday and
  // time, Thu 07:30, said 9.55.
  'CF-40': '2026-09-24 07:30',
};

// Each product's count age in hours, and the other with the date left blank.
const AGES: Record<string, number> = {
  'SD-01': 33.55,
  'AV-RR': 5.05,
  // Blank date, Tue 18:00: 47.05 hours ago, exactly as without the column.
  'AV-LS': 47.05,
  'EG-06': 9.55,
  'FT-200': 81.55,
  'LM-04': 9.55,
  'CT-250': 9.55,
  'RK-60': 9.55,
  'CF-40': 345.55,
  'SS-125': 9.55,
  'OO-500': 9.55,
};

const ageOf = (read: KeptRead, key: string) =>
  recordsOf(read, owner.subject.data).record(key);
const dated = withCountedAt(CELLS);

describe('Brunch orders’ stock count, dated', () => {
  it('reads each count as its date where the sheet has one, else its weekday and time', () => {
    for (const data of [owner.subject.data, profiled.subject.data]) {
      const records = recordsOf(dated, data);
      expect(records.problems).toEqual([]);
      for (const [key, age] of Object.entries(AGES)) {
        const record = records.record(key);
        expect(record.count_age_hours, key).toBe(age);
        expect(record.moment__counted, key).toBe(-age);
      }
    }
  });

  it('reads a sheet without the column as before, held to the confirmed profile or not', () => {
    expect(profile.columns.map((c) => c.column)).not.toContain('counted_at');
    for (const data of [owner.subject.data, profiled.subject.data]) {
      const records = recordsOf(capturedRead(), data);
      expect(records.problems).toEqual([]);
      expect(records.types.record).not.toHaveProperty('counted_at');
      expect(records.record('SD-01').count_age_hours).toBe(9.55);
      expect(records.record('AV-LS').count_age_hours).toBe(47.05);
    }
  });

  it('proposes a profile for a read with the column, typed by the declaration', () => {
    expect(
      profileOf(dated, owner.subject.data).columns.find(
        (c) => c.column === 'counted_at',
      ),
    ).toMatchObject({
      type: { kind: 'datetime', timeZone: 'Europe/London' },
      blanksSeen: true,
      blank: null,
    });
  });

  it('writes every shaped check of the accepted v3 rulebook as stored, on either read', () => {
    const shaped = set.definitions.filter((d) => d.shape);
    expect(shaped.map((d) => d.id)).toContain('stock_count_age_limit');
    for (const read of [capturedRead(), dated]) {
      for (const [i, d] of shaped.entries()) {
        const context: ShapeContext = {
          subject: profiled.subject,
          records: recordsOf(read, profiled.subject.data),
          read,
          consequence: d.consequence,
          constants: d.constants,
          groups: d.groups,
          earlier: set.definitions.slice(0, set.definitions.indexOf(d)),
        };
        expect(formulaOf(d.shape!, context), `${i} ${d.id}`).toBe(d.formula);
      }
    }
  });

  // The stock count age rule: not older than its category allows, for a
  // proposal of any order. Failing it is flagged for a person.
  const countAge = (read: KeptRead, key: string) =>
    checkProposal(profiled, set, read, key, { order: 8 }).checks.find(
      (c) => c.id === 'stock_count_age_limit',
    )!;

  it('flags a product counted longer ago than its category allows, by its date, and not one within it', () => {
    const flagged = Object.keys(AGES).filter(
      (key) => !countAge(dated, key).holds,
    );
    // SD-01 (bakery, 24 hours, counted 33.55 ago), FT-200 (dairy, 48; 81.55),
    // CF-40 (ambient, 168; 345.55), and AV-LS, whose blank date leaves its
    // weekday and time, Tue 18:00, 47.05 hours ago against produce's 24.
    expect(flagged.sort()).toEqual(['AV-LS', 'CF-40', 'FT-200', 'SD-01']);
    for (const key of ['AV-RR', 'LM-04']) {
      expect(countAge(dated, key), key).toMatchObject({
        applies: true,
        holds: true,
      });
    }
  });

  it('judges a product with a blank date by its weekday and time exactly as without the column', () => {
    for (const key of ['AV-LS', 'EG-06', 'CT-250', 'RK-60', 'SS-125', 'OO-500'])
      expect(countAge(dated, key), key).toEqual(countAge(capturedRead(), key));
    // Without a date the weekday and time flag it; with one, it is fresh.
    expect(countAge(capturedRead(), 'AV-LS').holds).toBe(false);
    const rescued = withCountedAt({ 'AV-LS': SERIAL_OCT_8 + 570 / 1440 });
    // Thu 8 Oct 09:30: 7.55 hours ago.
    expect(ageOf(rescued, 'AV-LS').count_age_hours).toBe(7.55);
    expect(countAge(rescued, 'AV-LS').holds).toBe(true);
  });

  it('refuses a count dated after the read, naming its cell', () => {
    const ahead = withCountedAt({
      'SD-01': '2026-10-09 07:30',
      'AV-RR': SERIAL_OCT_8 + 1.5,
    });
    for (const data of [owner.subject.data, profiled.subject.data])
      expect(recordsOf(ahead, data).problems).toEqual([
        'Stock!G2 (counted_at) reads "2026-10-09 07:30": it is after the data was read.',
        'Stock!G3 (counted_at) reads "46304.5": it is after the data was read.',
      ]);
  });
});
