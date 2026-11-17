import { readFileSync } from 'node:fs';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { applications } from '@/server/db/schema';
import * as rows from '@/server/storage/writes/application-rows';
import {
  applyDecisions,
  keptApplication,
  undoApplication,
} from './applications';
import { keepProposal } from '@/server/storage/reads/proposals';
import { keepStandInRead } from '@/server/storage/reads.fixture';
import { memorySheet } from './sheet.fixture';

import {
  blockFor,
  prepareWrite,
  type DecisionMade,
  type OutputSheet,
} from '@/lib/engine/apply';
import { capturedRead, capturedTabs } from '@/lib/engine/captured.fixture';
import type { KeptRead } from '@/lib/engine/records';
import { inScratchStorage } from '@/lib/engine/scratch.fixture';
import {
  applicationSchema,
  definitionSetSchema,
  type Proposal,
} from '@/lib/engine/types';

// Writing a decided proposal, on a sheet held in memory and a scratch
// database: no network, and nothing written to the repository.

/*
  A save of the record can be made to fail, as if the process stopped at that
  point: each statement that keeps or settles it (application-rows.ts) counts
  as one save; renewing or giving back the lease does not.
*/
const SAVES = [
  'insertRow',
  'settleWrite',
  'leavePending',
  'markUndo',
  'settleUndo',
] as const;
vi.mock('@/server/storage/writes/application-rows', async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import('@/server/storage/writes/application-rows')
    >();
  return {
    ...real,
    insertRow: vi.fn(real.insertRow),
    settleWrite: vi.fn(real.settleWrite),
    leavePending: vi.fn(real.leavePending),
    markUndo: vi.fn(real.markUndo),
    settleUndo: vi.fn(real.settleUndo),
  };
});
const real = await vi.importActual<
  typeof import('@/server/storage/writes/application-rows')
>('@/server/storage/writes/application-rows');
const STOPPED = 'The process stopped.';
// The nth save from now fails; the others are kept as usual.
const stopAtSave = (nth: number) => {
  let saves = 0;
  for (const name of SAVES)
    vi.mocked(rows[name]).mockImplementation((async (...args: never[]) => {
      saves += 1;
      if (saves === nth) throw new Error(STOPPED);
      return (real[name] as (...a: never[]) => unknown)(...args);
    }) as never);
};
afterEach(() => {
  for (const name of SAVES)
    vi.mocked(rows[name]).mockImplementation(real[name] as never);
});

const storage = inScratchStorage();
const db = storage.database;

