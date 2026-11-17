import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
import { fitsRead } from './fits';
import { confirmProfile, profileOf, withProfile } from './profile';
import { recordsOf, type DataTab } from './records';
import { TEXT } from './set.fixture';
import { definitionSetSchema } from './types';

// A revision is kept as it was accepted; one written before a column's type
// changed must be found on use, not read wrongly in silence.

const set = definitionSetSchema.parse(
  JSON.parse(readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8')),
);
const read = capturedRead();

describe('whether a rulebook fits a read', () => {
  it('fits the read it was accepted on', () => {
    expect(fitsRead(owner, TEXT, set, read)).toEqual([]);
  });

  it('finds a formula that reads a yes/no column as text', () => {
    const ripe = set.definitions.find((d) =>
      d.formula?.includes('record.ripe'),
    );
    expect(ripe).toBeDefined();
    const old = {
      ...set,
      definitions: set.definitions.map((d) =>
        d === ripe
          ? {
              ...d,
              formula: d.formula!.replace(
                '!record.ripe',
                '!(record.ripe == "yes")',
              ),
            }
          : d,
      ),
    };
    expect(fitsRead(owner, TEXT, old, read)).toEqual([
      expect.objectContaining({
        id: ripe!.id,
        problem: expect.stringMatching(/bool == string/),
      }),
    ]);
  });
});

// A real accepted rulebook, read only: one decimal or one blank column in a
// week's data must not refuse it once the data has a profile.
describe('an accepted rulebook on a read held to a data profile', () => {
  const accepted = definitionSetSchema.parse(
    JSON.parse(
      readFileSync(
        'fixtures/brunch-orders/rulebooks/v2-91823c6c8281/5b895575e4e7.json',
        'utf8',
      ),
    ),
  );
  const profile = confirmProfile(profileOf(capturedRead(), owner.subject.data));
  const profiled = withProfile(owner, profile);
  const onProfile = { ...accepted, profileId: profile.id };
  const changed = (change: (tabs: DataTab[]) => void) => {
    const tabs = capturedTabs();
    change(tabs);
    return capturedRead(tabs);
  };
  const columnOf = (tabs: DataTab[], name: string, column: string) => {
    const [header, ...rows] = tabs.find((t) => t.name === name)!.values;
    return { at: header!.indexOf(column), rows };
  };
  const decimalStock = changed((tabs) => {
    const { at, rows } = columnOf(tabs, 'Stock', 'on_hand');
    rows.find((row) => row[0] === 'AV-RR')![at] = 14.5;
  });
  const noLimits = changed((tabs) => {
    const { at, rows } = columnOf(tabs, 'Deliveries', 'max_order_units');
    for (const row of rows) row[at] = '';
  });

  it('fits the read it was accepted on, either way', () => {
    expect(fitsRead(owner, TEXT, accepted, read)).toEqual([]);
    expect(fitsRead(profiled, TEXT, onProfile, read)).toEqual([]);
  });

  it('without a profile, is refused for one decimal stock count (as before)', () => {
    expect(fitsRead(owner, TEXT, accepted, decimalStock)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'order_ripe_avocados_limit',
          problem: expect.stringMatching(/no such overload: double - int/),
        }),
      ]),
    );
  });

  it('with a profile, reports the cell as a read problem and still fits', () => {
    expect(fitsRead(profiled, TEXT, onProfile, decimalStock)).toEqual([]);
    expect(recordsOf(decimalStock, profiled.subject.data).problems).toEqual([
      'Stock!B3 (on_hand) reads "14.5": Expected a whole number.',
    ]);
  });

  it('without a profile, is refused for a column blank throughout (as before)', () => {
    expect(fitsRead(owner, TEXT, accepted, noLimits)).toEqual([
      expect.objectContaining({
        id: 'supplier_delivery_limit',
        problem: expect.stringMatching(/No such key: max_order_units/),
      }),
    ]);
  });

  it('with a profile, still fits a column blank throughout', () => {
    expect(fitsRead(profiled, TEXT, onProfile, noLimits)).toEqual([]);
    expect(recordsOf(noLimits, profiled.subject.data).problems).toEqual([]);
  });

  it('refuses to check a rulebook on a profile it was not drafted on', () => {
    expect(() => fitsRead(owner, TEXT, onProfile, read)).toThrow(/not loaded/);
  });
});
