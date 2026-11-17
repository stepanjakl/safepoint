import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { recordsOf } from './records';

/*
  Brunch orders’ weekly timing, held still while moments learn other forms:
  every worked-out column of every record, at three read times in London,
  as the code gave them before dated moments existed (captured from commit
  2fc3a72). A change that moves one is a change to the one real process.
*/

const COLUMNS = [
  'count_age_hours',
  'hours_until_cutoff',
  'moment__start',
  'moment__counted',
  'moment__cutoff',
  'moment__delivery',
] as const;

// Each record’s values in COLUMNS order.
const CAPTURED: Record<
  string,
  { when: string; rows: Record<string, number[]> }
> = {
  '2026-10-29T09:00:00.000Z': {
    when: 'Thursday 09:00',
    rows: {
      'SD-01': [1.5, 5, 46, -1.5, 5, 45],
      'AV-RR': [1.5, 3, 46, -1.5, 3, 21],
      'AV-LS': [39, 3, 46, -39, 3, 21],
      'EG-06': [1.5, 3, 46, -1.5, 3, 21],
      'FT-200': [1.5, 3, 46, -1.5, 3, 21],
      'LM-04': [1.5, 3, 46, -1.5, 3, 21],
      'CT-250': [1.5, 3, 46, -1.5, 3, 21],
      'RK-60': [1.5, 3, 46, -1.5, 3, 21],
      'CF-40': [1.5, 3, 46, -1.5, 3, 21],
      'SS-125': [1.5, 3, 46, -1.5, 3, 21],
      'OO-500': [1.5, 3, 46, -1.5, 3, 21],
    },
  },
  '2026-10-30T19:52:00.000Z': {
    when: 'Friday 19:52',
    rows: {
      'SD-01': [36.37, -29.87, 11.13, -36.37, -29.87, 10.13],
      'AV-RR': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
      'AV-LS': [73.87, -31.87, 11.13, -73.87, -31.87, 154.13],
      'EG-06': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
      'FT-200': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
      'LM-04': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
      'CT-250': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
      'RK-60': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
      'CF-40': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
      'SS-125': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
      'OO-500': [36.37, -31.87, 11.13, -36.37, -31.87, 154.13],
    },
  },
  '2026-10-31T08:30:00.000Z': {
    when: 'Saturday 08:30, after the opening',
    rows: {
      'SD-01': [49, 125.5, 166.5, -49, 125.5, 165.5],
      'AV-RR': [49, 123.5, 166.5, -49, 123.5, 141.5],
      'AV-LS': [86.5, 123.5, 166.5, -86.5, 123.5, 141.5],
      'EG-06': [49, 123.5, 166.5, -49, 123.5, 141.5],
      'FT-200': [49, 123.5, 166.5, -49, 123.5, 141.5],
      'LM-04': [49, 123.5, 166.5, -49, 123.5, 141.5],
      'CT-250': [49, 123.5, 166.5, -49, 123.5, 141.5],
      'RK-60': [49, 123.5, 166.5, -49, 123.5, 141.5],
      'CF-40': [49, 123.5, 166.5, -49, 123.5, 141.5],
      'SS-125': [49, 123.5, 166.5, -49, 123.5, 141.5],
      'OO-500': [49, 123.5, 166.5, -49, 123.5, 141.5],
    },
  },
};

describe('Brunch orders’ weekly moments', () => {
  it.each(Object.entries(CAPTURED))(
    'give the same hours read at %s',
    (readAt, { rows }) => {
      const records = recordsOf(
        { ...capturedRead(), readAt },
        owner.subject.data,
      );
      expect(records.problems).toEqual([]);
      expect(
        Object.fromEntries(
          records.keys.map((key) => [
            key,
            COLUMNS.map((column) => records.record(key)[column]),
          ]),
        ),
      ).toEqual(rows);
    },
  );
});
