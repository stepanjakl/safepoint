import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { accountingProblems, findDefinitions, sentencesOf } from './find';
import { answer, standIn, told } from './models.fixture';
import { confirmProfile, profileOf, withProfile } from './profile';
import { inScratchDirectory } from './scratch.fixture';
import { loadSet } from './store';

// Finding accounts for every sentence of the instructions, and code holds it to
// that. The instructions here have nothing to do with the process on purpose:
// nothing in this may depend on a scenario.

const definition = (id: string, result: 'number' | 'check') => ({
  id,
  name: id,
  text: id,
  result,
  consequence: result === 'check' ? ('block' as const) : null,
});
const TEXT = `We sell milk at the corner shop.
Expected sales are last week's sales plus 10%.
Rules
1. Order in whole crates.
2. If we can't cover expected sales, flag it for a person.`;
const SENTENCES = sentencesOf(TEXT);
const EXPECTED = definition('expected_sales', 'number');
const CRATES = definition('whole_crates', 'check');
const COVER = definition('cover_sales', 'check');
type Found = Parameters<typeof accountingProblems>[1];
const right: Found = {
  intent: 'Order enough milk.',
  definitions: [EXPECTED, CRATES, COVER],
  sentences: [
    { n: 1, kind: 'context' as const, definitions: [] },
    { n: 2, kind: 'quantity' as const, definitions: ['expected_sales'] },
    { n: 3, kind: 'context' as const, definitions: [] },
    { n: 4, kind: 'check' as const, definitions: ['whole_crates'] },
    { n: 5, kind: 'check' as const, definitions: ['cover_sales'] },
  ],
};
const replacing = (
  n: number,
  sentence: Partial<Found['sentences'][number]>,
): Found => ({
  ...right,
  sentences: right.sentences.map((s) =>
    s.n === n ? { ...s, ...sentence } : s,
  ),
});

describe('the instructions as sentences', () => {
  it('drops list marks, and keeps a heading or a rule with no stop', () => {
    expect(
      sentencesOf('Rules\n1. Order cases.\n2) Never on Sunday\n- Ask first.'),
    ).toEqual(['Rules', 'Order cases.', 'Never on Sunday', 'Ask first.']);
  });

  it('keeps a list item whole, however many stops it has', () => {
    expect(
      sentencesOf(
        '1. Aim for enough. If that fails, ask.\n- One. Two.\nProse one. Prose two.',
      ),
    ).toEqual([
      'Aim for enough. If that fails, ask.',
      'One. Two.',
      'Prose one.',
      'Prose two.',
    ]);
  });

  it('keeps decimals and times whole, and splits on a stop before a space', () => {
    expect(sentencesOf('Add 1.5 units by 07:00. Then stop! Why?')).toEqual([
      'Add 1.5 units by 07:00.',
      'Then stop!',
      'Why?',
    ]);
  });

  it('ignores blank lines', () => {
    expect(sentencesOf('One.\n\n  \nTwo.')).toEqual(['One.', 'Two.']);
  });
});

