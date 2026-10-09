import { describe, expect, it } from 'vitest';

import { SUBJECT } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
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
