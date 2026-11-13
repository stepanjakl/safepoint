import type { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { calculate } from '@/lib/definitions/calculate';
import { capturedRead } from '@/lib/definitions/captured.fixture';
import { fingerprintOf } from '@/lib/definitions/fingerprint';
import { always, answer } from '@/lib/definitions/models.fixture';
import { inScratchDirectory } from '@/lib/definitions/scratch.fixture';
import { TEXT } from '@/lib/definitions/set.fixture';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { listRevisions, putRevision } from '@/server/storage/rulebooks';

import {
  accepted,
  caller,
  failure,
  keepAsCurrent,
  outdated,
} from '../run.fixture';

// Calculate, called in process on a scratch directory: the read is the
// captured one, the rulebook the accepted one the browser tests serve, and
// the model that cross-checks is a stand-in. Nothing reaches the network.

const model = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/server/storage/brunch-orders-reads', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/server/storage/brunch-orders-reads')
  >()),
  keptRead: async (id: string) =>
    id === 'test'
      ? (await import('@/lib/definitions/captured.fixture')).capturedRead()
      : null,
}));
vi.mock('@/server/storage/cross-checks', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/server/storage/cross-checks')>();
  return {
    ...actual,
    crossCheck: (
      ...[o, s, r, id, text, options]: Parameters<typeof actual.crossCheck>
    ) =>
      actual.crossCheck(o, s, r, id, text, {
        ...options,
        resolve: () => model.current as MockLanguageModelV4,
      }),
  };
});

const run = { text: TEXT, readId: 'test' };
const fingerprint = fingerprintOf(accepted);

// The model agrees everywhere but one value.
function modelWorking() {
  const { calculations, rows } = calculate(owner, accepted, capturedRead());
  return always(
    answer({
      records: rows.map((row) => ({
        key: row.key,
        values: Object.fromEntries(
          calculations.map(({ id }) => [
            id,
            {
              value:
                row.key === 'AV-RR' && id === calculations[0]!.id
                  ? 0
                  : row.values[id]!.value,
              working: 'By hand.',
            },
          ]),
        ),
      })),
    }),
  );
}

describe('calculate router', () => {
  inScratchDirectory();
  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'development');
    model.current = modelWorking();
    await keepAsCurrent(accepted);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('works every value out for every record, on the rulebook now current', async () => {
    const got = await caller().calculate.get(run);
    expect(got).toMatchObject({
      kind: 'calculation',
      check: null,
      current: fingerprint,
      calculation: { fingerprint },
    });
    if (got.kind !== 'calculation') return;
    expect(got.calculation.rows).toHaveLength(11);
    // What a run calculates on is kept as it was, so the run can come back.
    expect(
      (await listRevisions(owner, TEXT)).revisions.map((r) => r.reason),
    ).toEqual(['used']);
  });

  describe('recording the rulebook used', () => {
    const reasons = async () =>
      (await listRevisions(owner, TEXT)).revisions.map((r) => r.reason);

    it('adds nothing for a pinned revision, kept when it was accepted', async () => {
      await putRevision(owner, accepted, { reason: 'accepted' });
      await caller().calculate.get({ ...run, rulebook: fingerprint });
      await caller().calculate.crossCheck({ ...run, rulebook: fingerprint });
      expect(await reasons()).toEqual(['accepted']);
    });

    it('keeps the current rules as used when nothing is pinned', async () => {
      await caller().calculate.crossCheck(run);
      expect(await reasons()).toEqual(['used']);
    });

    it('keeps the current rules as used when the pinned revision is not kept', async () => {
      await expect(
        caller().calculate.get({ ...run, rulebook: '0123456789ab' }),
      ).resolves.toMatchObject({ kind: 'calculation', current: fingerprint });
      expect(await reasons()).toEqual(['used']);
    });
  });

  it('keeps getting the rulebook a run pinned', async () => {
    await putRevision(owner, outdated, { reason: 'accepted' });
    const old = fingerprintOf(outdated);
    // It does not fit the read, so it is said, not worked on.
    expect(await caller().calculate.get({ ...run, rulebook: old })).toEqual({
      kind: 'stale',
      rulebook: old,
      problems: [
        expect.objectContaining({
          problem: expect.stringMatching(/bool == string/),
        }),
      ],
      current: fingerprint,
    });
    // The current rules are what it moves to.
    await expect(
      caller().calculate.get({ ...run, rulebook: fingerprint }),
    ).resolves.toMatchObject({ kind: 'calculation' });
  });

  it('has the model cross-check, keeps what it found and gives it back', async () => {
    const checked = await caller().calculate.crossCheck({
      ...run,
      rulebook: fingerprint,
    });
    if (checked.kind !== 'calculation') throw new Error('Expected a check.');
    expect(checked.check).toMatchObject({ agreed: 21, total: 22 });
    expect(checked.check?.cells['AV-RR']).toMatchObject({
      expected_sales: { model: 0, agrees: false },
    });
    // A later get finds it kept, without asking the model again.
    model.current = null;
    await expect(
      caller().calculate.get({ ...run, rulebook: fingerprint }),
    ).resolves.toMatchObject({ check: checked.check });
  });

  it('says a stale rulebook is stale before asking the model anything', async () => {
    await putRevision(owner, outdated, { reason: 'accepted' });
    model.current = null;
    await expect(
      caller().calculate.crossCheck({
        ...run,
        rulebook: fingerprintOf(outdated),
      }),
    ).resolves.toMatchObject({ kind: 'stale', current: fingerprint });
  });

  it('refuses an input that does not fit, before reaching storage', async () => {
    for (const refused of [
      caller().calculate.get({ ...run, text: '' }),
      caller().calculate.get({ ...run, readId: '../x' }),
      caller().calculate.get({ ...run, rulebook: 'not-a-rulebook' }),
      caller().calculate.get({ ...run, extra: 1 } as never),
      caller().calculate.crossCheck({ ...run, model: 'nope' as never }),
    ])
      expect((await failure(refused)).code).toBe('BAD_REQUEST');
  });

  it('says the read is gone, and that no rules are kept', async () => {
    expect(
      await failure(caller().calculate.get({ ...run, readId: 'gone' })),
    ).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringMatching(/no longer kept on the server/),
    });
    expect(
      await failure(caller().calculate.get({ ...run, text: `${TEXT} More.` })),
    ).toEqual({
      code: 'BAD_GATEWAY',
      message: 'No rules are kept for these instructions.',
    });
  });

  it('answers a failure while working as a bad gateway, in its own words', async () => {
    model.current = always(answer({ records: [] }));
    expect(
      await failure(caller().calculate.crossCheck({ ...run })),
    ).toMatchObject({
      code: 'BAD_GATEWAY',
      message: expect.stringMatching(/not answered/),
    });
  });
});
