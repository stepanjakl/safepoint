import type { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { capturedRead } from '@/lib/definitions/captured.fixture';
import { always, answer } from '@/lib/definitions/models.fixture';
import {
  confirmProfile,
  profileOf,
  withProfile,
} from '@/lib/definitions/profile';
import { recordsOf } from '@/lib/definitions/records';
import { inScratchStorage } from '@/lib/definitions/scratch.fixture';
import { definition, example, keep, TEXT } from '@/lib/definitions/set.fixture';
import { formulaOf, type Shape } from '@/lib/definitions/shapes';
import {
  CONFIRM_FIRST,
  type DataProfile,
  type WrittenVersion,
} from '@/lib/definitions/types';
import { DRAFTING_MODELS } from '@/lib/models';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import {
  listRevisions,
  loadProfile,
  loadSet,
  putRevision,
  saveProfile,
} from '@/server/storage/rulebooks';

import { caller, failure } from '../run.fixture';

// The rules, called in process on a scratch directory. The read is the
// captured one; the jobs that ask a model, and the advice, are stand-ins, so
// nothing reaches the network and no quota is spent.

const { startDraft, startRewrite, model } = vi.hoisted(() => ({
  startDraft: vi.fn(),
  startRewrite: vi.fn(),
  model: { current: null as unknown },
}));
vi.mock('@/server/storage/brunch-orders-reads', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/server/storage/brunch-orders-reads')
  >()),
  keptRead: async (id: string) =>
    id === 'test'
      ? (await import('@/lib/definitions/captured.fixture')).capturedRead()
      : null,
}));
vi.mock('@/server/jobs/draft', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/jobs/draft')>()),
  startDraft,
  startRewrite,
}));
vi.mock('@/lib/definitions/advise', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/definitions/advise')>();
  return {
    ...actual,
    advise: (...[o, t, s, r, id]: Parameters<typeof actual.advise>) =>
      actual.advise(o, t, s, r, id, {
        resolve: () => model.current as MockLanguageModelV4,
      }),
  };
});

const run = { text: TEXT, readId: 'test' };
const proposed = () => profileOf(capturedRead(), owner.subject.data);

const twoWeekends = definition('two_weekends', {
  formula: 'record.weekend_1 + record.weekend_2',
  examples: [example(59, true)],
});

const version = (keys: string[]): WrittenVersion => ({
  shape: null,
  unfit: null,
  formula: `record.weekend_1 * (key in groups.kit ? 1.1 : 1.0)`,
  constants: [],
  groups: [{ id: 'kit', keys, quote: 'Order enough to cover them.' }],
  uses: [],
  examples: [],
  model: 'test',
});
// A rule whose two writes disagree, which a person chooses between.
const split = definition('expected', {
  formula: 'record.weekend_1',
  agreement: {
    status: 'split',
    runs: 2,
    versions: [version(['SD-01']), version(['SD-01', 'EG-06'])],
    differences: [{ key: 'EG-06', inputs: {}, results: ['19', '21'] }],
  },
});

