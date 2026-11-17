import { describe, expect, it } from 'vitest';

import { hashOf } from '@/lib/engine/fingerprint';
import { inScratchDatabase } from '@/lib/engine/scratch.fixture';
import type { Proposal } from '@/lib/engine/types';
import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import { applications, recordDecisions, runs } from '@/server/db/schema';
import { runProcess } from '@/server/operations/kept-processes';

import { insertRow } from './application-rows';
import {
  appendDecisions,
  currentDecisions,
  decidedOnEarlier,
  type NewEvent,
} from './decisions';
import { currentProposalOf, keepProposal } from './proposals';
import { keepStandInRead } from './reads.fixture';
import { startRun } from './runs';

// The current decision, worked out from a run's history of events on one
// proposal, on a scratch database.

const READ = 'read-1';
const FINGERPRINT = 'aaaaaaaaaaaa';
const key = { process: owner.id, readId: READ, fingerprint: FINGERPRINT };

const event = (
  recordKey: string,
  kind: NewEvent['kind'],
  values: Record<string, number> | null = null,
): NewEvent => ({
  recordKey,
  kind,
  values,
  verdict: kind === 'withdraw' ? null : 'ready',
  checks: kind === 'withdraw' ? null : [],
});

const proposalAt = (at: string): Proposal => ({
  fingerprint: FINGERPRINT,
  readId: READ,
  model: 'test',
  at,
  records: {},
});

describe('decisions', () => {
  const db = inScratchDatabase();

  async function arranged() {
    await keepStandInRead(db(), READ);
    await keepProposal(owner, proposalAt('2026-10-29T09:00:00.000Z'));
    const proposal = (await currentProposalOf(key))!;
    const run = await startRun(runProcess(owner.id), {
      instructions: hashOf(brunchOrdersProcess.instructions.text),
      trigger: 'manual',
      additionalInstructions: null,
      actor: null,
    });
    const on = { process: owner.id, runId: run.id, proposalId: proposal.id };
    const append = (...events: NewEvent[]) =>
      appendDecisions(owner, key, on, events, 'Alex');
    return { on, append, run };
  }

  it('are the latest event per record, a withdrawal meaning none', async () => {
    const { on, append } = await arranged();
    await append(event('A', 'approve'));
    await append(event('A', 'change', { order: 6 }));
    await append(event('A', 'withdraw'));
    await append(event('B', 'approve'), event('C', 'change', { order: 12 }));
    await append(event('B', 'reject'));
    await append(event('C', 'withdraw'));
    await append(event('C', 'change', { order: 18 }));
    const current = await currentDecisions(on);
    expect(current).toEqual({
      B: {
        kind: 'reject',
        values: null,
        verdict: 'ready',
        checks: [],
        actor: 'Alex',
        at: expect.any(String),
      },
      C: expect.objectContaining({ kind: 'change', values: { order: 18 } }),
    });
    // Every event is kept: history is never rewritten.
    expect(await db().select().from(recordDecisions)).toHaveLength(8);
  });

  it('are per run and per proposal', async () => {
    const { on, append } = await arranged();
    await append(event('A', 'approve'));
    await keepProposal(owner, proposalAt('2026-10-29T10:00:00.000Z'));
    const later = (await currentProposalOf(key))!;
    const onLater = { ...on, proposalId: later.id };
    expect(await currentDecisions(onLater)).toEqual({});
    expect(await decidedOnEarlier(onLater)).toBe(true);
    expect(await decidedOnEarlier(on)).toBe(false);
    expect(await currentDecisions({ ...on, runId: 'run-another' })).toEqual({});
  });

  it('say nothing twice: an event the current decision already says is not kept', async () => {
    const { append } = await arranged();
    await append(event('A', 'approve'));
    await append(event('A', 'approve'));
    await append(event('B', 'withdraw'));
    await append(event('C', 'change', { order: 6 }));
    await append(event('C', 'change', { order: 6 }));
    await append(event('C', 'change', { order: 12 }));
    expect(
      (await db().select().from(recordDecisions)).map((row) => [
        row.recordKey,
        row.kind,
      ]),
    ).toEqual([
      ['A', 'approve'],
      ['C', 'change'],
      ['C', 'change'],
    ]);
  });

  it('are never changed or removed, and hold their run and proposal in place', async () => {
    const { on, append, run } = await arranged();
    await append(event('A', 'approve'));
    await insertRow(db(), {
      key,
      readProcess: 'brunch-orders',
      proposalId: on.proposalId,
      runId: run.id,
      application: {
        proposedAt: '2026-10-29T09:00:00.000Z',
        tab: 'Orders',
        at: '2026-10-29T09:30:00.000Z',
        status: 'verified',
        error: null,
        undoneAt: null,
        range: 'A1:B2',
        before: [],
        after: [],
        changes: [],
        decisions: {},
      },
      holder: null,
    });
    for (const work of [
      db().update(recordDecisions).set({ kind: 'reject' }),
      db().delete(recordDecisions),
      db().delete(runs),
      db().delete(applications),
    ])
      await expect(work).rejects.toMatchObject({ cause: { code: '23000' } });
  });
});
