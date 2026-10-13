import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { definition, example } from './set.fixture';
import type { Definition } from './types';
import { TRIED } from './types';
import { workingOf } from './working';

// The app's working, as steps a person can follow: values in place, only the
// branches that apply, then each comparison and rounding reduced.

const read = capturedRead();
// The steps as read, the marks around a tried value left out.
const plain = (steps: string[] | undefined) =>
  steps?.map((step) => step.replaceAll(TRIED[0], '').replaceAll(TRIED[1], ''));
const stepsOf = (formula: string, more: Partial<Definition>) => {
  return plain(markedStepsOf(formula, more));
};
const markedStepsOf = (formula: string, more: Partial<Definition>) => {
  const item = definition('item', { formula, ...more });
  return workingOf(
    owner,
    {
      hash: 'x',
      version: 'v1',
      intent: '',
      intentConfirmedAt: null,
      readId: 'test',
      foundAt: '',
      model: '',
      definitions: [item],
    },
    read,
    item,
  )[0];
};

describe("the app's working", () => {
  it('reduces a comparison to its values', () => {
    expect(
      stepsOf('order % record.case_size == 0', {
        result: 'check',
        examples: [example(true, true, { inputs: { order: 16 } })],
      }),
    ).toEqual(['16 % 8 == 0', '0 == 0', 'true']);
  });

  it('works every condition through to true or false', () => {
    // AV-RR is the ripe product (a yes/no column, so true), so the first side
    // is false and the second decides. 14 on hand, 2 reserved, none inbound.
    expect(
      stepsOf(
        '!record.ripe || record.on_hand - record.reserved + record.inbound_before_start + order <= 65',
        {
          result: 'check',
          examples: [
            example(false, true, { key: 'AV-RR', inputs: { order: 60 } }),
          ],
        },
      ),
    ).toEqual([
      '!true || 14 - 2 + 0 + 60 <= 65',
      '!true || 72 <= 65',
      '!true || false',
      'false',
    ]);
  });

  it('follows the branch a group decides, and reduces the rounding', () => {
    // LM-04 is in neither group: 15% on its average of 10.
    expect(
      stepsOf(
        'ceil(double(record.weekend_1 + record.weekend_2 + record.weekend_3 + record.weekend_4) / double(constants.weeks) * (1.0 + double(key in groups.offer ? constants.up : constants.other) / 100.0))',
        {
          constants: [
            { id: 'weeks', value: 4, quote: 'four' },
            { id: 'up', value: 40, quote: '40%' },
            { id: 'other', value: 15, quote: '15%' },
          ],
          groups: [{ id: 'offer', keys: ['EG-06'], quote: 'eggs' }],
          examples: [example(12, true, { key: 'LM-04' })],
        },
      ),
    ).toEqual([
      'ceil(((9 + 11 + 10 + 10) / 4) * (1.0 + (15 / 100.0)))',
      'ceil(11.5)',
    ]);
  });

  it('shows each condition of a check on its way to the verdict', () => {
    // SD-01 arrives on Saturday (6) at 06:00 (360), before 07:00 (420).
    expect(
      stepsOf(
        'order == 0 || record.delivery_day < constants.saturday || (record.delivery_day == constants.saturday && record.delivery_time < constants.opening)',
        {
          result: 'check',
          constants: [
            { id: 'saturday', value: 6, quote: 'Saturday' },
            { id: 'opening', value: 420, quote: '07:00' },
          ],
          examples: [example(true, true, { inputs: { order: 40 } })],
        },
      ),
    ).toEqual([
      '40 == 0 || 6 < 6 || 6 == 6 && 360 < 420',
      'false || false || true && true',
      'true',
    ]);
  });

  it('marks the value an example tried, where it is put in', () => {
    expect(
      markedStepsOf('order % record.case_size == 0', {
        result: 'check',
        examples: [example(true, true, { inputs: { order: 16 } })],
      }),
    ).toEqual([`${TRIED[0]}16${TRIED[1]} % 8 == 0`, '0 == 0', 'true']);
  });

  it('shows a blank cell as absent, past an || that already holds', () => {
    // AV-RR has no supplier maximum: the first side holds, and the second,
    // which reads the blank cell, is never reached.
    expect(
      stepsOf(
        '!has(record.max_order_units) || order <= record.max_order_units',
        {
          result: 'check',
          examples: [
            example(true, true, { key: 'AV-RR', inputs: { order: 50 } }),
          ],
        },
      ),
    ).toEqual(['!false || 50 <= absent', 'true']);
  });
});