const set = definitionSetSchema.parse(
  JSON.parse(readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8')),
);
// A check on when the read was taken, as the current rules have.
const timed = (consequence: 'block' | 'decide', formula: string) => ({
  ...set,
  definitions: [
    ...set.definitions,
    {
      ...set.definitions.at(-1)!,
      id: 'timed',
      name: 'Timed',
      consequence,
      formula,
    },
  ],
});

const THURSDAY = '2026-10-29T08:45:00.000Z';
const FRIDAY = '2026-10-30T19:52:00.000Z';
const read = (readAt = THURSDAY): KeptRead => ({
  ...capturedRead(),
  id: 'run',
  readAt,
});

const record = (order: number, verdict: 'ready' | 'decide' = 'ready') => ({
  action: 'set' as const,
  values: { order },
  reason: 'Worked out.',
  cited: [],
  unsure: null,
  verdict,
  checks: [],
});
// The run key: a read, and a rulebook's fingerprint.
const FP = 'abcabcabcabc';
const proposal: Proposal = {
  fingerprint: FP,
  readId: 'run',
  model: 'test',
  at: '2026-10-29T09:00:00.000Z',
  // Whole cases that pass every blocking check of the rulebook.
  records: { 'EG-06': record(12), 'CT-250': record(10) },
};
const approve: DecisionMade = { kind: 'approve', at: THURSDAY };

// Where a write's record points: the run's read and the proposal it writes.
beforeEach(async () => {
  await keepStandInRead(db(), 'run');
  await keepProposal(owner, proposal);
});
const bothApproved = { 'EG-06': approve, 'CT-250': approve };

const write = (
  sheet: OutputSheet,
  decisions: Record<string, DecisionMade> = bothApproved,
  { rulebook = set, runRead = read(), acknowledged = [] as string[] } = {},
) =>
  applyDecisions(
    owner,
    rulebook,
    runRead,
    FP,
    proposal,
    decisions,
    acknowledged,
    sheet,
  );

describe('the block a write touches', () => {
  const writes = [{ key: 'EG-06', values: { order: 12 } }];

  it('starts an empty tab with its header', () => {
    const { block, changes } = blockFor([], owner, writes);
    expect(block).toMatchObject({
      range: 'A1:B2',
      after: [
        ['sku', 'order'],
        ['EG-06', 12],
      ],
    });
    expect(changes).toEqual([
      {
        key: 'EG-06',
        field: 'order',
        cell: 'Orders!B2',
        before: null,
        after: 12,
      },
    ]);
  });

  it('changes only the cell it must, and says what it held', () => {
    const grid = [
      ['sku', 'order', 'note'],
      ['SD-01', 72, 'keep'],
      ['EG-06', 24, 'keep'],
    ];
    const { block, changes } = blockFor(grid, owner, writes);
    expect(block).toMatchObject({ range: 'B3:B3', after: [[12]] });
    expect(changes[0]).toMatchObject({ cell: 'Orders!B3', before: 24 });
  });

  it('adds a row for a key the tab does not have', () => {
    const { block } = blockFor(
      [
        ['sku', 'order'],
        ['SD-01', 72],
      ],
      owner,
      writes,
    );
    expect(block).toMatchObject({ range: 'A3:B3', after: [['EG-06', 12]] });
  });

  it('refuses a tab with no key column, and a key listed twice', () => {
    expect(blockFor([['product']], owner, writes).problems).toEqual([
      'The Orders tab has no sku column.',
    ]);
    expect(
      blockFor(
        [
          ['sku', 'order'],
          ['EG-06', 1],
          ['EG-06', 2],
        ],
        owner,
        writes,
      ).problems,
    ).toEqual(['The Orders tab lists EG-06 2 times; each needs one row.']);
  });
});

describe('writing a decided proposal', () => {
  let sheet: ReturnType<typeof memorySheet>;
  beforeEach(() => {
    sheet = memorySheet(read());
  });

  it('creates the tab, writes, reads back and keeps the record', async () => {
    const outcome = await write(sheet);
    expect(outcome.kind).toBe('written');
    expect(sheet.added).toEqual(['Orders']);
    expect(sheet.grid).toEqual([
      ['sku', 'order'],
      ['EG-06', 12],
      ['CT-250', 10],
    ]);
    const kept = await keptApplication(owner, 'run', FP);
    expect(kept).toMatchObject({ status: 'verified', range: 'A1:B3' });
    expect(kept?.decisions['EG-06']).toMatchObject({
      kind: 'approve',
      values: { order: 12 },
      verdict: expect.any(String),
    });
  });

  it('writes a change, and nothing for a rejection', async () => {
    await write(sheet, {
      'EG-06': { kind: 'change', values: { order: 24 }, at: THURSDAY },
      'CT-250': { kind: 'reject', at: THURSDAY },
    });
    expect(sheet.grid).toEqual([
      ['sku', 'order'],
      ['EG-06', 24],
    ]);
    const kept = await keptApplication(owner, 'run', FP);
    expect(kept?.decisions['CT-250']).toMatchObject({
      kind: 'reject',
      values: null,
    });
  });

  it('takes an approval from the kept proposal, not the browser', async () => {
    await write(sheet, {
      'EG-06': { ...approve, values: { order: 9999 } },
      'CT-250': approve,
    });
    expect(sheet.grid?.[1]).toEqual(['EG-06', 12]);
  });

  it('refuses until every record is decided', async () => {
    const outcome = await write(sheet, { 'EG-06': approve });
    expect(outcome).toMatchObject({ kind: 'refused' });
    expect(sheet.writes).toEqual([]);
  });

  it('refuses when the data has changed since the read', async () => {
    const tabs = capturedTabs();
    tabs.find((t) => t.name === 'Stock')!.values[1]![1] = 5;
    sheet = memorySheet({ ...read(), tabs });
    const outcome = await write(sheet);
    expect(outcome.kind === 'refused' && outcome.prepared.problems[0]).toBe(
      'The sheet has changed since this run read it (Stock). Start a new run to propose from what it holds now.',
    );
    expect(sheet.writes).toEqual([]);
  });

  it('refuses a negative value, which every whole-case check would pass', async () => {
    const outcome = await write(sheet, {
      'EG-06': { kind: 'change', values: { order: -12 }, at: THURSDAY },
      'CT-250': approve,
    });
    expect(outcome.kind === 'refused' && outcome.prepared.problems).toEqual([
      'EG-06 needs a whole number, 0 or more, for order.',
    ]);
    expect(sheet.writes).toEqual([]);
  });

  it('refuses when a blocking check fails by the time of writing', async () => {
    // The deadline was ahead when the run read the sheet, and has passed now.
    sheet = memorySheet(read(FRIDAY));
    const outcome = await write(sheet, bothApproved, {
      rulebook: timed(
        'block',
        'order == 0 || record.hours_until_cutoff >= 0.0',
      ),
    });
    expect(outcome.kind === 'refused' && outcome.prepared.problems).toContain(
      'EG-06 cannot be written: Timed fails.',
    );
    expect(sheet.writes).toEqual([]);
  });

  it('holds a check that newly asks a person until it is acknowledged', async () => {
    sheet = memorySheet(read(FRIDAY));
    const rulebook = timed('decide', 'record.count_age_hours <= 24.0');
    const held = await write(sheet, bothApproved, { rulebook });
    expect(held.kind === 'refused' && held.prepared.newlyFailing).toEqual([
      { id: 'EG-06:timed', key: 'EG-06', check: 'Timed' },
      { id: 'CT-250:timed', key: 'CT-250', check: 'Timed' },
    ]);
    expect(sheet.writes).toEqual([]);

    const outcome = await write(sheet, bothApproved, {
      rulebook,
      acknowledged: ['EG-06:timed', 'CT-250:timed'],
    });
    expect(outcome.kind).toBe('written');
    const kept = await keptApplication(owner, 'run', FP);
    expect(kept?.decisions['EG-06']?.failing).toContain('Timed');
  });

  it('does not ask again about a failure a person already decided on', async () => {
    // Already failing on the run's read, so approving it accepted it.
    sheet = memorySheet(read(FRIDAY));
    const outcome = await write(sheet, bothApproved, {
      rulebook: timed('decide', 'record.count_age_hours <= 24.0'),
      runRead: read(FRIDAY),
    });
    expect(outcome.kind).toBe('written');
  });

  describe('a record the proposal left', () => {
    // EG-06 is left; CT-250 is written, and holds every check below. Made
    // after the other, so it is the proposal kept.
    const withLeft: Proposal = {
      ...proposal,
      at: '2026-10-29T09:30:00.000Z',
      records: {
        ...proposal.records,
        'EG-06': {
          ...record(12),
          action: 'leave',
          values: null,
        },
      },
    };
    const writeLeft = (
      rulebook: typeof set,
      decisions: Record<string, DecisionMade> = bothApproved,
      runRead = read(),
    ) =>
      keepProposal(owner, withLeft).then(() =>
        applyDecisions(
          owner,
          rulebook,
          runRead,
          FP,
          withLeft,
          decisions,
          ['EG-06:timed'],
          sheet,
        ),
      );

    it('is checked on the sheet as read now, and never refuses the write', async () => {
      sheet = memorySheet(read(FRIDAY));
      // Nothing is ordered for it, and its deadline has passed.
      const outcome = await writeLeft(
        timed('block', 'order != 0 || record.hours_until_cutoff >= 0.0'),
      );
      expect(outcome.kind).toBe('written');
      expect(sheet.grid).toEqual([
        ['sku', 'order'],
        ['CT-250', 10],
      ]);
      const kept = await keptApplication(owner, 'run', FP);
      expect(kept?.decisions['EG-06']).toMatchObject({
        kind: 'approve',
        values: null,
        verdict: 'blocked',
        failing: ['Timed'],
      });
    });

    it('holds a decide check that newly fails for it, but not a rejection', async () => {
      sheet = memorySheet(read(FRIDAY));
      const rulebook = timed('decide', 'record.count_age_hours <= 24.0');
      const prepared = await prepareWrite(
        owner,
        rulebook,
        read(),
        withLeft,
        bothApproved,
        sheet,
      );
      expect(prepared.newlyFailing.map((f) => f.id)).toContain('EG-06:timed');
      expect(prepared.decisions['EG-06']).toMatchObject({
        values: null,
        verdict: 'decide',
        failing: ['Timed'],
      });
      const rejected = await prepareWrite(
        owner,
        rulebook,
        read(),
        withLeft,
        { ...bothApproved, 'EG-06': { kind: 'reject', at: THURSDAY } },
        sheet,
      );
      expect(rejected.newlyFailing.map((f) => f.id)).not.toContain(
        'EG-06:timed',
      );
      expect(rejected.decisions['EG-06']).toMatchObject({
        verdict: null,
        failing: [],
      });
    });
  });

  it('will not write twice without an undo', async () => {
    await write(sheet);
    const again = await write(sheet);
    expect(again.kind === 'refused' && again.prepared.problems[0]).toBe(
      'This run has already written to the Orders tab. Undo that first to write again.',
    );
    expect(sheet.writes).toHaveLength(1);
  });

  it('records a write that did not land, and lets it be tried again', async () => {
    const failing = memorySheet(read(), [], { failWrite: true });
    const outcome = await write(failing);
    expect(outcome).toMatchObject({
      kind: 'written',
      application: { status: 'failed', error: 'The sheet said no.' },
    });
    expect((await write(sheet)).kind).toBe('written');
  });

  it('says when what is read back is not what was written', async () => {
    const outcome = await write(memorySheet(read(), [], { garble: true }));
    expect(outcome).toMatchObject({
      kind: 'written',
      application: { status: 'mismatch' },
    });
  });

  it('previews without writing', async () => {
    const prepared = await prepareWrite(
      owner,
      set,
      read(),
      proposal,
      bothApproved,
      sheet,
    );
    expect(prepared.tabExists).toBe(false);
    expect(prepared.changes).toHaveLength(2);
    expect(sheet.added).toEqual([]);
    expect(sheet.writes).toEqual([]);
  });
});

describe('undoing a write', () => {
  const undo = (sheet: OutputSheet) => undoApplication(owner, 'run', FP, sheet);

  it('puts back what the cells held', async () => {
    const sheet = memorySheet(read(), [
      ['sku', 'order', 'note'],
      ['EG-06', 24, 'keep'],
      ['CT-250', 20, 'keep'],
    ]);
    await write(sheet);
    expect(sheet.grid?.[1]).toEqual(['EG-06', 12, 'keep']);
    const outcome = await undo(sheet);
    expect(outcome).toMatchObject({
      kind: 'undone',
      application: { status: 'undone' },
    });
    expect(sheet.grid?.[1]).toEqual(['EG-06', 24, 'keep']);
  });

  /*
    Was: the file read and written back to the byte, and a key the schema
    does not name surviving undo's rewrite. A record is now columns: it reads
    back as the very record written, in the schema's order, and what a json
    column holds keeps a key the schema does not name through every update;
    a top-level key has no column, and the import refuses an entry with one
    (scripts/import-kept-data/import.test.ts) rather than losing it.
  */
  it('keeps what a record holds, to the byte, as it is read and written back', async () => {
    const sheet = memorySheet(read());
    const outcome = await write(sheet);
    if (outcome.kind !== 'written') throw new Error('Expected a write.');
    const kept = await keptApplication(owner, 'run', FP);
    expect(JSON.stringify(kept)).toBe(JSON.stringify(outcome.application));
    expect(JSON.stringify(applicationSchema.parse(kept))).toBe(
      JSON.stringify(kept),
    );
  });

  it('keeps a key the schema does not name, inside a column, through an undo', async () => {
    const sheet = memorySheet(read());
    await write(sheet);
    const written = sheet.grid!.map((row) => [...row]);
    await undo(sheet);
    // The same write kept again with a key its schema does not name, as an
    // import of an older record would keep it, and the sheet holding it.
    const [{ id, ...row }] = (await db().select().from(applications)) as [
      typeof applications.$inferSelect,
    ];
    expect(id).toBeGreaterThan(0);
    await db()
      .insert(applications)
      .values({
        ...row,
        status: 'verified',
        undoneAt: null,
        undoStartedAt: null,
        changes: row.changes.map((change, i) =>
          i ? change : { ...change, origin: 'sheet' },
        ),
      });
    sheet.grid = written;
    expect(await undo(sheet)).toMatchObject({ kind: 'undone' });
    const undone = await keptApplication(owner, 'run', FP);
    expect(undone).toMatchObject({ status: 'undone' });
    expect(undone?.changes[0]).toMatchObject({ origin: 'sheet' });
  });

  it('clears the cells of a tab that was empty, and allows a new write', async () => {
    const sheet = memorySheet(read());
    await write(sheet);
    await undo(sheet);
    expect(sheet.grid?.flat().every((cell) => cell === '')).toBe(true);
    expect((await write(sheet)).kind).toBe('written');
  });

  it('refuses once someone has changed a written cell', async () => {
    const sheet = memorySheet(read());
    await write(sheet);
    sheet.grid![1]![1] = 36;
    const outcome = await undo(sheet);
    expect(outcome.kind === 'refused' && outcome.problem).toBe(
      "The Orders tab has changed since this was written, so undoing it could overwrite someone's work. Change it by hand.",
    );
    expect(sheet.grid![1]![1]).toBe(36);
  });

  it('says when the undo did not read back as before', async () => {
    const sheet = memorySheet(read());
    await write(sheet);
    // The undo's write does not land.
    const outcome = await undo({ ...sheet, writeRange: async () => {} });
    expect(outcome.kind === 'refused' && outcome.problem).toBe(
      'The Orders tab did not read back as it was before the write. Check it by hand.',
    );
  });

  it('has nothing to undo before a write, or twice', async () => {
    const sheet = memorySheet(read());
    expect((await undo(sheet)).kind).toBe('refused');
    await write(sheet);
    await undo(sheet);
    expect((await undo(sheet)).kind).toBe('refused');
  });
});

describe('a write or undo cut short', () => {
  const undo = (sheet: OutputSheet) => undoApplication(owner, 'run', FP, sheet);
  const original = () => [
    ['sku', 'order', 'note'],
    ['EG-06', 24, 'keep'],
    ['CT-250', 20, 'keep'],
  ];
  const UNCONFIRMED =
    'The last write to the Orders tab has not been read back to confirm it. Try again once the sheet can be read.';
  // Every record of the run's writes, oldest first, by what came of each.
  const statuses = async () =>
    (
      await db()
        .select({ status: applications.status })
        .from(applications)
        .where(eq(applications.readId, 'run'))
        .orderBy(applications.id)
    ).map((one) => one.status);

  it('writes nothing when the record of the write cannot be kept', async () => {
    const sheet = memorySheet(read(), original());
    stopAtSave(1);
    await expect(write(sheet)).rejects.toThrow(STOPPED);
    expect(sheet.writes).toEqual([]);
    expect(sheet.grid).toEqual(original());
  });

  it('settles a write that landed with the cells it replaced, so undo restores them', async () => {
    const sheet = memorySheet(read(), original());
    stopAtSave(2);
    await expect(write(sheet)).rejects.toThrow(STOPPED);
    expect(sheet.grid?.[1]).toEqual(['EG-06', 12, 'keep']);

    const again = await write(sheet);
    expect(again.kind === 'refused' && again.prepared.problems[0]).toBe(
      'This run has already written to the Orders tab. Undo that first to write again.',
    );
    expect(sheet.writes).toHaveLength(1);
    const kept = await keptApplication(owner, 'run', FP);
    expect(kept).toMatchObject({ status: 'verified', error: null });
    expect(kept?.changes.map((change) => change.before)).toEqual([24, 20]);

    expect((await undo(sheet)).kind).toBe('undone');
    expect(sheet.grid).toEqual(original());
  });

  it('settles a write that never landed as failed, and lets it be tried again', async () => {
    const sheet = memorySheet(read(), original(), { failWrite: true });
    stopAtSave(2);
    await expect(write(sheet)).rejects.toThrow(STOPPED);
    sheet.failWrite = false;
    expect((await write(sheet)).kind).toBe('written');
    expect(await statuses()).toEqual(['failed', 'verified']);
    expect(sheet.grid?.[1]).toEqual(['EG-06', 12, 'keep']);
  });

  it('settles a write that had to add the resource, stopped before adding it', async () => {
    const sheet = memorySheet(read());
    sheet.failAdd = true;
    stopAtSave(2);
    await expect(write(sheet)).rejects.toThrow(STOPPED);
    sheet.failAdd = false;
    expect(sheet.grid).toBeNull();
    expect((await write(sheet)).kind).toBe('written');
    expect(await statuses()).toEqual(['failed', 'verified']);
    expect(sheet.added).toEqual(['Orders']);
  });

  it('settles a write that had to add the resource, stopped once it was added', async () => {
    const sheet = memorySheet(read(), null, { failWrite: true });
    stopAtSave(2);
    await expect(write(sheet)).rejects.toThrow(STOPPED);
    sheet.failWrite = false;
    expect(sheet.grid).toEqual([]);
    expect((await write(sheet)).kind).toBe('written');
    expect(await statuses()).toEqual(['failed', 'verified']);
    // Added once: the retry finds it there, empty.
    expect(sheet.added).toEqual(['Orders']);
  });

  it('settles a write as a mismatch once a written cell is changed, and will not undo it', async () => {
    const sheet = memorySheet(read(), original());
    stopAtSave(2);
    await expect(write(sheet)).rejects.toThrow(STOPPED);
    sheet.grid![1]![1] = 36;
    expect(await keptApplication(owner, 'run', FP, sheet)).toMatchObject({
      status: 'mismatch',
    });
    expect((await undo(sheet)).kind).toBe('refused');
    expect(sheet.grid![1]![1]).toBe(36);
  });

  it('holds back another write, and an undo, until the first is read back', async () => {
    const sheet = memorySheet(read(), original());
    stopAtSave(2);
    await expect(write(sheet)).rejects.toThrow(STOPPED);
    sheet.failReads = 1;
    const held = await write(sheet);
    expect(held.kind === 'refused' && held.prepared.problems[0]).toBe(
      UNCONFIRMED,
    );
    sheet.failReads = 1;
    expect(await undo(sheet)).toEqual({
      kind: 'refused',
      problem: UNCONFIRMED,
    });
    expect(sheet.writes).toHaveLength(1);
    // Without the sheet it is shown as kept, not guessed at.
    expect(await keptApplication(owner, 'run', FP)).toMatchObject({
      status: 'pending',
    });
    expect(await keptApplication(owner, 'run', FP, sheet)).toMatchObject({
      status: 'verified',
    });
  });

  // The write is refused, or lands and then errs, and its block cannot be
  // read back straight after.
  const unreadAfter = (
    sheet: ReturnType<typeof memorySheet>,
    lands: boolean,
  ): OutputSheet => ({
    ...sheet,
    writeRange: async (tab, range, values) => {
      if (lands) await sheet.writeRange(tab, range, values);
      sheet.failReads = 1;
      throw new Error('The service timed out.');
    },
  });

  it('keeps what the write was told while it is not read back, and when it settles as failed', async () => {
    const sheet = memorySheet(read(), original());
    const outcome = await write(unreadAfter(sheet, false));
    expect(outcome).toMatchObject({
      kind: 'written',
      application: { status: 'pending', error: 'The service timed out.' },
    });
    expect(await keptApplication(owner, 'run', FP)).toMatchObject({
      status: 'pending',
      error: 'The service timed out.',
    });
    expect(await keptApplication(owner, 'run', FP, sheet)).toMatchObject({
      status: 'failed',
      error: 'The service timed out.',
    });
  });

  it('clears what the write was told once it settles as verified', async () => {
    const sheet = memorySheet(read(), original());
    await write(unreadAfter(sheet, true));
    expect(await keptApplication(owner, 'run', FP)).toMatchObject({
      status: 'pending',
      error: 'The service timed out.',
    });
    expect(await keptApplication(owner, 'run', FP, sheet)).toMatchObject({
      status: 'verified',
      error: null,
    });
  });

  it('writes nothing back when the undo cannot be marked first', async () => {
    const sheet = memorySheet(read(), original());
    await write(sheet);
    stopAtSave(1);
    await expect(undo(sheet)).rejects.toThrow(STOPPED);
    expect(sheet.grid?.[1]).toEqual(['EG-06', 12, 'keep']);
    expect((await undo(sheet)).kind).toBe('undone');
    expect(sheet.grid).toEqual(original());
  });

  it('finishes an undo that landed before it was recorded, and does not repeat it', async () => {
    const sheet = memorySheet(read(), original());
    await write(sheet);
    stopAtSave(2);
    await expect(undo(sheet)).rejects.toThrow(STOPPED);
    expect(sheet.grid).toEqual(original());
    expect(await undo(sheet)).toMatchObject({
      kind: 'undone',
      application: { status: 'undone', undoneAt: expect.any(String) },
    });
    expect(sheet.writes).toHaveLength(2);
    expect((await write(sheet)).kind).toBe('written');
  });
});
