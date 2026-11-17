import { readFileSync } from 'node:fs';

import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecisionMade } from '@/lib/engine/apply';
import { capturedRead } from '@/lib/engine/captured.fixture';
import type { KeptRead } from '@/lib/engine/records';
import { inScratchDatabase } from '@/lib/engine/scratch.fixture';
import { definitionSetSchema, type Proposal } from '@/lib/engine/types';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { applications } from '@/server/db/schema';

import { keepProposal } from './proposals';
import { keepStandInRead } from './reads.fixture';
import { memorySheet } from './sheet.fixture';

/*
  Two server instances writing for one run, on one database: each is the
  storage module loaded afresh, so the two share the database and nothing in
  memory. Every interleaving is driven by holding a call to the sheet until
  the test lets it go (sheet.fixture.ts, `hold`), never by waiting on time. A
  lease running out is the row's heartbeat set back past it, as the database
  would find it after a process stopped renewing it.
*/

type Storage = typeof import('./applications');
let one: Storage;
let two: Storage;
beforeAll(async () => {
  one = await import('./applications');
  vi.resetModules();
  two = await import('./applications');
});

const db = inScratchDatabase();

const set = definitionSetSchema.parse(
  JSON.parse(readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8')),
);
const FP = 'abcabcabcabc';
const THURSDAY = '2026-10-29T08:45:00.000Z';
const read = (): KeptRead => ({
  ...capturedRead(),
  id: 'run',
  readAt: THURSDAY,
});
const record = (order: number) => ({
  action: 'set' as const,
  values: { order },
  reason: 'Worked out.',
  cited: [],
  unsure: null,
  verdict: 'ready' as const,
  checks: [],
});
const proposal: Proposal = {
  fingerprint: FP,
  readId: 'run',
  model: 'test',
  at: '2026-10-29T09:00:00.000Z',
  records: { 'EG-06': record(12), 'CT-250': record(10) },
};
const approve: DecisionMade = { kind: 'approve', at: THURSDAY };
const decisions = { 'EG-06': approve, 'CT-250': approve };
const original = () => [
  ['sku', 'order', 'note'],
  ['EG-06', 24, 'keep'],
  ['CT-250', 20, 'keep'],
];
const WRITTEN = [
  ['sku', 'order', 'note'],
  ['EG-06', 12, 'keep'],
  ['CT-250', 10, 'keep'],
];

const STILL_WRITING =
  'The last write to the Orders tab is still being made. Try again in a moment.';
const BEING_UNDONE =
  'The last write to the Orders tab is being undone. Try again in a moment.';
const ALREADY =
  'This run has already written to the Orders tab. Undo that first to write again.';

type Sheet = ReturnType<typeof memorySheet>;
const write = (on: Storage, sheet: Sheet) =>
  on.applyDecisions(owner, set, read(), FP, proposal, decisions, [], sheet);
const undo = (on: Storage, sheet: Sheet) =>
  on.undoApplication(owner, 'run', FP, sheet);
const preview = (on: Storage, sheet: Sheet) =>
  on.keptApplication(owner, 'run', FP, sheet);

// Every record of the run, oldest first.
const rows = () =>
  db()
    .select({
      status: applications.status,
      undoStartedAt: applications.undoStartedAt,
      holder: applications.holder,
    })
    .from(applications)
    .orderBy(applications.id);
const statuses = async () => (await rows()).map((row) => row.status);

// As the database finds a lease whose holder stopped renewing it.
const lapse = () =>
  db()
    .update(applications)
    .set({ heartbeatAt: sql`now() - interval '2 minutes'` })
    .where(sql`${applications.holder} is not null`);

const problemsOf = (outcome: Awaited<ReturnType<typeof write>>) =>
  outcome.kind === 'refused' ? outcome.prepared.problems : [];

let sheet: Sheet;
beforeEach(async () => {
  expect(one.applyDecisions).not.toBe(two.applyDecisions);
  await keepStandInRead(db(), 'run');
  await keepProposal(owner, proposal);
  sheet = memorySheet(read(), original());
});

describe('two writes for one run at once', () => {
  it('write the sheet once: the second claim is refused while the first is in flight', async () => {
    // Both have looked and found nothing in the way before either claims.
    const looked = [sheet.hold('readNow'), sheet.hold('readNow')];
    const writing = sheet.hold('writeRange');
    const first = write(one, sheet);
    await looked[0]!.reached;
    const second = write(two, sheet);
    await looked[1]!.reached;
    looked[0]!.open();
    looked[1]!.open();
    // One of them holds the row and is writing; the other is refused.
    await writing.reached;
    const refused = await Promise.race([first, second]);
    expect(problemsOf(refused)).toEqual([STILL_WRITING]);
    writing.open();
    const outcomes = await Promise.all([first, second]);
    expect(outcomes.map((o) => o.kind).sort()).toEqual(['refused', 'written']);
    expect(sheet.writes).toHaveLength(1);
    expect(sheet.grid).toEqual(WRITTEN);
    expect(await statuses()).toEqual(['verified']);
  });

  it('refuses a write, and an undo, while another is in flight', async () => {
    const writing = sheet.hold('writeRange');
    const first = write(one, sheet);
    await writing.reached;
    expect(problemsOf(await write(two, sheet))).toEqual([STILL_WRITING]);
    expect(await undo(two, sheet)).toEqual({
      kind: 'refused',
      problem: STILL_WRITING,
    });
    writing.open();
    expect(await first).toMatchObject({
      kind: 'written',
      application: { status: 'verified' },
    });
    expect(problemsOf(await write(two, sheet))).toEqual([ALREADY]);
    expect(sheet.writes).toHaveLength(1);
  });
});

describe('a write in flight, seen by another instance', () => {
  it('is left pending while its lease is live, though its block still holds what it held before', async () => {
    const writing = sheet.hold('writeRange');
    const first = write(one, sheet);
    await writing.reached;
    // Settled now, it would read as failed, and a retry would be let in.
    expect(sheet.grid).toEqual(original());
    expect(await preview(two, sheet)).toMatchObject({ status: 'pending' });
    expect(await statuses()).toEqual(['pending']);
    writing.open();
    expect(await first).toMatchObject({
      application: { status: 'verified' },
    });
    expect(await preview(two, sheet)).toMatchObject({ status: 'verified' });
    expect(await statuses()).toEqual(['verified']);
  });

  it('is settled by its own writer even once its lease ran out, if no one else settled it', async () => {
    const writing = sheet.hold('writeRange');
    const first = write(one, sheet);
    await writing.reached;
    await lapse();
    writing.open();
    expect(await first).toMatchObject({
      application: { status: 'verified' },
    });
    expect(await statuses()).toEqual(['verified']);
  });

  /*
    The dangerous case: the writer's renewals stopped reaching the database
    while it was writing, its lease ran out, and another instance settled the
    row from a block not yet written. The write then lands. The writer does
    not write over the record (the status only moves forward), and keeps the
    write again as it read it back, so the cells it replaced are still what
    undo puts back, and no retry is let in over it.
  */
  it('is kept again as it landed when another settled it as failed after its lease ran out', async () => {
    const writing = sheet.hold('writeRange');
    const first = write(one, sheet);
    await writing.reached;
    await lapse();
    expect(await preview(two, sheet)).toMatchObject({ status: 'failed' });
    writing.open();
    expect(await first).toMatchObject({
      kind: 'written',
      application: { status: 'verified', error: null },
    });
    expect(await statuses()).toEqual(['failed', 'verified']);
    expect(await preview(two, sheet)).toMatchObject({ status: 'verified' });
    expect(problemsOf(await write(two, sheet))).toEqual([ALREADY]);
    expect(await undo(two, sheet)).toMatchObject({ kind: 'undone' });
    expect(sheet.grid).toEqual(original());
  });

  it('writes nothing once another has settled it, if it had not begun writing', async () => {
    const empty = memorySheet(read());
    const adding = empty.hold('addTab');
    const first = write(one, empty);
    await adding.reached;
    await lapse();
    // The resource it had to add is not there: nothing landed.
    expect(await preview(two, empty)).toMatchObject({ status: 'failed' });
    adding.open();
    expect(await first).toMatchObject({
      kind: 'written',
      application: { status: 'failed' },
    });
    expect(empty.writes).toEqual([]);
    expect(await write(two, empty)).toMatchObject({
      application: { status: 'verified' },
    });
    expect(await statuses()).toEqual(['failed', 'verified']);
  });

  it('is settled by anyone once the process holding it stopped, and not before its lease runs out', async () => {
    // A process that kept its claim and stopped: no write of it gives its
    // lease back.
    const writing = sheet.hold('writeRange');
    const first = write(one, sheet);
    await writing.reached;
    expect(await preview(two, sheet)).toMatchObject({ status: 'pending' });
    await lapse();
    expect(await preview(two, sheet)).toMatchObject({
      status: 'failed',
      error: 'The write stopped before it landed.',
    });
    // Had it stopped, that would be the end; it lands, and is kept again.
    writing.open();
    expect(await first).toMatchObject({ application: { status: 'verified' } });
  });
});

describe('two settlers of one record at once', () => {
  // A write that landed, or not, and could not be read back: pending, its
  // lease given back, for the next caller that can read the block.
  async function cutShort(lands: boolean) {
    await write(one, {
      ...sheet,
      writeRange: async (tab, range, values) => {
        if (lands) await sheet.writeRange(tab, range, values);
        sheet.failReads = 1;
        throw new Error('The service timed out.');
      },
    });
    expect(await statuses()).toEqual(['pending']);
  }

  // A writer and a previewer both read the block before either settles.
  async function together() {
    const reads = [sheet.hold('readTab'), sheet.hold('readTab')];
    const writer = write(one, sheet);
    await reads[0]!.reached;
    const previewer = preview(two, sheet);
    await reads[1]!.reached;
    reads[1]!.open();
    reads[0]!.open();
    return { writer: await writer, previewer: await previewer };
  }

  it('settle a write that landed once, as verified, and the writer is refused', async () => {
    await cutShort(true);
    const { writer, previewer } = await together();
    expect(previewer).toMatchObject({ status: 'verified', error: null });
    expect(problemsOf(writer)).toEqual([ALREADY]);
    expect(await statuses()).toEqual(['verified']);
    expect(sheet.writes).toHaveLength(1);
  });

  it('settle a write that never landed once, as failed, and the writer tries again', async () => {
    await cutShort(false);
    const { writer, previewer } = await together();
    expect(previewer).toMatchObject({
      status: 'failed',
      error: 'The service timed out.',
    });
    expect(writer).toMatchObject({
      kind: 'written',
      application: { status: 'verified' },
    });
    expect(await statuses()).toEqual(['failed', 'verified']);
    expect(sheet.grid).toEqual(WRITTEN);
  });
});

describe('undoing, from two instances', () => {
  beforeEach(async () => {
    expect(await write(one, sheet)).toMatchObject({
      application: { status: 'verified' },
    });
  });

  it('writes the cells back once when two undos claim at once', async () => {
    // Both have found the block as written before either marks the undo.
    const looked = [sheet.hold('readTab'), sheet.hold('readTab')];
    const writing = sheet.hold('writeRange');
    const first = undo(one, sheet);
    await looked[0]!.reached;
    const second = undo(two, sheet);
    await looked[1]!.reached;
    looked[0]!.open();
    looked[1]!.open();
    await writing.reached;
    expect(await Promise.race([first, second])).toEqual({
      kind: 'refused',
      problem: BEING_UNDONE,
    });
    writing.open();
    const outcomes = await Promise.all([first, second]);
    expect(outcomes.map((o) => o.kind).sort()).toEqual(['refused', 'undone']);
    // The write and one undo.
    expect(sheet.writes).toHaveLength(2);
    expect(sheet.grid).toEqual(original());
    expect(await statuses()).toEqual(['undone']);
  });

  it('refuses a new write and another undo while one is in flight, and a settler leaves its mark', async () => {
    const writing = sheet.hold('writeRange');
    const first = undo(one, sheet);
    await writing.reached;
    expect(problemsOf(await write(two, sheet))).toEqual([BEING_UNDONE]);
    expect(await undo(two, sheet)).toEqual({
      kind: 'refused',
      problem: BEING_UNDONE,
    });
    // The block still holds what was written; settled now, the mark would
    // be cleared under the undo about to land.
    expect(await preview(two, sheet)).toMatchObject({
      status: 'verified',
      undoStartedAt: expect.any(String),
    });
    writing.open();
    expect(await first).toMatchObject({
      kind: 'undone',
      application: { status: 'undone' },
    });
    expect(sheet.writes).toHaveLength(2);
    expect(await write(two, sheet)).toMatchObject({
      application: { status: 'verified' },
    });
  });

  it('is finished as undone when another cleared its mark after its lease ran out', async () => {
    const writing = sheet.hold('writeRange');
    const first = undo(one, sheet);
    await writing.reached;
    await lapse();
    // Found still as written, the mark is cleared: the write stands.
    expect(await preview(two, sheet)).toEqual(
      expect.not.objectContaining({ undoStartedAt: expect.anything() }),
    );
    writing.open();
    expect(await first).toMatchObject({ kind: 'undone' });
    expect(await statuses()).toEqual(['undone']);
    expect(sheet.grid).toEqual(original());
  });
});

describe('the database, under the storage code', () => {
  it('refuses a second standing record for the run, whoever inserts it', async () => {
    await write(one, sheet);
    const [{ id, ...row }] = (await db().select().from(applications)) as [
      typeof applications.$inferSelect,
    ];
    expect(id).toBeGreaterThan(0);
    await expect(
      db()
        .insert(applications)
        .values({ ...row, status: 'pending' }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('refuses to move a settled record back, or to change what it wrote', async () => {
    await write(one, sheet);
    const one_ = eq(applications.readId, 'run');
    await expect(
      db().update(applications).set({ status: 'pending' }).where(one_),
    ).rejects.toMatchObject({
      cause: { message: 'an application cannot move from verified to pending' },
    });
    await expect(
      db()
        .update(applications)
        .set({ before: [['changed']] })
        .where(one_),
    ).rejects.toMatchObject({
      cause: { message: 'what an application wrote is never changed' },
    });
    expect(await statuses()).toEqual(['verified']);
  });
});
