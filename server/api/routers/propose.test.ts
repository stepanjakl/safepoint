import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fingerprintOf } from '@/lib/engine/fingerprint';
import { inScratchStorage } from '@/lib/engine/scratch.fixture';
import { keepStandInRead } from '@/server/storage/reads.fixture';
import { TEXT } from '@/lib/engine/set.fixture';
import { proposalSchema } from '@/lib/engine/types';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { keepProposal } from '@/server/storage/proposals';
import { putRevision } from '@/server/storage/rulebooks';

import {
  accepted,
  caller,
  failure,
  keepAsCurrent,
  outdated,
} from '../run.fixture';

// Propose, called in process on a scratch directory. The read is the
// captured one; the job that asks the model is a stand-in, so nothing reaches
// the network and no quota is spent.

const { start } = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('@/server/jobs/proposal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/jobs/proposal')>()),
  startProposal: start,
}));
vi.mock('@/server/storage/run-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/storage/run-reads')>()),
  keptRead: async (id: string) =>
    id === 'test'
      ? (await import('@/lib/engine/captured.fixture')).capturedRead()
      : null,
}));

const frozen = JSON.parse(
  readFileSync('e2e/fixtures/brunch-orders-proposal.json', 'utf8'),
) as {
  names: Record<string, string>;
  proposal: unknown;
  trials: Record<string, Record<string, object>>;
};

const run = { text: TEXT, readId: 'test', evaluation: 'rules' as const };
const fingerprint = fingerprintOf(accepted);

describe('propose router', () => {
  const { database: db } = inScratchStorage();
  beforeEach(async () => {
    await keepStandInRead(db(), 'test');
    vi.stubEnv('NODE_ENV', 'development');
    start.mockReset();
    await keepAsCurrent(accepted);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('gives the names and worked-out values, with nothing proposed yet', async () => {
    const got = await caller().propose.get(run);
    expect(got).toMatchObject({
      kind: 'proposal',
      fingerprint,
      names: frozen.names,
      proposal: null,
      progress: null,
    });
    if (got.kind !== 'proposal') return;
    expect(got.calculated.calculations.map((c) => c.id)).toEqual([
      'expected_sales',
      'target_stock_level',
    ]);
    expect(got.calculated.rows['SD-01']).toEqual({
      expected_sales: 73,
      target_stock_level: 80.3,
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('gives the proposal kept for this read and rulebook', async () => {
    const proposal = {
      ...proposalSchema.parse(frozen.proposal),
      readId: 'test',
      fingerprint,
    };
    await keepProposal(owner, proposal);
    await expect(caller().propose.get(run)).resolves.toMatchObject({
      proposal: { at: proposal.at },
    });
  });

  it('starts the job on the rulebook and model asked for, and answers as get does', async () => {
    const got = await caller().propose.start({
      ...run,
      model: 'gemini-3.5-flash',
    });
    expect(got).toMatchObject({ kind: 'proposal', fingerprint });
    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.calls[0]!.slice(3)).toEqual([
      'test',
      TEXT,
      { model: 'gemini-3.5-flash' },
    ]);
  });

  it('checks the values a person is changing, for one record', async () => {
    const trial = frozen.trials['CF-40']!['6']!;
    await expect(
      caller().propose.check({ ...run, key: 'CF-40', values: { order: 6 } }),
    ).resolves.toMatchObject({ kind: 'check', ...trial });
  });

  it('asks for no rulebook when the model proposes alone', async () => {
    const direct = { ...run, evaluation: 'model' as const };
    // Nothing is kept for the rulebook: none is looked for.
    const got = await caller().propose.get({
      ...direct,
      text: `${TEXT} Alone.`,
    });
    expect(got).toMatchObject({ kind: 'proposal', proposal: null });
  });

  it('says a rulebook that no longer fits the read is stale, and starts nothing', async () => {
    await putRevision(owner, outdated, { reason: 'accepted' });
    const old = { ...run, rulebook: fingerprintOf(outdated) };
    const stale = {
      kind: 'stale',
      rulebook: old.rulebook,
      problems: [expect.objectContaining({ problem: expect.any(String) })],
      current: fingerprint,
    };
    await expect(caller().propose.get(old)).resolves.toEqual(stale);
    await expect(caller().propose.start(old)).resolves.toEqual(stale);
    await expect(
      caller().propose.check({ ...old, key: 'AV-RR', values: { order: 50 } }),
    ).resolves.toEqual(stale);
    expect(start).not.toHaveBeenCalled();
  });

  it('refuses an input that does not fit, before reaching storage', async () => {
    for (const refused of [
      caller().propose.get({ ...run, text: 'x'.repeat(20_001) }),
      caller().propose.get({ ...run, evaluation: 'both' as never }),
      caller().propose.get({ ...run, extra: 1 } as never),
      caller().propose.start({ ...run, model: 'nope' as never }),
      caller().propose.check({ ...run, key: 'x'.repeat(81), values: {} }),
      caller().propose.check({ ...run, key: 'AV-RR', values: { order: 1.5 } }),
    ])
      expect((await failure(refused)).code).toBe('BAD_REQUEST');
  });

  it('says the read is gone', async () => {
    expect(
      await failure(caller().propose.get({ ...run, readId: 'gone' })),
    ).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringMatching(/no longer kept on the server/),
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('answers a failure while starting as a bad gateway, in its own words', async () => {
    start.mockImplementation(() => {
      throw new Error('The job could not start.\nMore detail.');
    });
    expect(await failure(caller().propose.start(run))).toEqual({
      code: 'BAD_GATEWAY',
      message: 'The job could not start.\nMore detail.',
    });
  });
});
