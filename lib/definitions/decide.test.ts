import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { accept, choose, confirmIntent, deny, rebaseSet } from './decide';
import {
  confirmProfile,
  profileOf,
  setColumnBlank,
  withProfile,
} from './profile';
import { recordsOf } from './records';
import { inScratchDirectory } from './scratch.fixture';
import { definition, example, keep, TEXT } from './set.fixture';
import { formulaOf, type Shape, type ShapeContext } from './shapes';
import {
  fingerprintOf,
  listRevisions,
  loadRevision,
  loadSet,
  putRevision,
  saveProfile,
} from './store';
import type { DataProfile, Definition } from './types';

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
    await confirmIntent(owner, TEXT, readOf);
    expect((await listRevisions(owner, TEXT)).revisions).toEqual([]);
    await accepted('two_more');
    const { head, revisions } = await listRevisions(owner, TEXT);
    expect(revisions).toEqual([
      expect.objectContaining({ id: head, parent: null, reason: 'accepted' }),
    ]);
  });
});

describe('completing a rulebook', () => {
  const approvedAt = '2026-11-10T01:00:00.000Z';
  const KEYS = [...recordsOf(read, owner.subject.data).keys].sort();

  it('keeps the keys of the read it was reviewed on, in the revision and the current rulebook', async () => {
    const twoMore = definition('two_more', {
      formula: 'record.weekend_2 + record.weekend_1',
      examples: [example(59, true)],
    });
    await keep([twoWeekends, twoMore]);
    await accepted('two_weekends');
    expect((await loadSet(owner, TEXT))?.acceptedKeys).toBeUndefined();
    await confirmIntent(owner, TEXT, readOf);
    expect((await loadSet(owner, TEXT))?.acceptedKeys).toBeUndefined();
    await accepted('two_more');
    const { head } = await listRevisions(owner, TEXT);
    const frozen = await loadRevision(owner, TEXT, head!);
    expect(frozen?.acceptedKeys).toEqual(KEYS);
    expect(KEYS).toContain('SD-01');
    // The current rulebook is the one the revision was made from.
    expect((await loadSet(owner, TEXT))?.acceptedKeys).toEqual(KEYS);
    expect(fingerprintOf(frozen!)).toBe(head);
  });

  it('keeps them when the intent is the last decision, and none when the read is gone', async () => {
    await keep([{ ...twoWeekends, approvedAt }]);
    const done = await confirmIntent(owner, TEXT, readOf);
    expect(done?.acceptedKeys).toEqual(KEYS);
    await keep([{ ...twoWeekends, approvedAt }], {
      intentConfirmedAt: approvedAt,
    });
    const gone = await confirmIntent(owner, TEXT, async () => null);
    expect(gone?.acceptedKeys).toBeUndefined();
  });
});

describe('choosing between versions', () => {
  it('takes the version, clears the split, and only then can be accepted', async () => {
    const version = (formula: string) => ({
      formula,
      constants: [],
      groups: [],
      uses: [],
      examples: [],
      model: 'test',
    });
    const set = await keep([
      definition('split', {
        result: 'check',
        formula: 'order == 0',
        agreement: {
          status: 'split',
          runs: 2,
          versions: [version('order == 0'), version('order == 1')],
          differences: [],
        },
      }),
    ]);
    expect(set.definitions[0]?.agreement?.status).toBe('split');
    const refused = await accept(owner, TEXT, 'split', async () =>
      capturedRead(),
    );
    expect(refused?.definitions[0]?.problem).toContain('choose one');
    const chosen = await choose(owner, TEXT, 'split', 1);
    expect(chosen?.definitions[0]).toMatchObject({
      formula: 'order == 1',
      agreement: { status: 'chosen' },
      approvedAt: null,
    });
  });
});

// A check written as a shape: its sentence comes from the shape, so the
// formula kept must be the one the shape gives.
const wholeSteps: Shape = {
  kind: 'step',
  field: 'order',
  at: null,
  amount: 'column:case_size',
  base: null,
  compare: null,
  target: null,
  margin_pct: null,
  when: [],
  only_for_group: null,
  only_for_when: [],
  if_blank: 'skip',
};
const shapeContext: ShapeContext = {
  subject: owner.subject,
  records: recordsOf(read, owner.subject.data),
  read,
  consequence: 'block',
  constants: [],
  groups: [],
  earlier: [],
};
const steps = (formula: string) =>
  definition('whole_cases', {
    result: 'check',
    consequence: 'block',
    shape: wholeSteps,
    formula,
    examples: [
      example(true, true, { inputs: { order: 16 } }),
      example(false, true, { inputs: { order: 15 } }),
      example(true, true, { key: 'AV-RR', inputs: { order: 20 } }),
      example(false, true, { key: 'AV-RR', inputs: { order: 25 } }),
    ],
  });

describe('accepting a definition written as a shape', () => {
  it('accepts the formula its shape gives', async () => {
    await keep([steps(formulaOf(wholeSteps, shapeContext))]);
    const done = await accepted('whole_cases');
    expect(done.problem).toBeNull();
    expect(done.approvedAt).not.toBeNull();
  });

  it('refuses a formula that is not the one its shape gives', async () => {
    // Behaves the same on every example, so only the shape can tell.
    await keep([steps(`${formulaOf(wholeSteps, shapeContext)} && true`)]);
    const done = await accepted('whole_cases');
    expect(done.approvedAt).toBeNull();
    expect(done.problem).toMatch(/not the one the rule as written gives/);
  });

  it('refuses a shape that no longer reads on this data', async () => {
    await keep([
      {
        ...steps('order % record.case_size == 0'),
        shape: { ...wholeSteps, amount: 'column:no_such_column' },
      },
    ]);
    const done = await accepted('whole_cases');
    expect(done.approvedAt).toBeNull();
    expect(done.problem).toMatch(/no longer reads on this data/);
  });
});