describe('what code holds the account to', () => {
  const problems = (found: Found) => accountingProblems(SENTENCES, found);

  it('passes one that accounts for everything', () => {
    expect(problems(right)).toEqual([]);
  });

  it('refuses a sentence left out', () => {
    expect(
      problems({
        ...right,
        sentences: right.sentences.filter((s) => s.n !== 1),
      }),
    ).toEqual(['Not accounted for: sentence 1.']);
  });

  it('refuses a sentence twice, and one that does not exist', () => {
    expect(
      problems({
        ...right,
        sentences: [
          ...right.sentences,
          right.sentences[0]!,
          { n: 9, kind: 'context', definitions: [] },
        ],
      }),
    ).toEqual([
      'Sentence 1 is accounted for twice.',
      'There is no sentence 9.',
    ]);
  });

  it('refuses a quantity with no calculation listed', () => {
    expect(problems({ ...right, definitions: [CRATES, COVER] })).toEqual([
      expect.stringContaining('belongs to expected_sales, which is not listed'),
    ]);
  });

  it('refuses a quantity read as a check, and the reverse', () => {
    expect(problems(replacing(2, { kind: 'check' }))[0]).toContain(
      'expected_sales is a number',
    );
    expect(problems(replacing(4, { kind: 'quantity' }))[0]).toContain(
      'whole_crates is a check',
    );
  });

  it('refuses a stated sentence with no definition, and context with one', () => {
    expect(problems(replacing(4, { definitions: [] }))).toContain(
      'Sentence 4 is a check, but belongs to no definition; list the definition it states.',
    );
    expect(
      problems(replacing(1, { definitions: ['whole_crates'] }))[0],
    ).toContain('Sentence 1 is context');
  });

  it('refuses a definition no sentence states', () => {
    expect(
      problems({
        ...right,
        definitions: [...right.definitions, definition('invented', 'check')],
      }),
    ).toEqual([expect.stringContaining('No sentence states invented')]);
  });

  it('allows one sentence two definitions, and reads ids as they are stored', () => {
    expect(
      problems({
        ...right,
        definitions: [{ ...EXPECTED, id: 'Expected Sales' }, CRATES, COVER],
        sentences: [
          ...right.sentences.slice(0, 1),
          { n: 2, kind: 'quantity', definitions: ['expected-sales'] },
          ...right.sentences.slice(2, 3),
          { n: 4, kind: 'check', definitions: ['whole_crates', 'cover_sales'] },
          { n: 5, kind: 'check', definitions: ['cover_sales'] },
        ],
      }),
    ).toEqual([]);
  });
});

describe('finding', () => {
  inScratchDirectory();
  const find = (model: ReturnType<typeof standIn>) =>
    findDefinitions(owner, TEXT, 'v1', capturedRead(), {
      resolve: () => model,
    });

  it('keeps the account with the set, by sentence', async () => {
    await find(standIn(answer(right)));
    const set = await loadSet(owner, TEXT);
    expect(set?.accounting?.[1]).toEqual({
      sentence: "Expected sales are last week's sales plus 10%.",
      kind: 'quantity',
      definitions: ['expected_sales'],
    });
    expect(set?.accounting).toHaveLength(SENTENCES.length);
  });

  it('sends the sentences numbered', async () => {
    const model = standIn(answer(right));
    await find(model);
    expect(told(model)).toContain('2. Expected sales are last week');
    expect(told(model)).not.toContain('Your last answer');
  });

  it('asks once more with what was wrong, and keeps the better answer', async () => {
    const model = standIn(
      answer({ ...right, definitions: [CRATES, COVER] }),
      answer(right),
    );
    const set = await find(model);
    expect(told(model, 1)).toContain('Your last answer did not account');
    expect(told(model, 1)).toContain('expected_sales');
    expect(set.definitions.map((d) => d.id)).toContain('expected_sales');
  });

  it('replaces nothing when the second answer is no better', async () => {
    await find(standIn(answer(right)));
    const wrong = { ...right, definitions: [CRATES, COVER] };
    await expect(find(standIn(answer(wrong), answer(wrong)))).rejects.toThrow(
      /did not account for the instructions, so nothing was replaced/,
    );
    const kept = await loadSet(owner, TEXT);
    expect(kept?.definitions.map((d) => d.id)).toContain('expected_sales');
  });

  it('records the confirmed data profile the set is drafted on', async () => {
    const proposed = profileOf(capturedRead(), owner.subject.data);
    const confirmed = confirmProfile(proposed);
    const on = (profiled: typeof owner) =>
      findDefinitions(profiled, TEXT, 'v1', capturedRead(), {
        resolve: () => standIn(answer(right)),
      });
    expect((await on(owner)).profileId).toBeUndefined();
    expect((await on(withProfile(owner, proposed))).profileId).toBeUndefined();
    expect((await on(withProfile(owner, confirmed))).profileId).toBe(
      confirmed.id,
    );
    expect((await loadSet(owner, TEXT))?.profileId).toBe(confirmed.id);
  });

  it('accepts instructions with no calculation at all', () => {
    const text = 'Rules\n1. Nobody works over the limit.';
    expect(
      accountingProblems(sentencesOf(text), {
        intent: 'Keep to the limit.',
        definitions: [definition('limit', 'check')],
        sentences: [
          { n: 1, kind: 'context', definitions: [] },
          { n: 2, kind: 'check', definitions: ['limit'] },
        ],
      }),
    ).toEqual([]);
  });
});
