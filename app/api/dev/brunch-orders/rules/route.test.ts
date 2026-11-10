import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { capturedRead } from '@/lib/definitions/captured.fixture';
import {
  confirmProfile,
  profileOf,
  withProfile,
} from '@/lib/definitions/profile';
import { recordsOf } from '@/lib/definitions/records';
import { inScratchDirectory } from '@/lib/definitions/scratch.fixture';
import { definition, example, keep, TEXT } from '@/lib/definitions/set.fixture';
import { formulaOf, type Shape } from '@/lib/definitions/shapes';
import { loadProfile, loadSet, saveProfile } from '@/lib/definitions/store';
import { CONFIRM_FIRST, type DataProfile } from '@/lib/definitions/types';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { POST } from './route';

// The rules route's part in the data profile: drafting waits for a confirmed
// one, an edit puts it back under review, and confirming moves the rules
// under review onto it. No model is asked; nothing reaches fixtures/.

const { start } = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('@/lib/processes/brunch-orders/reads', () => ({
  READ_GONE: 'The read is gone.',
  keptRead: async (id: string) => (id === 'test' ? capturedRead() : null),
}));
vi.mock('@/lib/definitions/draft', async (actual) => ({
  ...(await actual<typeof import('@/lib/definitions/draft')>()),
  startDraft: start,
}));

inScratchDirectory();
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  start.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const post = async (body: Record<string, unknown>) => {
  const response = await POST(
    new Request('http://localhost:3000/api/dev/brunch-orders/rules', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: TEXT, ...body }),
    }),
  );
  return { status: response.status, json: await response.json() };
};
const proposed = () => profileOf(capturedRead(), owner.subject.data);

describe('drafting through the rules route', () => {
  it('is refused until the data is confirmed, before any draft starts', async () => {
    const draft = { action: 'draft', version: 'v1', readId: 'test' };
    expect(await post(draft)).toMatchObject({
      status: 502,
      json: { kind: 'error', message: CONFIRM_FIRST },
    });
    await saveProfile(owner, proposed());
    expect((await post(draft)).json.message).toBe(CONFIRM_FIRST);
    expect(start).not.toHaveBeenCalled();
    await saveProfile(owner, confirmProfile(proposed()));
    expect((await post(draft)).status).toBe(200);
    expect(start).toHaveBeenCalledOnce();
  });
});

describe('the data profile through the rules route', () => {
  it('suggests one from the read until one is kept, then keeps it under review', async () => {
    const before = (await post({ action: 'get', readId: 'test' })).json;
    expect(before.profile.state).toBe('none');
    expect(before.profile.proposed.columns.length).toBeGreaterThan(10);
    const kept = (await post({ action: 'profile', readId: 'test' })).json;
    expect(kept.profile).toMatchObject({
      state: 'review',
      profile: { confirmedAt: null },
    });
  });

  it('is under review again after an edit to a confirmed one', async () => {
    await saveProfile(owner, confirmProfile(proposed()));
    expect((await post({ action: 'get' })).json.profile.state).toBe(
      'confirmed',
    );
    const edited = (
      await post({
        action: 'profileColumn',
        column: 'max_order_units',
        blank: 'skip',
        label: 'supplier maximum',
      })
    ).json;
    expect(edited.profile.state).toBe('review');
    const column = (edited.profile.profile as DataProfile).columns.find(
      (c) => c.column === 'max_order_units',
    );
    expect(column).toMatchObject({ blank: 'skip', label: 'supplier maximum' });
    expect(
      (
        await post({
          action: 'profileColumn',
          column: 'ripe',
          type: 'text',
        })
      ).json.message,
    ).toMatch(/declared by the process/);
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
    await post({
      action: 'profileColumn',
      column: 'max_order_units',
      blank: 'skip',
    });
    const confirmed = (await post({ action: 'confirmProfile' })).json;
    expect(confirmed.profile.state).toBe('confirmed');
    const profile = await loadProfile(owner);
    const set = await loadSet(owner, TEXT);
    expect(set?.profileId).toBe(profile?.id);
    expect(set?.profileId).not.toBe(first.id);
    expect(set?.definitions[0]?.formula).toMatch(
      /^!\(has\(record\.max_order_units\)\)/,
    );
    expect(confirmed.set.profileId).toBe(profile?.id);
  });
});
