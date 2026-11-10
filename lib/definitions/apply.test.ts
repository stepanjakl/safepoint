import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import {
  applyDecisions,
  blockFor,
  keptApplication,
  prepareWrite,
  undoApplication,
  type DecisionMade,
  type OutputSheet,
} from './apply';
import { capturedRead, capturedTabs } from './captured.fixture';
import type { KeptRead } from './records';
import { inScratchDirectory } from './scratch.fixture';
import { definitionSetSchema, type Proposal } from './types';

// Writing a decided proposal, on a sheet held in memory: no network, and
// nothing written to the repository.

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
const proposal: Proposal = {
  fingerprint: 'abc',
  readId: 'run',
  model: 'test',
  at: '2026-10-29T09:00:00.000Z',
  // Whole cases that pass every blocking check of the rulebook.
  records: { 'EG-06': record(12), 'CT-250': record(10) },
};
const approve: DecisionMade = { kind: 'approve', at: THURSDAY };
const bothApproved = { 'EG-06': approve, 'CT-250': approve };

// A sheet in memory, with the record of what was asked of it.
function memorySheet(
  now: KeptRead,
  tab: unknown[][] | null = null,
  { failWrite = false, garble = false } = {},
) {
  const sheet: OutputSheet & {
    grid: unknown[][] | null;
    added: string[];
    writes: string[];
  } = {
    grid: tab,
    added: [] as string[],
    writes: [] as string[],
    readNow: async () => now,
    readTab: async () => sheet.grid,
    addTab: async (name: string) => {
      sheet.added.push(name);
      sheet.grid = [];
    },
    writeRange: async (_: string, range: string, values: unknown[][]) => {
      if (failWrite) throw new Error('The sheet said no.');
      sheet.writes.push(range);
      const [from = 'A1'] = range.split(':');
      const left = from.charCodeAt(0) - 65;
      const top = Number(from.slice(1)) - 1;
      const grid = (sheet.grid ??= []);
      values.forEach((row, r) => {
        const at = (grid[top + r] ??= []);
        row.forEach((cell, c) => {
          at[left + c] = garble ? 'garbled' : cell;
        });
      });
    },
  };
  return sheet;
}

const write = (
  sheet: OutputSheet,
  decisions: Record<string, DecisionMade> = bothApproved,
  { rulebook = set, runRead = read(), acknowledged = [] as string[] } = {},
) =>
  applyDecisions(
    owner,
    rulebook,
    runRead,
    'abc',
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
    expect(blockFor([['product']], owner, writes).problems[0]).toContain(
      'no sku column',
    );
    expect(
      blockFor(
        [
          ['sku', 'order'],
          ['EG-06', 1],
          ['EG-06', 2],
        ],
        owner,
        writes,
      ).problems[0],
    ).toContain('2 times');
  });
});

describe('writing a decided proposal', () => {
  inScratchDirectory();

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
    const kept = await keptApplication(owner, 'run', 'abc');
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
    const kept = await keptApplication(owner, 'run', 'abc');
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
    expect(
      outcome.kind === 'refused' && outcome.prepared.problems[0],
    ).toContain('changed since this run read it (Stock)');
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
    const kept = await keptApplication(owner, 'run', 'abc');
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
    // EG-06 is left; CT-250 is written, and holds every check below.
    const withLeft: Proposal = {
      ...proposal,
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
      applyDecisions(
        owner,
        rulebook,
        runRead,
        'abc',
        withLeft,
        decisions,
        ['EG-06:timed'],
        sheet,
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
      const kept = await keptApplication(owner, 'run', 'abc');
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
    expect(again.kind === 'refused' && again.prepared.problems[0]).toContain(
      'already written',
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
  inScratchDirectory();
  const undo = (sheet: OutputSheet) =>
    undoApplication(owner, 'run', 'abc', sheet);

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
    expect(outcome.kind === 'refused' && outcome.problem).toContain(
      'has changed since this was written',
    );
    expect(sheet.grid![1]![1]).toBe(36);
  });

  it('has nothing to undo before a write, or twice', async () => {
    const sheet = memorySheet(read());
    expect((await undo(sheet)).kind).toBe('refused');
    await write(sheet);
    await undo(sheet);
    expect((await undo(sheet)).kind).toBe('refused');
  });
});
