import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { capturedRead } from '@/lib/definitions/captured.fixture';
import { checkProposal } from '@/lib/definitions/propose';
import { inScratchStorage } from '@/lib/definitions/scratch.fixture';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { recordDecisions } from '@/server/db/schema';

import {
  AT,
  LATER,
  keepDirectProposal,
  keepRulesProposal,
  record,
  rulesSet,
  startedRun,
} from '../kept-run.fixture';
import { caller, failure } from '../run.fixture';

// Decisions on a kept run's proposal, through the procedures, on a scratch
// database and directory. The read is the captured one; no model is asked.

vi.mock('@/server/storage/brunch-orders-reads', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/server/storage/brunch-orders-reads')
  >()),
  keptRead: async (id: string) =>
    ['live', 'other'].includes(id)
      ? {
          ...(
            await import('@/lib/definitions/captured.fixture')
          ).capturedRead(),
          id,
        }
      : null,
}));

const EARLIER =
  'These decisions were made on an earlier proposal. Decide on the current one.';

describe('decisions router', () => {
  const { database: db } = inScratchStorage();
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  const events = () => db().select().from(recordDecisions);

  async function arranged() {
    const proposal = await keepRulesProposal(db(), 'live');
    const run = await startedRun('brunch-orders', 'live');
    return { run, proposal, on: { ...run, proposedAt: proposal.at } };
  }

  it('keeps an approval with the verdict and checks the proposal showed', async () => {
    const { run, on } = await arranged();
    const got = await caller().decisions.record({
      ...on,
      decision: { key: 'EG-06', kind: 'approve' },
    });
    expect(got).toMatchObject({
      kind: 'decisions',
      proposal: { at: AT },
      decisions: {
        'EG-06': {
          kind: 'approve',
          values: null,
          verdict: 'ready',
          checks: [],
          actor: null,
        },
      },
    });
    expect(await caller().decisions.current(run)).toEqual(got);
    const [event] = await events();
    expect(event).toMatchObject({
      runId: run.runId,
      recordKey: 'EG-06',
      kind: 'approve',
      verdict: 'ready',
    });
  });

  it('keeps a change with the checks worked out on its values by the server', async () => {
    const { on } = await arranged();
    const got = await caller().decisions.record({
      ...on,
      decision: { key: 'EG-06', kind: 'change', values: { order: 24 } },
    });
    const expected = checkProposal(
      owner,
      rulesSet,
      { ...capturedRead(), id: 'live' },
      'EG-06',
      { order: 24 },
    );
    expect(expected.verdict).not.toBe('blocked');
    expect(got).toMatchObject({
      decisions: {
        'EG-06': {
          kind: 'change',
          values: { order: 24 },
          verdict: expected.verdict,
          checks: expected.checks,
        },
      },
    });
  });

  it('refuses what the screens refuse, in words a person can act on', async () => {
    const { on } = await arranged();
    const decide = (
      decision: Parameters<
        ReturnType<typeof caller>['decisions']['record']
      >[0]['decision'],
    ) => failure(caller().decisions.record({ ...on, decision }));
    expect(await decide({ key: 'XX-01', kind: 'approve' })).toEqual({
      code: 'BAD_REQUEST',
      message: 'XX-01 is not in this proposal.',
    });
    expect(await decide({ key: 'SD-01', kind: 'approve' })).toEqual({
      code: 'CONFLICT',
      message:
        'SD-01 cannot be approved: Whole cases fails. Change it to values that pass, or reject it.',
    });
    // The rule the write applies, in its words.
    for (const order of [-6, 1.5])
      expect(
        await decide({ key: 'EG-06', kind: 'change', values: { order } }),
      ).toEqual({
        code: 'BAD_REQUEST',
        message: 'EG-06 needs a whole number, 0 or more, for order.',
      });
    expect(
      await decide({
        key: 'EG-06',
        kind: 'change',
        values: { order: 12, x: 1 },
      }),
    ).toEqual({
      code: 'BAD_REQUEST',
      message: 'EG-06 cannot set x: this proposal sets order.',
    });
    // Nothing was kept of any of them.
    expect(await events()).toEqual([]);
  });

  it('refuses a change to values a blocking check stops', async () => {
    const { on } = await arranged();
    const read = { ...capturedRead(), id: 'live' };
    // The first order of EG-06 the accepted rules block.
    const order = [1, 2, 3, 5, 7, 11, 13].find(
      (n) =>
        checkProposal(owner, rulesSet, read, 'EG-06', { order: n }).verdict ===
        'blocked',
    );
    expect(order).toBeDefined();
    const { checks } = checkProposal(owner, rulesSet, read, 'EG-06', {
      order: order!,
    });
    const failing = checks
      .filter((c) => !c.holds && c.consequence === 'block')
      .map((c) => c.name)
      .join(', ');
    expect(
      await failure(
        caller().decisions.record({
          ...on,
          decision: { key: 'EG-06', kind: 'change', values: { order: order! } },
        }),
      ),
    ).toEqual({
      code: 'CONFLICT',
      message: `EG-06 cannot be changed to these values: ${failing} fails.`,
    });
  });

  it('refuses a decision on an earlier proposal, and starts a new one empty', async () => {
    const { run, on } = await arranged();
    await caller().decisions.record({
      ...on,
      decision: { key: 'EG-06', kind: 'approve' },
    });
    await keepRulesProposal(db(), 'live', { at: LATER });
    expect(
      await failure(
        caller().decisions.record({
          ...on,
          decision: { key: 'CT-250', kind: 'approve' },
        }),
      ),
    ).toEqual({ code: 'CONFLICT', message: EARLIER });
    // The new proposal has no decisions; the one made before stays on the old.
    expect(await caller().decisions.current(run)).toMatchObject({
      proposal: { at: LATER },
      decisions: {},
    });
    expect(await events()).toHaveLength(1);
  });

  it('keeps several at once, all or none', async () => {
    const { on } = await arranged();
    expect(
      await failure(
        caller().decisions.recordMany({
          ...on,
          decisions: [
            { key: 'EG-06', kind: 'approve' },
            { key: 'SD-01', kind: 'approve' },
          ],
        }),
      ),
    ).toMatchObject({ code: 'CONFLICT' });
    expect(await events()).toEqual([]);
    const got = await caller().decisions.recordMany({
      ...on,
      decisions: [
        { key: 'CT-250', kind: 'approve' },
        { key: 'EG-06', kind: 'approve' },
        { key: 'SD-01', kind: 'reject' },
      ],
    });
    if (got.kind !== 'decisions') throw new Error('Expected decisions.');
    // In the proposal's own order, whatever order they were sent in.
    expect(Object.keys(got.decisions)).toEqual(['EG-06', 'CT-250', 'SD-01']);
    expect(
      await failure(
        caller().decisions.recordMany({
          ...on,
          decisions: [
            { key: 'EG-06', kind: 'approve' },
            { key: 'EG-06', kind: 'reject' },
          ],
        }),
      ),
    ).toEqual({
      code: 'BAD_REQUEST',
      message: 'Each record is decided once at a time: EG-06 twice.',
    });
  });

  it('takes a decision back, the record undecided again', async () => {
    const { run, on } = await arranged();
    await caller().decisions.record({
      ...on,
      decision: { key: 'EG-06', kind: 'approve' },
    });
    expect(
      await caller().decisions.withdraw({ ...on, key: 'EG-06' }),
    ).toMatchObject({ decisions: {} });
    // Withdrawing nothing keeps nothing.
    await caller().decisions.withdraw({ ...on, key: 'EG-06' });
    expect((await events()).map((e) => e.kind)).toEqual([
      'approve',
      'withdraw',
    ]);
    expect(await caller().decisions.current(run)).toMatchObject({
      decisions: {},
    });
  });

  it('keeps one event for a decision sent twice, one after the other or at once', async () => {
    const { on } = await arranged();
    const approve = () =>
      caller().decisions.record({
        ...on,
        decision: { key: 'EG-06', kind: 'approve' },
      });
    await approve();
    await approve();
    await Promise.all([
      caller().decisions.record({
        ...on,
        decision: { key: 'CT-250', kind: 'reject' },
      }),
      caller().decisions.record({
        ...on,
        decision: { key: 'CT-250', kind: 'reject' },
      }),
    ]);
    expect((await events()).map((e) => [e.recordKey, e.kind])).toEqual([
      ['EG-06', 'approve'],
      ['CT-250', 'reject'],
    ]);
    // A different decision on the same record is a new event.
    await caller().decisions.record({
      ...on,
      decision: { key: 'EG-06', kind: 'change', values: { order: 24 } },
    });
    expect(await events()).toHaveLength(3);
  });

  it('keeps decisions per run: another run on the same read and rulebook starts with none', async () => {
    const { on } = await arranged();
    await caller().decisions.record({
      ...on,
      decision: { key: 'EG-06', kind: 'approve' },
    });
    const other = await startedRun('brunch-orders', 'live');
    expect(await caller().decisions.current(other)).toMatchObject({
      proposal: { at: AT },
      decisions: {},
    });
  });

  it('asks a person about a record the model was unsure of, with no rulebook', async () => {
    await keepDirectProposal(db(), 'live', {
      'EG-06': record(12, { verdict: 'unchecked', unsure: 'Sales are thin.' }),
      'CT-250': record(10, { verdict: 'unchecked' }),
    });
    const run = await startedRun('brunch-orders-direct', 'live');
    const got = await caller().decisions.recordMany({
      ...run,
      proposedAt: AT,
      decisions: [
        { key: 'EG-06', kind: 'approve' },
        { key: 'CT-250', kind: 'approve' },
      ],
    });
    expect(got).toMatchObject({
      decisions: {
        'EG-06': { verdict: 'decide' },
        'CT-250': { verdict: 'unchecked' },
      },
    });
  });

  it('answers none for a run with nothing proposed yet', async () => {
    await keepRulesProposal(db(), 'live');
    const run = await caller().runs.start({
      process: 'brunch-orders',
      instructions: rulesSet.hash,
    });
    expect(
      await caller().decisions.current({ process: run.process, runId: run.id }),
    ).toEqual({ kind: 'decisions', proposal: null, decisions: {} });
    expect(
      await failure(
        caller().decisions.record({
          process: run.process,
          runId: run.id,
          proposedAt: AT,
          decision: { key: 'EG-06', kind: 'approve' },
        }),
      ),
    ).toEqual({
      code: 'CONFLICT',
      message: 'This run has not read its data yet.',
    });
  });

  it('refuses a run not kept, and one discarded', async () => {
    const { run, on } = await arranged();
    expect(
      await failure(
        caller().decisions.record({
          ...on,
          runId: 'run-nobody',
          decision: { key: 'EG-06', kind: 'approve' },
        }),
      ),
    ).toEqual({
      code: 'NOT_FOUND',
      message: 'This run is not kept on the server.',
    });
    await caller().runs.discard(run);
    expect(
      await failure(
        caller().decisions.record({
          ...on,
          decision: { key: 'EG-06', kind: 'approve' },
        }),
      ),
    ).toEqual({
      code: 'CONFLICT',
      message: 'This run was discarded. Start a new run.',
    });
  });

  it('refuses an input that does not fit, before reaching storage', async () => {
    const { on } = await arranged();
    const bad = [
      { ...on, decision: { key: 'EG-06', kind: 'maybe' } },
      {
        ...on,
        decision: { key: 'EG-06', kind: 'approve', values: { order: 1 } },
      },
      { ...on, decision: { key: 'EG-06', kind: 'change' } },
      {
        ...on,
        process: 'nobody',
        decision: { key: 'EG-06', kind: 'approve' },
      },
      { ...on, runId: '../x', decision: { key: 'EG-06', kind: 'approve' } },
    ];
    for (const input of bad)
      expect(
        await failure(caller().decisions.record(input as never)),
      ).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await failure(caller().decisions.recordMany({ ...on, decisions: [] })),
    ).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await db()
        .select()
        .from(recordDecisions)
        .where(eq(recordDecisions.recordKey, 'EG-06')),
    ).toEqual([]);
  });
});