describe('choosing a version written as a shape', () => {
  it('takes its shape with its formula, so the sentence cannot say another', async () => {
    const version = (shape: Shape | null, formula: string, unfit?: string) => ({
      shape,
      unfit: unfit ?? null,
      formula,
      constants: [],
      groups: [],
      uses: [],
      examples: [],
      model: 'test',
    });
    const other: Shape = { ...wholeSteps, amount: 'column:max_order_units' };
    await keep([
      {
        ...steps('order == 0'),
        agreement: {
          status: 'split',
          runs: 2,
          versions: [
            version(other, 'order % record.max_order_units == 0'),
            version(null, 'order == 1', 'No shape says it.'),
          ],
          differences: [],
        },
      },
    ]);
    const first = await choose(owner, TEXT, 'whole_cases', 0);
    expect(first?.definitions[0]).toMatchObject({
      shape: other,
      unfit: null,
      formula: 'order % record.max_order_units == 0',
    });
    const second = await choose(owner, TEXT, 'whole_cases', 1);
    expect(second?.definitions[0]).toMatchObject({
      shape: null,
      unfit: 'No shape says it.',
      formula: 'order == 1',
    });
  });
});

// What a blank cell means is the data profile's, answered once by a person.
describe('a rule reading a column with blanks', () => {
  const freshSteps: Shape = { ...wholeSteps };
  delete freshSteps.if_blank;
  const atMost: Shape = {
    ...freshSteps,
    kind: 'limit',
    at: 'most',
    amount: 'column:max_order_units',
  };
  const proposed = profileOf(read, owner.subject.data);
  const unanswered = confirmProfile(proposed, '2026-11-10T00:00:00.000Z');
  const answered = confirmProfile(
    setColumnBlank(proposed, 'max_order_units', 'skip'),
    '2026-11-10T00:00:00.000Z',
  );
  const contextOn = (profile: DataProfile): ShapeContext => {
    const subject = withProfile(owner, profile).subject;
    return {
      ...shapeContext,
      subject,
      records: recordsOf(read, subject.data),
    };
  };
  const supplier = (profile: DataProfile, more: Partial<Definition> = {}) =>
    definition('supplier_most', {
      result: 'check',
      consequence: 'block',
      shape: atMost,
      formula: formulaOf(atMost, contextOn(profile)),
      examples: [
        example(true, true, { inputs: { order: 72 } }),
        example(false, true, { inputs: { order: 80 } }),
      ],
      ...more,
    });
  const whole = (profile: DataProfile) => ({
    ...steps(formulaOf(freshSteps, contextOn(profile))),
    shape: freshSteps,
  });
  const approvedAt = '2026-11-10T01:00:00.000Z';
  const kept = async (...definitions: Definition[]) => {
    await saveProfile(owner, unanswered);
    await saveProfile(owner, answered);
    return keep(definitions, { profileId: unanswered.id });
  };

  it('is refused until the meaning of a blank is answered, naming the column', async () => {
    await kept(supplier(unanswered));
    const refused = await accepted('supplier_most');
    expect(refused.approvedAt).toBeNull();
    expect(refused.problem).toBe(
      'Say what a blank cell means before accepting: the max order units. Does a rule reading one not apply, or fail?',
    );
    await rebaseSet(owner, TEXT, read, answered);
    const done = await accepted('supplier_most');
    expect(done.problem).toBeNull();
    expect(done.approvedAt).not.toBeNull();
  });

  it('is written again on a newer profile, and accepted again only where it changed', async () => {
    const first = await kept(supplier(unanswered, { approvedAt }), {
      ...whole(unanswered),
      approvedAt,
    });
    const revision = await putRevision(owner, first, { reason: 'accepted' });
    const rebased = (await rebaseSet(owner, TEXT, read, answered))!;
    expect(rebased.profileId).toBe(answered.id);
    const [most, cases] = rebased.definitions;
    expect(most!.formula).toBe(formulaOf(atMost, contextOn(answered)));
    expect(most!.formula).toMatch(/^!\(has\(record\.max_order_units\)\)/);
    expect(most!.approvedAt).toBeNull();
    expect(most!.problem).toBeNull();
    expect(cases!.formula).toBe(whole(unanswered).formula);
    expect(cases!.approvedAt).toBe(approvedAt);
    // The revision keeps the profile it was accepted on.
    expect((await loadRevision(owner, TEXT, revision))?.profileId).toBe(
      unanswered.id,
    );
  });

  it('agrees where two versions now behave alike', async () => {
    const version = (formula: string) => ({
      shape: atMost,
      unfit: null,
      formula,
      constants: [],
      groups: [],
      uses: [],
      examples: [],
      model: 'test',
    });
    await kept(
      supplier(unanswered, {
        agreement: {
          status: 'split',
          runs: 2,
          versions: [version('order == 0'), version('order == 1')],
          differences: [{ key: 'SD-01', inputs: {}, results: ['a', 'b'] }],
        },
      }),
    );
    const [most] = (await rebaseSet(owner, TEXT, read, answered))!.definitions;
    expect(most!.agreement).toMatchObject({
      status: 'agreed',
      differences: [],
    });
    expect(most!.agreement?.versions.map((v) => v.formula)).toEqual([
      most!.formula,
      most!.formula,
    ]);
  });

  it('refuses a profile nobody has confirmed', async () => {
    await kept(supplier(unanswered));
    await expect(rebaseSet(owner, TEXT, read, proposed)).rejects.toThrow(
      /confirmed/,
    );
  });
});
