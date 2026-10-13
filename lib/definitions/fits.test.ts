import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { fitsRead } from './fits';
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
