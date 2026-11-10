import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { DRAFT_MODELS, WRITE_MODELS } from './calls';
import { capturedRead } from './captured.fixture';
import { answer, check, standIn, told, accountedFor } from './models.fixture';
import { findDefinitions } from './find';
import { inScratchDirectory } from './scratch.fixture';
import { definition, example as kept, keep, TEXT } from './set.fixture';
import { updateSet } from './store';
import type { Shape } from './shapes';
import type { Definition } from './types';
import { acceptable, canAccept } from './types';
import { writeAgreed, writeDefinition } from './write';

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

// A check answered as a shape, with examples as above.
const shaped = (
  more: Partial<Shape> & Pick<Shape, 'kind'>,
  examples: [string, number | null, unknown][],
) => ({
  constants: [],
  groups: [],
  shape: {
    field: more.kind === 'flag' ? null : 'order',
    at: null,
    amount: null,
    base: null,
    compare: null,
    target: null,
    margin_pct: null,
    when: [],
    only_for_group: null,
    only_for_when: [],
    ...more,
  },
  none_fits: null,
  examples: examples.map(([key, order, result]) => ({
    key,
    inputs: { order },
    result,
    why: 'Worked out by hand.',
  })),
});
// Enough: an order of at least the two weekends' sales.
const AT_LEAST_TWO_WEEKENDS = {
  kind: 'limit',
  at: 'least',
  amount: 'value:two_weekends',
} as const;

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
  const finder = standIn(answer(accountedFor(found, text)));
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
      shaped(AT_LEAST_TWO_WEEKENDS, [
        ['SD-01', 59, true],
        ['SD-01', 58, false],
      ]),
    );
    const set = await writeDefinition(owner, text, read, 'enough', {
      resolve: () => writer,
    });
    expect(told(writer)).toContain('two_weekends (a whole number, an int)');
    // A shape is told what it may name, and when start and read are.
    expect(told(writer)).toContain('value:two_weekends (Two weekends)');
    expect(told(writer)).toMatch(
      /start: when the planned period starts, Sat 07:00/,
    );
    expect(told(writer)).toMatch(/read: when the data was read, Thu 17:03/);
    // Clean on the first check: nothing more is asked.
    expect(writer.doGenerateCalls).toHaveLength(1);
    const enough = set!.definitions.find((i) => i.id === 'enough')!;
    expect(enough.problem).toBeNull();
    expect(enough.uses).toEqual(['two_weekends']);
  });

  describe('an answer that declares what its shape never reads', () => {
    const declared = {
      constants: [
        { id: 'spare', value: 3, quote: 'words nowhere in the text' },
      ],
      groups: [{ id: 'every', keys: ['SD-01', 'AV-RR'], quote: 'every one' }],
    };
    const examples: [string, number | null, unknown][] = [
      ['SD-01', 59, true],
      ['SD-01', 58, false],
    ];
    const withFirstNumber = () =>
      withFirst({
        formula: 'record.weekend_1 + record.weekend_2',
        examples: [example(true)],
      });

    it('passes on its first check, and is kept without them', async () => {
      await withFirstNumber();
      const writer = checking({
        ...shaped(AT_LEAST_TWO_WEEKENDS, examples),
        ...declared,
      });
      const set = await writeDefinition(owner, text, read, 'enough', {
        resolve: () => writer,
      });
      expect(writer.doGenerateCalls).toHaveLength(1);
      const enough = set!.definitions.find((d) => d.id === 'enough')!;
      expect(enough.problem).toBeNull();
      expect(enough.constants).toEqual([]);
      expect(enough.groups).toEqual([]);
      expect(enough.shape).toMatchObject(AT_LEAST_TWO_WEEKENDS);
    });

    it('is told what was dropped, in words that name no process', async () => {
      await withFirstNumber();
      const wrong = shaped(AT_LEAST_TWO_WEEKENDS, [
        ['SD-01', 40, true],
        ['SD-01', 58, false],
      ]);
      const writer = checking(
        { ...wrong, ...declared },
        { ...shaped(AT_LEAST_TWO_WEEKENDS, examples), ...declared },
      );
      const set = await writeDefinition(owner, text, read, 'enough', {
        resolve: () => writer,
      });
      expect(told(writer, 1)).toContain('constant spare');
      expect(told(writer, 1)).toContain('group every');
      // The wrong example is the only problem it was told of.
      expect(told(writer, 1)).not.toContain('never reads');
      expect(told(writer, 1)).not.toContain('are not in the instructions');
      const enough = set!.definitions.find((d) => d.id === 'enough')!;
      expect(enough.problem).toBeNull();
      expect(enough.constants).toEqual([]);
    });

    it('keeps the constant a shape does read', async () => {
      await withFirstNumber();
      const writer = checking({
        ...shaped({ kind: 'limit', at: 'most', amount: 'constant:spare' }, [
          ['SD-01', 2, true],
          ['SD-01', 3, false],
        ]),
        constants: [
          { id: 'spare', value: 2, quote: 'the first two weekends' },
          { id: 'other', value: 3, quote: 'the first two weekends' },
        ],
        groups: [],
      });
      const set = await writeDefinition(owner, text, read, 'enough', {
        resolve: () => writer,
      });
      const enough = set!.definitions.find((d) => d.id === 'enough')!;
      expect(enough.problem).toBeNull();
      expect(enough.constants.map((c) => c.id)).toEqual(['spare']);
    });
  });

  it('stops, without trying again, when it reads a number that does not work', async () => {
    await withFirst({
      formula: 'record.weekend_1',
      examples: [example(false)],
    });
    const writer = checking(
      shaped(AT_LEAST_TWO_WEEKENDS, [
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

describe('what a model is given of the definitions already written', () => {
  it('gets what they come to on every record, except what depends on a proposal', async () => {
    await withFirst({
      formula: 'record.weekend_1 + record.weekend_2',
      examples: [
        {
          key: 'SD-01',
          inputs: {},
          expect: 59,
          why: 'By hand.',
          actual: 59,
          error: null,
          agrees: true,
        },
      ],
    });
    const model = standIn(
      check(
        shaped(AT_LEAST_TWO_WEEKENDS, [
          ['SD-01', 59, true],
          ['SD-01', 1, false],
        ]),
      ),
    );
    await writeDefinition(owner, text, read, 'enough', {
      resolve: () => model,
    });
    const sent = told(model);
    expect(sent).toContain('worked out by the app');
    expect(sent).toContain('SD-01: two_weekends = 59');
    expect(sent).toContain('AV-RR: two_weekends = 44');
  });

  it('says what a disagreeing example read', async () => {
    await withFirst({
      formula: 'record.weekend_1 + record.weekend_2',
      examples: [
        {
          key: 'SD-01',
          inputs: {},
          expect: 59,
          why: 'By hand.',
          actual: 59,
          error: null,
          agrees: true,
        },
      ],
    });
    const wrong = shaped(AT_LEAST_TWO_WEEKENDS, [
      ['SD-01', 40, true],
      ['SD-01', 1, false],
    ]);
    const model = standIn(check(wrong), check(wrong), check(wrong));
    await writeDefinition(owner, text, read, 'enough', {
      resolve: () => model,
    });
    expect(told(model, 1)).toContain('For SD-01, two_weekends is 59');
  });
});

describe('writing a definition more than once', () => {
  const answerOf = (more: Partial<Shape> & Pick<Shape, 'kind'>) =>
    shaped(
      more,
      more.kind === 'limit'
        ? [
            ['SD-01', 8, true],
            ['SD-01', 9, false],
          ]
        : [
            ['SD-01', 8, true],
            ['SD-01', 5, false],
          ],
    );
  const WHOLE = { kind: 'step', amount: 'column:case_size' } as const;
  // The same shape, its column named without its kind.
  const WHOLE_REWORDED = { kind: 'step', amount: 'case_size' } as const;
  // Differs from WHOLE first at an order of 1.
  const OTHER = {
    kind: 'limit',
    at: 'most',
    amount: 'column:case_size',
  } as const;
  const refusal = (reason: string) => ({
    constants: [],
    groups: [],
    shape: null,
    none_fits: { reason, explain: 'The rule says or.' },
    examples: [],
  });
  const ID = 'enough';
  const written = async (...steps: ReturnType<typeof check>[]) => {
    await withFirst({
      formula: 'record.weekend_1 + record.weekend_2',
      examples: [
        {
          key: 'SD-01',
          inputs: {},
          expect: 59,
          why: 'By hand.',
          actual: 59,
          error: null,
          agrees: true,
        },
      ],
    });
    const model = standIn(...steps);
    const set = await writeAgreed(owner, text, read, ID, {
      resolve: () => model,
    });
    return { model, kept: set!.definitions.find((d) => d.id === ID)! };
  };

  it('keeps two that behave the same, worded differently or not, after two', async () => {
    const { model, kept } = await written(
      check(answerOf(WHOLE)),
      check(answerOf(WHOLE_REWORDED)),
    );
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(kept.shape).toMatchObject(WHOLE);
    expect(kept.formula).toContain('order % int(double(record.case_size))');
    expect(kept.agreement).toMatchObject({ status: 'agreed', runs: 2 });
  });

  it('cannot split two writes that differ only in what a blank means', async () => {
    const limit = {
      kind: 'limit',
      at: 'most',
      amount: 'column:max_order_units',
    } as const;
    const examples: [string, number, boolean][] = [
      ['SD-01', 8, true],
      ['SD-01', 80, false],
    ];
    // What a model sent before the profile said it; never read now.
    const { kept } = await written(
      check(shaped({ ...limit, if_blank: 'skip' }, examples)),
      check(shaped({ ...limit, if_blank: 'fail' }, examples)),
    );
    expect(kept.agreement).toMatchObject({
      status: 'agreed',
      differences: [],
    });
    expect(kept.shape).not.toHaveProperty('if_blank');
    expect(kept.agreement?.versions[1]?.shape).not.toHaveProperty('if_blank');
  });

  it('gives no write another’s answer', async () => {
    const { model } = await written(
      check(answerOf(WHOLE)),
      check(answerOf(WHOLE)),
    );
    expect(model.doGenerateCalls[1]?.prompt).toEqual(
      model.doGenerateCalls[0]?.prompt,
    );
  });

  it('leaves it to a person when they differ, with where, and no third write', async () => {
    const { model, kept } = await written(
      check(answerOf(WHOLE)),
      check(answerOf(OTHER)),
    );
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(kept.agreement).toMatchObject({ status: 'split', runs: 2 });
    expect(kept.agreement?.versions.map((v) => v.shape?.kind)).toEqual([
      'step',
      'limit',
    ]);
    expect(kept.agreement?.differences[0]).toMatchObject({
      inputs: { order: 1 },
      results: ['false', 'true'],
    });
    expect(canAccept(kept)).toBe(false);
    // It still works, so what reads it can be written.
    expect(acceptable(kept)).toBe(true);
  });

  // An answer in text ends a write with nothing checked.
  const noAnswer = () => answer('I cannot do that.');

  it('writes again when one does not pass, to have two to compare', async () => {
    const { model, kept } = await written(
      noAnswer(),
      check(answerOf(WHOLE)),
      check(answerOf(WHOLE_REWORDED)),
    );
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(kept.shape).toMatchObject(WHOLE);
    expect(kept.agreement).toMatchObject({ status: 'agreed', runs: 3 });
  });

  it('never compares a refusal: another write is asked for, and a shape wins', async () => {
    const { model, kept } = await written(
      check(refusal('needs_or')),
      check(refusal('needs_or')),
      check(answerOf(WHOLE)),
      check(refusal('needs_or')),
      check(refusal('needs_or')),
      check(answerOf(WHOLE_REWORDED)),
    );
    expect(model.doGenerateCalls).toHaveLength(6);
    expect(kept.shape).toMatchObject(WHOLE);
    expect(kept.unfit ?? null).toBeNull();
    // The second refusal hands the last write to the drafting model.
    expect(kept.agreement).toMatchObject({ status: 'agreed', runs: 4 });
    expect(kept.agreement?.versions.map((v) => v.model)).toEqual([
      WRITE_MODELS[0],
      DRAFT_MODELS[0],
    ]);
  });

  it('refuses the rule only when every write refuses, saying why', async () => {
    const { kept } = await written(
      ...Array.from({ length: 6 }, () => check(refusal('needs_or'))),
    );
    expect(kept.formula).toBeNull();
    expect(kept.unfit).toBe('The rule says or.');
    expect(kept.problem).toBe(
      'No shape can check this rule as written: it joins conditions with “or”. Rephrase it in the instructions, or write it again.',
    );
    expect(canAccept(kept)).toBe(false);
  });

  it('writes once on the drafting model after two refusals, standing alone with nothing to compare', async () => {
    const { model, kept } = await written(
      ...Array.from({ length: 4 }, () => check(refusal('needs_or'))),
      check(answerOf(WHOLE)),
      check(answerOf(WHOLE_REWORDED)),
    );
    expect(model.doGenerateCalls).toHaveLength(5);
    expect(kept.shape).toMatchObject(WHOLE);
    expect(kept.agreement).toMatchObject({ status: 'unconfirmed', runs: 3 });
    expect(kept.agreement?.versions.map((v) => v.model)).toEqual([
      DRAFT_MODELS[0],
    ]);
  });

  it('stores only what a shape’s kind reads', async () => {
    const { kept } = await written(
      check(answerOf({ ...WHOLE, at: 'most', target: 'column:on_hand' })),
      check(answerOf(WHOLE)),
    );
    expect(kept.shape).toMatchObject({ ...WHOLE, at: null, target: null });
    expect(kept.agreement).toMatchObject({ status: 'agreed', runs: 2 });
  });

  it('lets the drafting model’s refusal stand', async () => {
    const { model, kept } = await written(
      ...Array.from({ length: 8 }, () => check(refusal('needs_or'))),
    );
    // Two refusals on each of three writes: two light, one stronger.
    expect(model.doGenerateCalls).toHaveLength(6);
    expect(kept.unfit).toBe('The rule says or.');
    expect(kept.agreement?.versions.map((v) => v.model).at(-1)).toBe(
      DRAFT_MODELS[0],
    );
  });

  it('answers a first refusal with what shapes can do for its reason', async () => {
    const { model, kept } = await written(
      check(refusal('needs_other_arithmetic')),
      check(answerOf(WHOLE)),
      check(answerOf(WHOLE)),
    );
    expect(told(model, 1)).toContain('plus a margin in percent');
    expect(told(model, 1)).toContain('moment:<moment> before moment:read');
    expect(kept.shape).toMatchObject(WHOLE);
    expect(kept.agreement).toMatchObject({ status: 'agreed', runs: 2 });
  });

  it('takes no refusal without one of its reasons', async () => {
    const { model } = await written(
      check(refusal('too_hard')),
      check(answerOf(WHOLE)),
      check(answerOf(WHOLE)),
    );
    expect(told(model, 1)).toContain('too_hard');
  });

  it('stands alone, and says so, when only one of three passes', async () => {
    const { kept } = await written(
      check(answerOf(OTHER)),
      noAnswer(),
      noAnswer(),
    );
    expect(kept.shape).toMatchObject(OTHER);
    expect(kept.agreement).toMatchObject({ status: 'unconfirmed', runs: 3 });
    expect(canAccept(kept)).toBe(true);
  });

  it('keeps what it has when a later write cannot run', async () => {
    await withFirst({
      formula: 'record.weekend_1 + record.weekend_2',
      examples: [
        {
          key: 'SD-01',
          inputs: {},
          expect: 59,
          why: 'By hand.',
          actual: 59,
          error: null,
          agrees: true,
        },
      ],
    });
    const good = check(answerOf(WHOLE));
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        if (calls === 1) return good;
        throw new Error('The service went away.');
      },
    });
    const set = await writeAgreed(owner, text, read, ID, {
      resolve: () => model,
    });
    const kept = set!.definitions.find((d) => d.id === ID)!;
    expect(kept.agreement?.status).toBe('unconfirmed');
    expect(kept.problem).toContain('Could not be compared');
  });
});

describe('what a model fills in for a check', () => {
  it('has no word on blank cells: the data profile says that', async () => {
    await withFirst({
      formula: 'record.weekend_1 + record.weekend_2',
      examples: [example(true)],
    });
    const model = checking(
      shaped({ ...AT_LEAST_TWO_WEEKENDS }, [
        ['SD-01', 59, true],
        ['SD-01', 58, false],
      ]),
    );
    await writeDefinition(owner, text, read, 'enough', {
      resolve: () => model,
    });
    const tools = JSON.stringify(model.doGenerateCalls[0]?.tools);
    expect(tools).toContain('only_for_when');
    expect(tools).not.toContain('if_blank');
    expect(told(model)).not.toContain('if_blank');
  });
});

describe('a formula that cannot run on every record', () => {
  it('is refused, naming them, however good its examples', async () => {
    await withFirst({});
    // Only SD-01 has a maximum in the data.
    const blank = written('record.max_order_units', [
      ['SD-01', null, 72],
      ['SD-01', null, 72],
    ]);
    const fixed = written(
      'has(record.max_order_units) ? record.max_order_units : 0',
      [
        ['SD-01', null, 72],
        ['AV-RR', null, 0],
      ],
    );
    const model = standIn(check(blank), check(fixed));
    const set = await writeDefinition(owner, text, read, 'two_weekends', {
      resolve: () => model,
    });
    expect(told(model, 1)).toContain('It cannot be worked out for');
    expect(told(model, 1)).toContain('AV-RR');
    expect(set!.definitions.find((d) => d.id === 'two_weekends')?.formula).toBe(
      fixed.formula,
    );
  });

  it('cannot come from a shape, whose blanks fail where nothing says otherwise', async () => {
    await withFirst({});
    const model = standIn(
      check(
        shaped(
          { kind: 'limit', at: 'most', amount: 'column:max_order_units' },
          [
            ['SD-01', 8, true],
            ['SD-01', 80, false],
            ['AV-RR', 1000, false],
          ],
        ),
      ),
    );
    const set = await writeDefinition(owner, text, read, 'enough', {
      resolve: () => model,
    });
    const enough = set!.definitions.find((d) => d.id === 'enough')!;
    expect(enough.problem).toBeNull();
    expect(model.doGenerateCalls).toHaveLength(1);
  });
});
