import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { answer, check, standIn, told } from './models.fixture';
import { findDefinitions } from './find';
import { inScratchDirectory } from './scratch.fixture';
import { definition, example as kept, keep, TEXT } from './set.fixture';
import { updateSet } from './store';
import type { Definition } from './types';
import { writeDefinition } from './write';

// Drafting against stand-in models, kept in a scratch directory: what the
// model is told, and what is kept when an attempt fails
// (docs/processes/brunch-orders/PLAN.md, phase 2b).

const read = capturedRead();
// A writer that answers through check_definition, one draft per step.
const checking = (...drafts: unknown[]) => standIn(...drafts.map(check));

const text =
  'Start from the sales of the first two weekends. Order enough to cover them.';

// A written answer, with examples on SD-01 (28 and 31 over the first two
// weekends) and AV-RR.
const written = (
  formula: string,
  examples: [string, number | null, unknown][],
) => ({
  constants: [],
  groups: [],
  formula,
  examples: examples.map(([key, order, result]) => ({
    key,
    inputs: { order },
    result,
    why: 'Worked out by hand.',
  })),
});

const found = {
  intent: 'Order enough.',
  definitions: [
    {
      id: 'two_weekends',
      name: 'Two weekends',
      text: 'The sales of the first two weekends',
      result: 'number',
      consequence: null,
    },
    {
      id: 'enough',
      name: 'Enough',
      text: 'Order enough to cover them.',
      result: 'check',
      consequence: 'decide',
    },
  ],
};

inScratchDirectory();

// The found set, with the first definition written as given.
async function withFirst(first: Partial<Definition>) {
  const finder = standIn(answer(found));
  await findDefinitions(owner, text, 'v1', read, { resolve: () => finder });
  return {
    finder,
    ...(await updateSet(owner, text, (s) => ({
      ...s,
      definitions: s.definitions.map((d) =>
        d.id === 'two_weekends' ? { ...d, ...first } : d,
      ),
    }))),
  };
}
const example = (agrees: boolean) => ({
  key: 'SD-01',
  inputs: {},
  expect: 59,
  why: '',
  actual: agrees ? 59 : 0,
  error: null,
  agrees,
});

