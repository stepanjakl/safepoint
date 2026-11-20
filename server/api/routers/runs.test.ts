import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashOf } from '@/lib/engine/fingerprint';
import { inScratchDatabase } from '@/lib/engine/scratch.fixture';
import { brunchOrdersProcess } from '@/lib/processes/brunch-orders/process';
import { runs } from '@/server/db/schema';
import { keepStandInRead } from '@/server/storage/reads.fixture';

import {
  DIRECT,
  keepRulesRevision,
  PUBLISHED,
  rulesFingerprint,
} from '../kept-run.fixture';
import { caller, failure } from '../run.fixture';

// The runs procedures, called in process on a scratch database.

const V3 = hashOf(PUBLISHED);
const V1 = hashOf(brunchOrdersProcess.instructions.previous.at(-1)!.text);

describe('runs router', () => {
  const db = inScratchDatabase();
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  it('starts a run under a kept version, at its first step, and names it', async () => {
    const run = await caller().runs.start({
      process: 'brunch-orders',
      instructions: V3,
      additionalInstructions: '  Order for 60 kits this time. ',
      modelPlan: 'gemini-3.1-flash-lite',
    });
    expect(run).toMatchObject({
      process: 'brunch-orders',
      id: expect.stringMatching(/^run-[0-9a-f-]{36}$/),
      instructions: { hash: V3, version: 'v3' },
      readId: null,
      rulebook: null,
      stage: 'read',
      status: 'running',
      trigger: 'manual',
      additionalInstructions: 'Order for 60 kits this time.',
      modelPlan: 'gemini-3.1-flash-lite',
      startedBy: null,
      discardedAt: null,
    });
    expect(
      await caller().runs.get({ process: 'brunch-orders', runId: run.id }),
    ).toEqual({
      ...run,
      instructions: { ...run.instructions, text: PUBLISHED },
    });
  });

  it('starts two runs for two starts at once', async () => {
    const both = await Promise.all([
      caller().runs.start({ process: 'brunch-orders', instructions: V3 }),
      caller().runs.start({ process: 'brunch-orders', instructions: V3 }),
    ]);
    expect(new Set(both.map((run) => run.id)).size).toBe(2);
    expect(await caller().runs.list({ process: 'brunch-orders' })).toHaveLength(
      2,
    );
  });

  it('lists a process’s runs newest first, under the version each ran', async () => {
    const first = await caller().runs.start({
      process: 'brunch-orders',
      instructions: V1,
    });
    const second = await caller().runs.start({
      process: 'brunch-orders',
      instructions: V3,
    });
    await caller().runs.start({
      process: 'brunch-orders-direct',
      instructions: hashOf(DIRECT),
    });
    const listed = await caller().runs.list({ process: 'brunch-orders' });
    expect(listed.map((run) => [run.id, run.instructions.version])).toEqual([
      [second.id, 'v3'],
      [first.id, 'v1'],
    ]);
  });

  it('records the read, the pinned rulebook, the step and the status', async () => {
    await keepStandInRead(db(), 'live');
    const { id } = await caller().runs.start({
      process: 'brunch-orders',
      instructions: V3,
    });
    const at = { process: 'brunch-orders' as const, runId: id };
    await keepRulesRevision();
    expect(
      await caller().runs.record({
        ...at,
        readId: 'live',
        rulebook: rulesFingerprint,
        stage: 'propose',
        status: 'awaiting_review',
      }),
    ).toMatchObject({
      readId: 'live',
      rulebook: rulesFingerprint,
      stage: 'propose',
      status: 'awaiting_review',
    });
    // Moving to the current rules takes the pin away.
    expect(
      await caller().runs.record({ ...at, rulebook: null, stage: 'calculate' }),
    ).toMatchObject({ readId: 'live', rulebook: null, stage: 'calculate' });
  });

  it('refuses progress a run cannot make', async () => {
    await keepStandInRead(db(), 'live');
    const rules = await caller().runs.start({
      process: 'brunch-orders',
      instructions: V3,
    });
    const direct = await caller().runs.start({
      process: 'brunch-orders-direct',
      instructions: hashOf(DIRECT),
    });
    const at = { process: 'brunch-orders' as const, runId: rules.id };
    expect(
      await failure(caller().runs.record({ ...at, readId: 'not-kept' })),
    ).toEqual({
      code: 'NOT_FOUND',
      message: 'This read is not kept on the server.',
    });
    expect(
      await failure(caller().runs.record({ ...at, stage: 'publish' })),
    ).toEqual({
      code: 'BAD_REQUEST',
      message: 'A Brunch orders run has no step publish.',
    });
    expect(
      await failure(
        caller().runs.record({
          process: 'brunch-orders-direct',
          runId: direct.id,
          rulebook: rulesFingerprint,
        }),
      ),
    ).toEqual({
      code: 'BAD_REQUEST',
      message: 'A Brunch orders run keeps no rulebook.',
    });
    // The direct process has no Rules step.
    expect(
      await failure(
        caller().runs.record({
          process: 'brunch-orders-direct',
          runId: direct.id,
          stage: 'rules',
        }),
      ),
    ).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await failure(
        caller().runs.record({ ...at, runId: 'run-nobody', stage: 'read' }),
      ),
    ).toEqual({
      code: 'NOT_FOUND',
      message: 'This run is not kept on the server.',
    });
    expect(
      await failure(
        caller().runs.start({
          process: 'brunch-orders',
          instructions: '000000000000',
        }),
      ),
    ).toEqual({
      code: 'NOT_FOUND',
      message:
        'These instructions are not kept on the server. Publish them first.',
    });
  });

  it('discards a run: marked, left out of the list, kept, and moved no further', async () => {
    const { id } = await caller().runs.start({
      process: 'brunch-orders',
      instructions: V3,
    });
    const at = { process: 'brunch-orders' as const, runId: id };
    const discarded = await caller().runs.discard(at);
    expect(discarded.discardedAt).toEqual(expect.any(String));
    // A second press changes nothing.
    expect(await caller().runs.discard(at)).toEqual(discarded);
    expect(await caller().runs.list({ process: 'brunch-orders' })).toEqual([]);
    expect(
      await caller().runs.list({ process: 'brunch-orders', discarded: true }),
    ).toEqual([discarded]);
    expect(await db().select().from(runs)).toHaveLength(1);
    expect(
      await failure(caller().runs.record({ ...at, stage: 'rules' })),
    ).toEqual({
      code: 'CONFLICT',
      message: 'This run was discarded. Start a new run.',
    });
  });

  it('refuses an input that does not fit', async () => {
    const { id } = await caller().runs.start({
      process: 'brunch-orders',
      instructions: V3,
    });
    for (const call of [
      caller().runs.start({
        process: 'nobody',
        instructions: V3,
      } as never),
      caller().runs.start({ process: 'brunch-orders', instructions: 'v3' }),
      caller().runs.start({
        process: 'brunch-orders',
        instructions: V3,
        trigger: 'schedule' as never,
      }),
      caller().runs.record({ process: 'brunch-orders', runId: id }),
      caller().runs.record({
        process: 'brunch-orders',
        runId: id,
        status: 'cancelled' as never,
      }),
      caller().runs.get({ process: 'brunch-orders', runId: '../etc' }),
    ])
      expect(await failure(call)).toMatchObject({ code: 'BAD_REQUEST' });
  });
});
