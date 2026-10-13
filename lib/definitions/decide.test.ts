import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { accept, confirmIntent, deny } from './decide';
import { inScratchDirectory } from './scratch.fixture';
import { definition, example, keep, TEXT } from './set.fixture';
import { listRevisions } from './store';

// Accepting reruns the whole review on the version kept, against its read:
// whatever writing would refuse, accepting refuses too, with the reason.

inScratchDirectory();
const read = capturedRead();
const readOf = async (id: string) => (id === 'test' ? read : null);
const accepted = async (id: string, found = readOf) =>
  (await accept(owner, TEXT, id, found))!.definitions.find((d) => d.id === id)!;

// SD-01 sold 28 and 31 on the first two weekends.
const twoWeekends = definition('two_weekends', {
  formula: 'record.weekend_1 + record.weekend_2',
  examples: [example(59, true)],
});

describe('accepting a definition', () => {
  it('accepts one that passes, with its examples run again', async () => {
    await keep([twoWeekends]);
    const done = await accepted('two_weekends');
    expect(done.approvedAt).not.toBeNull();
    expect(done.problem).toBeNull();
    expect(done.examples[0]).toMatchObject({ actual: 59, agrees: true });
  });

  it('refuses a version that writes its numbers in, though its examples agree', async () => {
    await keep([
      definition('double_first', {
        formula: 'record.weekend_1 * 2',
        examples: [example(56, true)],
      }),
    ]);
    const done = await accepted('double_first');
    expect(done.approvedAt).toBeNull();
    expect(done.problem).toMatch(/^Not accepted: The formula writes 2 itself/);
  });

  it('refuses examples marked as agreeing that do not', async () => {
    await keep([
      definition('two_weekends', {
        formula: 'record.weekend_1 + record.weekend_2',
        examples: [example(99, true)],
      }),
    ]);
    const done = await accepted('two_weekends');
    expect(done.approvedAt).toBeNull();
    expect(done.examples[0]).toMatchObject({ actual: 59, agrees: false });
    expect(done.problem).toBe('1 of 1 examples disagree with the formula.');
  });

  it('refuses when the read its examples ran on is gone', async () => {
    await keep([twoWeekends]);
    const done = await accepted('two_weekends', async () => null);
    expect(done.approvedAt).toBeNull();
    expect(done.problem).toMatch(/no longer kept/);
  });

  it('keeps what a person says when they deny one', async () => {
    await keep([twoWeekends]);
    const set = await deny(owner, TEXT, 'two_weekends', '  Use all four.  ');
    expect(set!.definitions[0]).toMatchObject({
      approvedAt: null,
      denial: 'Use all four.',
    });
  });

  it('keeps the rulebook as a revision once its last decision completes it', async () => {
    const twoMore = definition('two_more', {
      formula: 'record.weekend_2 + record.weekend_1',
      examples: [example(59, true)],
    });
    await keep([twoWeekends, twoMore]);
    await accepted('two_weekends');
    await confirmIntent(owner, TEXT);
    expect((await listRevisions(owner, TEXT)).revisions).toEqual([]);
    await accepted('two_more');
    const { head, revisions } = await listRevisions(owner, TEXT);
    expect(revisions).toEqual([
      expect.objectContaining({ id: head, parent: null, reason: 'accepted' }),
    ]);
  });
});