describe('drafting', () => {
  it('shows the model what the data already holds when finding', async () => {
    const { finder } = await withFirst({});
    expect(told(finder)).toContain('Sales: sku, weekend_1, weekend_2');
    expect(told(finder)).toContain("one step of another number's working");
  });

  it('says whether an earlier number is whole or a decimal', async () => {
    await withFirst({
      formula: 'record.weekend_1 + record.weekend_2',
      examples: [example(true)],
    });
    const writer = checking(
      written('order >= values.two_weekends', [
        ['SD-01', 59, true],
        ['SD-01', 58, false],
      ]),
    );
    const set = await writeDefinition(owner, text, read, 'enough', {
      resolve: () => writer,
    });
    expect(told(writer)).toContain('two_weekends (a whole number, an int)');
    // Clean on the first check: nothing more is asked.
    expect(writer.doGenerateCalls).toHaveLength(1);
    const enough = set!.definitions.find((i) => i.id === 'enough')!;
    expect(enough.problem).toBeNull();
    expect(enough.uses).toEqual(['two_weekends']);
  });

  it('stops, without trying again, when it reads a number that does not work', async () => {
    await withFirst({
      formula: 'record.weekend_1',
      examples: [example(false)],
    });
    const writer = checking(
      written('order >= values.two_weekends', [
        ['SD-01', 59, true],
        ['SD-01', 58, false],
      ]),
    );
    const set = await writeDefinition(owner, text, read, 'enough', {
      resolve: () => writer,
    });
    expect(told(writer)).toContain(
      'Not working yet, so never read: two_weekends',
    );
    expect(writer.doGenerateCalls).toHaveLength(1);
    const enough = set!.definitions.find((i) => i.id === 'enough')!;
    expect(enough.formula).toBeNull();
    expect(enough.problem).toMatch(
      /reads Two weekends, which does not work yet/,
    );
  });

  it('lets the model correct its own example, in one conversation', async () => {
    await withFirst({});
    const writer = checking(
      // SD-01 sold 28 on the first weekend, not 99: the check says so.
      written('record.weekend_1', [
        ['SD-01', null, 99],
        ['AV-RR', null, 21],
      ]),
      written('record.weekend_1', [
        ['SD-01', null, 28],
        ['AV-RR', null, 21],
      ]),
    );
    const set = await writeDefinition(owner, text, read, 'two_weekends', {
      resolve: () => writer,
    });
    expect(told(writer, 1)).toContain(
      'you worked out 99, the formula gives 28',
    );
    const first = set!.definitions.find((i) => i.id === 'two_weekends')!;
    expect(first.problem).toBeNull();
    expect(first.examples.every((e) => e.agrees)).toBe(true);
  });

  it('refuses a name the formula cannot read before running it', async () => {
    await withFirst({});
    const writer = checking(
      written('group.kit.contains(key) ? 1 : 0', [
        ['SD-01', null, 1],
        ['AV-RR', null, 1],
      ]),
      written('record.weekend_1', [
        ['SD-01', null, 28],
        ['AV-RR', null, 21],
      ]),
    );
    await writeDefinition(owner, text, read, 'two_weekends', {
      resolve: () => writer,
    });
    expect(told(writer, 1)).toContain(
      '\\"group\\" is not a variable here; a formula reads key, record, category, order',
    );
  });

  it('keeps the last draft that ran, with its own problem', async () => {
    await withFirst({});
    const stray = written('record.weekend_1 * 2', [
      ['SD-01', null, 56],
      ['AV-RR', null, 42],
    ]);
    const writer = checking(
      // Runs, but SD-01 sold 28 on the first weekend, not 99.
      written('record.weekend_1', [
        ['SD-01', null, 99],
        ['AV-RR', null, 21],
      ]),
      // Writes a number into the formula, three times over: it stops there.
      stray,
      stray,
      stray,
    );
    const set = await writeDefinition(owner, text, read, 'two_weekends', {
      resolve: () => writer,
    });
    const first = set!.definitions.find((i) => i.id === 'two_weekends')!;
    expect(writer.doGenerateCalls).toHaveLength(4);
    expect(first.formula).toBe('record.weekend_1');
    expect(first.problem).toBe('1 of 2 examples disagree with the formula.');
  });

  it('ends, keeping what ran, when the model answers without the check', async () => {
    await withFirst({});
    const writer = standIn(answer('Done.'));
    const set = await writeDefinition(owner, text, read, 'two_weekends', {
      resolve: () => writer,
    });
    const first = set!.definitions.find((i) => i.id === 'two_weekends')!;
    expect(first.formula).toBeNull();
    expect(first.problem).toBe('No answer was checked.');
  });

  it('withdraws approval from what reads a rewritten definition, and only that', async () => {
    await keep([
      definition('two_weekends', {
        formula: 'record.weekend_1',
        examples: [kept(28, true)],
        approvedAt: 'earlier',
      }),
      definition('enough', {
        result: 'check',
        consequence: 'decide',
        uses: ['two_weekends'],
        approvedAt: 'earlier',
      }),
      definition('cases', {
        result: 'check',
        consequence: 'block',
        approvedAt: 'earlier',
      }),
    ]);
    const writer = checking(
      written('record.weekend_1 + record.weekend_2', [
        ['SD-01', null, 59],
        ['AV-RR', null, 44],
      ]),
    );
    const set = await writeDefinition(owner, TEXT, read, 'two_weekends', {
      resolve: () => writer,
    });
    const approved = Object.fromEntries(
      set!.definitions.map((d) => [d.id, d.approvedAt]),
    );
    expect(approved).toEqual({
      two_weekends: null,
      enough: null,
      cases: 'earlier',
    });
  });
});
