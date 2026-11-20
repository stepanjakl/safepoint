import { describe, expect, it } from 'vitest';

import { hashOf } from '@/lib/engine/fingerprint';
import { inScratchDatabase } from '@/lib/engine/scratch.fixture';
import { brunchOrdersProcess } from '@/lib/processes/brunch-orders/process';
import { runs } from '@/server/db/schema';
import { runProcess } from '@/server/operations/kept-processes';

import { ensureDeclared } from '@/server/storage/rules/instructions';
import { discardRun, listRuns, startRun } from './runs';

// A process's runs as the list gives them, on a scratch database.

const kept = runProcess('brunch-orders');
const { instructions } = brunchOrdersProcess;
const V3 = hashOf(instructions.text);
const V2 = hashOf(instructions.previous[0]!.text);

describe('the list of runs', () => {
  const db = inScratchDatabase();

  // A run as it would be if it had started at `at`.
  async function startedAt(id: string, at: string, hash = V3) {
    await ensureDeclared(db(), kept);
    await db()
      .insert(runs)
      .values({
        process: kept.summary.id,
        id,
        instructionsHash: hash,
        readProcess: 'brunch-orders',
        stage: 'read',
        status: 'running',
        trigger: 'manual',
        startedAt: new Date(at),
      });
  }

  it('is newest first by start, then by id, each under its version’s label', async () => {
    await startedAt('run-a', '2026-11-01T09:00:00.000Z', V2);
    await startedAt('run-c', '2026-11-02T09:00:00.000Z');
    await startedAt('run-b', '2026-11-02T09:00:00.000Z');
    const listed = await listRuns(kept.summary.id);
    expect(listed.map((run) => [run.id, run.instructions.version])).toEqual([
      ['run-c', 'v3'],
      ['run-b', 'v3'],
      ['run-a', 'v2'],
    ]);
    expect(listed[2]).toEqual({
      process: 'brunch-orders',
      id: 'run-a',
      instructions: { hash: V2, version: 'v2' },
      readId: null,
      rulebook: null,
      stage: 'read',
      status: 'running',
      trigger: 'manual',
      additionalInstructions: null,
      modelPlan: null,
      startedBy: null,
      startedAt: '2026-11-01T09:00:00.000Z',
      updatedAt: expect.any(String),
      discardedAt: null,
    });
  });

  it('leaves out a discarded run unless asked, and keeps only its own process’s', async () => {
    await startedAt('run-a', '2026-11-01T09:00:00.000Z');
    const started = await startRun(kept, {
      instructions: V3,
      trigger: 'manual',
      additionalInstructions: null,
      actor: null,
    });
    await discardRun(kept.summary.id, 'run-a');
    expect((await listRuns(kept.summary.id)).map((run) => run.id)).toEqual([
      started.id,
    ]);
    expect(
      (await listRuns(kept.summary.id, { discarded: true })).map((run) => [
        run.id,
        run.discardedAt !== null,
      ]),
    ).toEqual([
      [started.id, false],
      ['run-a', true],
    ]);
    expect(await listRuns('brunch-orders-direct')).toEqual([]);
  });
});