describe('rules router', () => {
  inScratchStorage();
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    startDraft.mockReset();
    startRewrite.mockReset();
    model.current = null;
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('get', () => {
    it('says nothing is kept, and suggests the data profile from the read', async () => {
      const got = await caller().rules.get(run);
      expect(got).toMatchObject({ kind: 'none', drafting: null });
      expect(got.profile.state).toBe('none');
      if (got.profile.state !== 'none') return;
      expect(got.profile.proposed?.columns.length).toBeGreaterThan(10);
    });

    it('suggests nothing without a read', async () => {
      expect((await caller().rules.get({ text: TEXT })).profile).toEqual({
        state: 'none',
        proposed: null,
      });
      expect(
        (await caller().rules.get({ text: TEXT, readId: null })).profile,
      ).toEqual({ state: 'none', proposed: null });
    });

    it('gives the rules with the records they are about, how each is worked, and the history', async () => {
      await keep([twoWeekends]);
      await putRevision(owner, (await loadSet(owner, TEXT))!, {
        reason: 'accepted',
      });
      const got = await caller().rules.get(run);
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      expect(got.set.definitions.map((d) => d.id)).toEqual(['two_weekends']);
      expect(got.names['SD-01']).toBeTruthy();
      expect(got.working['two_weekends']).toHaveLength(1);
      expect(got.sentences).toHaveProperty('two_weekends');
      expect(got.drafting).toBeNull();
      expect(got.history.revisions.map((r) => r.reason)).toEqual(['accepted']);
      expect(got.history.revisions[0]?.changes).not.toBeNull();
    });

    it('gives the draft’s progress with the rules, whatever the read', async () => {
      // Rules whose read is gone still arrive, without names or working.
      await keep([twoWeekends], { readId: 'gone' });
      const got = await caller().rules.get({ text: TEXT });
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      expect(got.names).toEqual({});
      expect(got.working).toEqual({});
    });

    it('refuses an input that does not fit', async () => {
      for (const refused of [
        caller().rules.get({ text: '' }),
        caller().rules.get({ text: TEXT, readId: '' }),
        caller().rules.get({ text: TEXT, readId: '../x' }),
        caller().rules.get({ text: TEXT, readId: 'x'.repeat(81) }),
        caller().rules.get({ ...run, extra: 1 } as never),
      ])
        expect((await failure(refused)).code).toBe('BAD_REQUEST');
    });
  });

  describe('the data profile', () => {
    it('is kept under review when proposed from the read', async () => {
      const kept = await caller().rules.profile(run);
      expect(kept.profile).toMatchObject({
        state: 'review',
        profile: { confirmedAt: null },
      });
      expect((await loadProfile(owner))?.confirmedAt).toBeNull();
    });

    it('is not proposed from a read that is gone', async () => {
      expect(
        await failure(caller().rules.profile({ ...run, readId: 'gone' })),
      ).toMatchObject({
        code: 'BAD_GATEWAY',
        message: expect.stringMatching(/no longer kept on the server/),
      });
    });

    it('is under review again after an edit to a confirmed one', async () => {
      await saveProfile(owner, confirmProfile(proposed()));
      expect((await caller().rules.get({ text: TEXT })).profile.state).toBe(
        'confirmed',
      );
      const edited = (
        await caller().rules.profileColumn({
          text: TEXT,
          column: 'max_order_units',
          blank: 'skip',
          label: 'supplier maximum',
        })
      ).profile;
      expect(edited.state).toBe('review');
      if (edited.state !== 'review') return;
      expect(
        (edited.profile as DataProfile).columns.find(
          (c) => c.column === 'max_order_units',
        ),
      ).toMatchObject({ blank: 'skip', label: 'supplier maximum' });
      expect(
        await failure(
          caller().rules.profileColumn({
            text: TEXT,
            column: 'ripe',
            type: 'text',
          }),
        ),
      ).toMatchObject({
        code: 'BAD_GATEWAY',
        message: expect.stringMatching(/declared by the process/),
      });
    });

    it('cannot be edited or confirmed before one is kept', async () => {
      const none = {
        code: 'BAD_GATEWAY',
        message: 'No data profile is kept yet.',
      };
      expect(
        await failure(
          caller().rules.profileColumn({
            text: TEXT,
            column: 'max_order_units',
            blank: 'skip',
          }),
        ),
      ).toEqual(none);
      expect(
        await failure(caller().rules.confirmProfile({ text: TEXT })),
      ).toEqual(none);
    });

    it('moves the rules under review onto the profile it confirms', async () => {
      const first = confirmProfile(proposed());
      await saveProfile(owner, first);
      const atMost: Shape = {
        kind: 'limit',
        field: 'order',
        at: 'most',
        amount: 'column:max_order_units',
        base: null,
        compare: null,
        target: null,
        margin_pct: null,
        when: [],
        only_for_group: null,
        only_for_when: [],
      };
      const subject = withProfile(owner, first).subject;
      const formula = formulaOf(atMost, {
        subject,
        records: recordsOf(capturedRead(), subject.data),
        read: capturedRead(),
        consequence: 'block',
        constants: [],
        groups: [],
        earlier: [],
      });
      await keep(
        [
          definition('supplier_most', {
            result: 'check',
            consequence: 'block',
            shape: atMost,
            formula,
            examples: [
              example(true, true, { inputs: { order: 72 } }),
              example(false, true, { inputs: { order: 80 } }),
            ],
          }),
        ],
        { profileId: first.id },
      );
      await caller().rules.profileColumn({
        text: TEXT,
        column: 'max_order_units',
        blank: 'skip',
      });
      const confirmed = await caller().rules.confirmProfile({ text: TEXT });
      expect(confirmed.profile.state).toBe('confirmed');
      const profile = await loadProfile(owner);
      const set = await loadSet(owner, TEXT);
      expect(set?.profileId).toBe(profile?.id);
      expect(set?.profileId).not.toBe(first.id);
      expect(set?.definitions[0]?.formula).toMatch(
        /^!\(has\(record\.max_order_units\)\)/,
      );
      if (confirmed.kind !== 'rules') throw new Error('Expected rules.');
      expect(confirmed.set.profileId).toBe(profile?.id);
    });
  });

  describe('drafting', () => {
    const draft = { text: TEXT, version: 'v1', readId: 'test' };

    it('is refused until the data is confirmed, before any draft starts', async () => {
      const refused = { code: 'BAD_GATEWAY', message: CONFIRM_FIRST };
      expect(await failure(caller().rules.draft(draft))).toEqual(refused);
      await saveProfile(owner, proposed());
      expect(await failure(caller().rules.draft(draft))).toEqual(refused);
      expect(startDraft).not.toHaveBeenCalled();
      await saveProfile(owner, confirmProfile(proposed()));
      expect(await caller().rules.draft(draft)).toMatchObject({
        kind: 'none',
      });
      expect(startDraft).toHaveBeenCalledOnce();
    });

    it('is given the read, the version and the model asked for', async () => {
      await saveProfile(owner, confirmProfile(proposed()));
      await caller().rules.draft({ ...draft, model: DRAFTING_MODELS[1] });
      expect(startDraft).toHaveBeenCalledWith(
        owner,
        TEXT,
        'v1',
        expect.objectContaining({ tabs: expect.anything() }),
        { model: DRAFTING_MODELS[1] },
      );
    });

    it('says the read is gone, and refuses a version or model it does not know', async () => {
      await saveProfile(owner, confirmProfile(proposed()));
      expect(
        await failure(caller().rules.draft({ ...draft, readId: 'gone' })),
      ).toMatchObject({
        code: 'BAD_GATEWAY',
        message: expect.stringMatching(/no longer kept on the server/),
      });
      for (const refused of [
        caller().rules.draft({ ...draft, version: 'v'.repeat(21) }),
        caller().rules.draft({ ...draft, model: 'nope' as never }),
        caller().rules.draft({ ...draft, readId: '../x' }),
      ])
        expect((await failure(refused)).code).toBe('BAD_REQUEST');
      expect(startDraft).not.toHaveBeenCalled();
    });

    it('writes one definition again on the read', async () => {
      await keep([twoWeekends]);
      expect(
        await caller().rules.write({ ...run, id: 'two_weekends' }),
      ).toMatchObject({ kind: 'rules' });
      expect(startRewrite).toHaveBeenCalledWith(
        owner,
        TEXT,
        expect.objectContaining({ tabs: expect.anything() }),
        'two_weekends',
        { model: undefined },
      );
      expect(
        await failure(
          caller().rules.write({ ...run, id: 'two_weekends', readId: 'gone' }),
        ),
      ).toMatchObject({ code: 'BAD_GATEWAY' });
    });
  });

  describe('deciding', () => {
    it('confirms the intent', async () => {
      await keep([twoWeekends]);
      const got = await caller().rules.intent({ text: TEXT });
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      expect(got.set.intentConfirmedAt).not.toBeNull();
    });

    it('accepts a definition that passes, rechecked in full', async () => {
      await keep([twoWeekends]);
      const got = await caller().rules.decide({
        text: TEXT,
        id: 'two_weekends',
        decision: 'accept',
      });
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      const [done] = got.set.definitions;
      expect(done?.approvedAt).not.toBeNull();
      expect(done?.examples[0]).toMatchObject({ actual: 59, agrees: true });
    });

    it('keeps the rulebook as a revision once every rule and the intent are accepted, and the reply carries the history', async () => {
      await keep([twoWeekends]);
      await caller().rules.intent({ text: TEXT });
      const got = await caller().rules.decide({
        text: TEXT,
        id: 'two_weekends',
        decision: 'accept',
      });
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      expect(got.history.revisions.map((r) => r.reason)).toEqual(['accepted']);
      expect((await listRevisions(owner, TEXT)).revisions).toHaveLength(1);
    });

    it('refuses one that does not pass, in the reply and not as an error', async () => {
      await keep([
        definition('two_weekends', {
          formula: 'record.weekend_1 + record.weekend_2',
          examples: [example(99, true)],
        }),
      ]);
      const got = await caller().rules.decide({
        text: TEXT,
        id: 'two_weekends',
        decision: 'accept',
      });
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      expect(got.set.definitions[0]).toMatchObject({
        approvedAt: null,
        problem: '1 of 1 examples disagree with the formula.',
      });
    });

    it('denies one, with what is wrong', async () => {
      await keep([twoWeekends]);
      const got = await caller().rules.decide({
        text: TEXT,
        id: 'two_weekends',
        decision: 'deny',
        note: 'Not what I meant.',
      });
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      expect(got.set.definitions[0]).toMatchObject({
        approvedAt: null,
        denial: 'Not what I meant.',
      });
      expect(got.set.definitions[0]?.deniedAt).not.toBeNull();
    });

    it('takes a version where the writes disagreed', async () => {
      await keep([split]);
      const got = await caller().rules.choose({
        text: TEXT,
        id: 'expected',
        index: 1,
      });
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      expect(got.set.definitions[0]).toMatchObject({
        agreement: { status: 'chosen' },
        groups: [{ keys: ['SD-01', 'EG-06'] }],
      });
    });

    it('says whether a check is meant for every record or only some', async () => {
      await keep([
        definition('enough', {
          result: 'check',
          consequence: 'block',
          formula: 'record.weekend_1 >= 0',
          appliesTo: 'every',
        }),
      ]);
      const got = await caller().rules.appliesTo({
        text: TEXT,
        id: 'enough',
        value: 'some',
      });
      if (got.kind !== 'rules') throw new Error('Expected rules.');
      expect(got.set.definitions[0]).toMatchObject({
        appliesTo: 'some',
        approvedAt: null,
      });
    });

    it('answers with nothing for rules that are not kept', async () => {
      for (const reply of [
        await caller().rules.intent({ text: TEXT }),
        await caller().rules.choose({ text: TEXT, id: 'x', index: 0 }),
        await caller().rules.appliesTo({ text: TEXT, id: 'x', value: 'some' }),
        await caller().rules.decide({
          text: TEXT,
          id: 'x',
          decision: 'accept',
        }),
      ])
        expect(reply.kind).toBe('none');
    });

    it('refuses an input that does not fit', async () => {
      await keep([split]);
      for (const refused of [
        caller().rules.choose({ text: TEXT, id: 'expected', index: 6 }),
        caller().rules.choose({ text: TEXT, id: 'expected', index: -1 }),
        caller().rules.appliesTo({
          text: TEXT,
          id: 'expected',
          value: 'none' as never,
        }),
        caller().rules.decide({
          text: TEXT,
          id: 'expected',
          decision: 'maybe' as never,
        }),
        caller().rules.decide({
          text: TEXT,
          id: 'expected',
          decision: 'deny',
          note: 'x'.repeat(501),
        }),
      ])
        expect((await failure(refused)).code).toBe('BAD_REQUEST');
    });
  });

  describe('advice', () => {
    const advice = () =>
      always(
        answer({
          verdict: 'version_1',
          quote: 'Order enough to cover them.',
          reason: 'Only the kit sells more.',
          rephrase: null,
        }),
      );

    it('says which version the instructions support, as a mutation: it asks a model', async () => {
      await keep([split]);
      model.current = advice();
      expect(
        await caller().rules.advise({ text: TEXT, id: 'expected' }),
      ).toMatchObject({
        kind: 'advice',
        advice: { verdict: 'version_1', reason: 'Only the kit sells more.' },
      });
    });

    it('says what is missing', async () => {
      expect(
        await failure(caller().rules.advise({ text: TEXT, id: 'expected' })),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message: 'No rules are kept for these instructions.',
      });
      await keep([split], { readId: 'gone' });
      expect(
        await failure(caller().rules.advise({ text: TEXT, id: 'expected' })),
      ).toMatchObject({
        code: 'BAD_GATEWAY',
        message: expect.stringMatching(/no longer kept on the server/),
      });
    });
  });

  describe('what code finds, asking no model', () => {
    it('says what it finds of one definition on the read, at values tried', async () => {
      await keep([twoWeekends]);
      const got = await caller().rules.debug({
        ...run,
        id: 'two_weekends',
        inputs: {},
      });
      expect(got.kind).toBe('debug');
      expect(got.debug.summary.name).toBe('two weekends');
      // Without a read of its own, the one the rules were written on.
      expect(
        (
          await caller().rules.debug({
            text: TEXT,
            readId: null,
            id: 'two_weekends',
            inputs: {},
          })
        ).kind,
      ).toBe('debug');
    });

    it('says what is missing', async () => {
      const debug = { ...run, id: 'two_weekends', inputs: {} };
      const none = {
        code: 'BAD_GATEWAY',
        message: 'No rules are kept for these instructions.',
      };
      expect(await failure(caller().rules.debug(debug))).toEqual(none);
      expect(await failure(caller().rules.debugDraft(run))).toEqual(none);
      await keep([twoWeekends]);
      expect(
        await failure(caller().rules.debug({ ...debug, id: 'nothing' })),
      ).toEqual({ code: 'BAD_GATEWAY', message: 'No such definition.' });
      expect(
        await failure(caller().rules.debug({ ...debug, readId: 'gone' })),
      ).toMatchObject({
        code: 'BAD_GATEWAY',
        message: expect.stringMatching(/no longer kept on the server/),
      });
    });

    it('says what it finds of the draft', async () => {
      await keep([twoWeekends]);
      expect(await caller().rules.debugDraft(run)).toMatchObject({
        kind: 'debugDraft',
        debug: { intent: 'Order enough.' },
      });
      expect(
        (await caller().rules.debugDraft({ text: TEXT, readId: null })).kind,
      ).toBe('debugDraft');
    });

    it('refuses inputs that are not whole numbers, or a read id that is not one', async () => {
      await keep([twoWeekends]);
      for (const refused of [
        caller().rules.debug({
          ...run,
          id: 'two_weekends',
          inputs: { order: 1.5 },
        }),
        caller().rules.debug({
          ...run,
          id: 'two_weekends',
          inputs: { order: -1 },
        }),
        caller().rules.debug({
          ...run,
          readId: '',
          id: 'two_weekends',
          inputs: {},
        }),
        caller().rules.debugDraft({ text: TEXT, readId: '../x' }),
      ])
        expect((await failure(refused)).code).toBe('BAD_REQUEST');
    });
  });
});
