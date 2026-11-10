import { describe, expect, it } from 'vitest';

import {
  BRUNCH_ORDERS_DEFINITIONS,
  SUBJECT,
} from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
import { checkFormula } from './formulas';
import { confirmProfile, profileOf, withProfile } from './profile';
import { fitting, namesOf, recordsOf, type DataTab } from './records';

// How a read becomes records, and every way it can fail to fit what the
// process declares, each said where a person can fix it.

const { data } = SUBJECT;
const problemsWith = (change: (tabs: DataTab[]) => void) => {
  const tabs = capturedTabs();
  change(tabs);
  return recordsOf(capturedRead(tabs), data).problems;
};
const tab = (tabs: DataTab[], name: string) =>
  tabs.find((t) => t.name === name)!.values;
const rowOf = (values: unknown[][], key: string) =>
  values.find((row) => row[0] === key)!;

describe('records from a read', () => {
  it('fit the declaration as captured', () => {
    const records = recordsOf(capturedRead(), data);
    expect(records.problems).toEqual([]);
    expect(records.keys).toContain('SD-01');
    expect(namesOf(capturedRead(), data)['SD-01']).toBe('Sourdough loaf 800g');
  });

  it('report a missing tab and a missing key column', () => {
    expect(
      problemsWith((tabs) => {
        tab(tabs, 'Sales').length = 0;
        tab(tabs, 'Stock')[0]![0] = 'id';
      }),
    ).toEqual([
      'The Stock tab has no sku column.',
      'The Sales tab is missing or empty.',
    ]);
  });

  it('report a key listed twice, and one the first tab does not list', () => {
    const found = problemsWith((tabs) => {
      const products = tab(tabs, 'Products');
      products.push([...rowOf(products, 'SD-01')]);
      tab(tabs, 'Stock').push(['ZZ-1', 1, 0, 0]);
    });
    expect(found).toEqual([
      expect.stringMatching(
        /^The Products tab lists sku SD-01 twice \(Products!A\d+\)/,
      ),
      'The Stock tab has sku ZZ-1, which the Products tab does not list.',
    ]);
  });

  it('report a cell that cannot be read as its type, by its cell', () => {
    const found = problemsWith((tabs) => {
      rowOf(tab(tabs, 'Deliveries'), 'SD-01')[2] = 'Saturdy';
    });
    expect(found).toEqual([
      expect.stringMatching(/^Deliveries!C2 \(delivery_day\) reads "Saturdy"/),
    ]);
  });

  it('report a record whose lookup finds no row', () => {
    const found = problemsWith((tabs) => {
      rowOf(tab(tabs, 'Products'), 'SD-01')[2] = 'bread';
    });
    expect(found).toEqual([
      'SD-01\'s category is "bread", which the Parameters tab does not list.',
    ]);
    expect(() =>
      fitting(
        capturedRead(
          (() => {
            const tabs = capturedTabs();
            rowOf(tab(tabs, 'Products'), 'SD-01')[2] = 'bread';
            return tabs;
          })(),
        ),
        data,
      ),
    ).toThrow(/does not fit what this process reads: SD-01's category/);
  });

  it('read a column of whole numbers and decimals as decimals throughout', () => {
    const records = recordsOf(capturedRead(), data);
    // Lemons cost 1.00, written as the whole number 1 among decimals.
    expect(records.types.record.regular_price).toBe('double');
    expect(records.record('LM-04').regular_price).toBe(1);
    expect(records.types.record.case_size).toBe('int');
  });
});

describe('columns worked out from when the data was read', () => {
  const at = (readAt: string) => ({ ...capturedRead(), readAt });
  const record = (readAt: string, key: string) =>
    recordsOf(at(readAt), data).record(key);

  it("give a count's age and the time left before the cutoff", () => {
    // Thursday 29 October 2026, 08:45 in London: the scheduled run.
    const thursday = '2026-10-29T08:45:00Z';
    expect(record(thursday, 'AV-LS').count_age_hours).toBe(38.75);
    expect(record(thursday, 'EG-06').count_age_hours).toBe(1.25);
    expect(record(thursday, 'EG-06').hours_until_cutoff).toBe(3.25);
    expect(record(thursday, 'SD-01').hours_until_cutoff).toBe(5.25);
  });

  it('are negative once the cutoff has passed for the coming weekend', () => {
    const friday = '2026-10-30T19:52:57.107Z';
    expect(record(friday, 'EG-06').hours_until_cutoff).toBe(-31.88);
    expect(record(friday, 'EG-06').count_age_hours).toBe(36.38);
  });

  it('stay out of the record when a cell they need is blank', () => {
    const tabs = capturedTabs();
    const stock = tab(tabs, 'Stock');
    rowOf(stock, 'EG-06')[stock[0]!.indexOf('counted_day')] = '';
    const records = recordsOf(capturedRead(tabs), data);
    expect(records.record('EG-06').count_age_hours).toBeUndefined();
    expect(records.types.record.count_age_hours).toBe('double');
  });
});

describe('records held to a data profile', () => {
  const profile = confirmProfile(profileOf(capturedRead(), data));
  const profiled = withProfile(BRUNCH_ORDERS_DEFINITIONS, profile).subject.data;
  const changedRead = (change: (tabs: DataTab[]) => void) => {
    const tabs = capturedTabs();
    change(tabs);
    return capturedRead(tabs);
  };
  const setColumn = (
    tabs: DataTab[],
    name: string,
    column: string,
    value: (old: unknown) => unknown,
  ) => {
    const [header, ...rows] = tab(tabs, name);
    const at = header!.indexOf(column);
    for (const row of rows) row[at] = value(row[at]);
  };

  it('reads the unchanged sheet as without a profile', () => {
    const plain = recordsOf(capturedRead(), data);
    const held = recordsOf(capturedRead(), profiled);
    expect(held.problems).toEqual([]);
    expect(held.keys).toEqual(plain.keys);
    for (const key of plain.keys) {
      expect(held.record(key)).toEqual(plain.record(key));
      expect(held.lookups(key)).toEqual(plain.lookups(key));
    }
    expect(held.types).toEqual(plain.types);
  });

  it('reports a decimal in a whole-number column by its cell, and keeps the type', () => {
    const read = changedRead((tabs) => {
      rowOf(tab(tabs, 'Stock'), 'AV-RR')[1] = 14.5;
    });
    // Without a profile the whole column turns decimal.
    expect(recordsOf(read, data).types.record.on_hand).toBe('double');
    const held = recordsOf(read, profiled);
    expect(held.problems).toEqual([
      'Stock!B3 (on_hand) reads "14.5": Expected a whole number.',
    ]);
    expect(held.types.record.on_hand).toBe('int');
    expect(held.record('AV-RR').on_hand).toBeUndefined();
    expect(held.record('SD-01').on_hand).toBe(0n);
  });

  it('keeps the type of a column blank throughout, so a guard still checks', () => {
    const read = changedRead((tabs) =>
      setColumn(tabs, 'Deliveries', 'max_order_units', () => ''),
    );
    const guarded =
      '!has(record.max_order_units) || order <= record.max_order_units';
    const scope = { values: {}, constants: {}, groups: [] };
    expect(recordsOf(read, data).types.record.max_order_units).toBeUndefined();
    expect(checkFormula(read, SUBJECT, scope, 'check', guarded)).toMatch(
      /No such key: max_order_units/,
    );
    const held = recordsOf(read, profiled);
    expect(held.problems).toEqual([]);
    expect(held.types.record.max_order_units).toBe('int');
    expect(
      checkFormula(
        read,
        { ...SUBJECT, data: profiled },
        scope,
        'check',
        guarded,
      ),
    ).toBeNull();
  });

  it('reports a column the profile lists that the read no longer has', () => {
    const read = changedRead((tabs) => {
      for (const row of tab(tabs, 'Stock')) row.splice(2, 1);
      for (const row of tab(tabs, 'Parameters')) row.splice(4, 1);
    });
    expect(recordsOf(read, data).problems).toEqual([]);
    expect(recordsOf(read, profiled).problems).toEqual([
      'None of the Products, Stock, Sales and Deliveries tabs has a reserved column, which the data profile lists.',
      'The Parameters tab has no safety_pct column, which the data profile lists.',
    ]);
  });

  it('reads a column the profile does not list as written, without a problem', () => {
    const read = changedRead((tabs) => {
      const sales = tab(tabs, 'Sales');
      sales[0]!.push('weekend_5');
      for (const row of sales.slice(1)) row.push(2.5);
    });
    const held = recordsOf(read, profiled);
    expect(held.problems).toEqual([]);
    expect(held.types.record.weekend_5).toBe('double');
  });

  it('reports a column the process now declares as another type than the profile', () => {
    const redeclared = {
      ...profiled,
      types: { ...profiled.types, ripe: { kind: 'text' as const } },
    };
    expect(recordsOf(capturedRead(), redeclared).problems).toEqual([
      'The process declares the ripe column as text, but the data profile has it as yes no: confirm the profile again.',
    ]);
  });

  it('reads a whole number in a decimal column as a decimal', () => {
    const read = changedRead((tabs) =>
      setColumn(tabs, 'Products', 'regular_price', (old) =>
        Math.round(Number(old)),
      ),
    );
    // Without a profile, every price whole makes the column whole numbers.
    expect(recordsOf(read, data).types.record.regular_price).toBe('int');
    const held = recordsOf(read, profiled);
    expect(held.problems).toEqual([]);
    expect(held.types.record.regular_price).toBe('double');
    expect(held.record('SD-01').regular_price).toBe(3);
    expect(typeof held.record('SD-01').regular_price).toBe('number');
  });
});
