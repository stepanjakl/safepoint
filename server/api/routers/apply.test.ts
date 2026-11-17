import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecisionMade, OutputSheet } from '@/lib/engine/apply';
import { capturedRead, capturedTabs } from '@/lib/engine/captured.fixture';
import { fingerprintOf, hashOf } from '@/lib/engine/fingerprint';
import { inScratchStorage } from '@/lib/engine/scratch.fixture';
import type { Database } from '@/server/db/client';
import { keepStandInRead } from '@/server/storage/reads.fixture';
import type { DefinitionSet, Proposal } from '@/lib/engine/types';
import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import { applyDecisions, keptApplication } from '@/server/storage/applications';
import { keepProposal } from '@/server/storage/proposals';
import { memorySheet } from '@/server/storage/sheet.fixture';
import { keepText } from '@/lib/engine/set.fixture';
import { putRevision } from '@/server/storage/rulebooks';
import { applications as applicationRows } from '@/server/db/schema';

import {
  accepted,
  caller,
  failure,
  keepAsCurrent,
  outdated,
} from '../run.fixture';
import {
  AT,
  LATER,
  keepRulesProposal,
  rulesFingerprint,
  startedRun,
} from '../kept-run.fixture';

// Apply, called in process on a scratch directory, with the sheet held in
// memory and the reads the captured one: nothing reaches the network.

const held = vi.hoisted(() => ({ sheet: null as unknown as OutputSheet }));
vi.mock('@/server/storage/brunch-orders-reads', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/server/storage/brunch-orders-reads')
    >();
  const { capturedRead } = await import('@/lib/engine/captured.fixture');
  const reads: Record<string, { id: string; source: string }> = {
    live: { id: 'live', source: 'Live read through Composio at Thursday' },
    captured: { id: 'captured', source: 'Captured read of the sheet' },
  };
  return {
    ...actual,
    keptRead: async (id: string) =>
      reads[id]
        ? {
            ...capturedRead(),
            ...reads[id],
            readAt: '2026-10-29T08:45:00.000Z',
          }
        : null,
    // The sheet the test holds, whenever the router reaches for the live one.
    liveSheet: {
      readNow: () => held.sheet.readNow(),
      readTab: (tab: string) => held.sheet.readTab(tab),
      addTab: (tab: string) => held.sheet.addTab(tab),
      writeRange: (tab: string, range: string, values: unknown[][]) =>
        held.sheet.writeRange(tab, range, values),
    },
  };
});

// The instructions a run must answer to for its write to reach the sheet.
const PUBLISHED = brunchOrdersProcess.instructions.text;
const EARLIER = `${PUBLISHED}\nAn earlier version.`;
const THURSDAY = '2026-10-29T08:45:00.000Z';
const SHEET_ENV = [
  'COMPOSIO_API_KEY',
  'COMPOSIO_USER_ID',
  'COMPOSIO_GOOGLESHEETS_ACCOUNT_ID',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
];

const record = (order: number) => ({
  action: 'set' as const,
  values: { order },
  reason: 'Worked out.',
  cited: [],
  unsure: null,
  verdict: 'ready' as const,
  checks: [],
});
const approve: DecisionMade = { kind: 'approve', at: THURSDAY };
const decisions = { 'EG-06': approve, 'CT-250': approve };

// Set by the suite below: where the proposals arranged here are kept.
let scratchDb!: () => Database;

/*
  A run kept on the server that has read `readId`, pinned the rulebook
  current for `text` (the version it runs under), and approved both records of
  the proposal kept for it.
*/
async function arrange(
  readId: string,
  text = PUBLISHED,
  rulebook: DefinitionSet = accepted,
) {
  const set = { ...rulebook, hash: hashOf(text) };
  await keepText(text);
  await keepAsCurrent(set);
  await keepStandInRead(scratchDb(), readId);
  const fingerprint = fingerprintOf(set);
  const proposal: Proposal = {
    fingerprint,
    readId,
    model: 'test',
    at: AT,
    // Whole cases that pass every blocking check of the rulebook.
    records: { 'EG-06': record(12), 'CT-250': record(10) },
  };
  await keepProposal(owner, proposal);
  // A version other than the declared one is published first, as a person
  // would, so a run can start under it.
  const version =
    text === PUBLISHED
      ? { hash: hashOf(PUBLISHED) }
      : (
          await caller().instructions.publish({
            process: 'brunch-orders',
            text,
            note: null,
          })
        ).version;
  const started = await caller().runs.start({
    process: 'brunch-orders',
    instructions: version.hash,
  });
  const run = { process: 'brunch-orders' as const, runId: started.id };
  await putRevision(owner, set, { reason: 'accepted' });
  await caller().runs.record({ ...run, readId, rulebook: fingerprint });
  await caller().decisions.recordMany({
    ...run,
    proposedAt: proposal.at,
    decisions: [
      { key: 'EG-06', kind: 'approve' },
      { key: 'CT-250', kind: 'approve' },
    ],
  });
  return { set, proposal, fingerprint, run };
}

describe('apply router', () => {
  scratchDb = inScratchStorage().database;
  let sheet: ReturnType<typeof memorySheet>;
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    for (const name of SHEET_ENV) vi.stubEnv(name, 'stand-in');
    sheet = memorySheet({ ...capturedRead(), id: 'live' });
    held.sheet = sheet;
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('preview', () => {
    it('says what the decisions write, from the sheet as it is now, and writes nothing', async () => {
      const { run } = await arrange('live');
      const got = await caller().application.preview(run);
      expect(got).toMatchObject({
        kind: 'preview',
        tab: 'Orders',
        notWritable: null,
        tabExists: false,
        problems: [],
        newlyFailing: [],
        application: null,
      });
      if (got.kind !== 'preview') return;
      expect(got.changes.map((c) => [c.key, c.after])).toEqual([
        ['EG-06', 12],
        ['CT-250', 10],
      ]);
      expect(got.names['EG-06']).toBeTruthy();
      expect(sheet.added).toEqual([]);
      expect(sheet.writes).toEqual([]);
    });

    it('is worked out without asking the sheet when the run cannot write', async () => {
      const { run } = await arrange('captured');
      const asked = vi.spyOn(sheet, 'readNow');
      const got = await caller().application.preview(run);
      expect(got).toMatchObject({
        kind: 'preview',
        notWritable:
          'This run used a captured read. Start a run from a live read to write to the sheet.',
        // Nothing was asked of the sheet, so every cell reads as new.
        tabExists: false,
        problems: [],
        newlyFailing: [],
      });
      if (got.kind !== 'preview') return;
      expect(got.changes).toHaveLength(2);
      expect(asked).not.toHaveBeenCalled();
    });

    it('says the sheet is not set up, where a live read cannot be written', async () => {
      const { run } = await arrange('live');
      vi.stubEnv('COMPOSIO_API_KEY', '');
      const asked = vi.spyOn(sheet, 'readNow');
      expect(await caller().application.preview(run)).toMatchObject({
        notWritable: 'Missing COMPOSIO_API_KEY.',
      });
      expect(asked).not.toHaveBeenCalled();
    });

    it('says a run on an earlier version of the instructions cannot write', async () => {
      const { run } = await arrange('live', EARLIER);
      const asked = vi.spyOn(sheet, 'readNow');
      expect(await caller().application.preview(run)).toMatchObject({
        kind: 'preview',
        notWritable:
          'This run answers to an earlier version of the instructions. Start a new run to write to the sheet.',
      });
      expect(asked).not.toHaveBeenCalled();
    });

    it('says why the sheet cannot take it, as problems', async () => {
      const { run } = await arrange('live');
      const tabs = capturedTabs();
      tabs.find((t) => t.name === 'Stock')!.values[1]![1] = 5;
      held.sheet = memorySheet({ ...capturedRead(tabs), id: 'live' });
      const got = await caller().application.preview(run);
      if (got.kind !== 'preview') throw new Error('Expected a preview.');
      expect(got.problems[0]).toBe(
        'The sheet has changed since this run read it (Stock). Start a new run to propose from what it holds now.',
      );
    });

    it('settles a write that was cut short from the sheet where it can be reached, and shows it as not confirmed where it cannot', async () => {
      const { run, set, proposal, fingerprint } = await arrange('live');
      // The write lands, but its block cannot be read back straight after.
      const unread: OutputSheet = {
        ...sheet,
        writeRange: async (tab, range, values) => {
          await sheet.writeRange(tab, range, values);
          sheet.failReads = 1;
          throw new Error('The service timed out.');
        },
      };
      await applyDecisions(
        owner,
        set,
        { ...capturedRead(), id: 'live', readAt: THURSDAY },
        fingerprint,
        proposal,
        decisions,
        [],
        unread,
      );
      expect(await keptApplication(owner, 'live', fingerprint)).toMatchObject({
        status: 'pending',
      });
      // Not reachable: shown as it was kept.
      vi.stubEnv('COMPOSIO_API_KEY', '');
      const asked = vi.spyOn(sheet, 'readTab');
      const unsettled = await caller().application.preview(run);
      expect(unsettled).toMatchObject({
        application: { status: 'pending' },
      });
      expect(asked).not.toHaveBeenCalled();
      // Reachable: settled by reading the block back.
      vi.stubEnv('COMPOSIO_API_KEY', 'stand-in');
      expect(await caller().application.preview(run)).toMatchObject({
        application: { status: 'verified', error: null },
      });
    });

    it('says the decisions were made on an earlier proposal, or that none is kept', async () => {
      const { run, proposal } = await arrange('live');
      // A newer proposal has been kept since they were made.
      await keepProposal(owner, { ...proposal, at: LATER });
      expect(await failure(caller().application.preview(run))).toEqual({
        code: 'BAD_GATEWAY',
        message:
          'These decisions were made on an earlier proposal. Decide on the current one.',
      });
      // A run on another read has no proposal kept for its rulebook.
      await keepStandInRead(scratchDb(), 'captured');
      const other = await startedRun('brunch-orders', 'captured');
      expect(await failure(caller().application.preview(other))).toEqual({
        code: 'BAD_GATEWAY',
        message: 'This run has no proposal kept.',
      });
    });
  });

  describe('write', () => {
    it('writes the decisions, reads them back and answers with the record', async () => {
      const { run, fingerprint } = await arrange('live');
      const got = await caller().application.write({
        ...run,
        acknowledged: [],
      });
      expect(got).toMatchObject({
        kind: 'applied',
        application: { status: 'verified', tab: 'Orders' },
      });
      expect(sheet.grid).toEqual([
        ['sku', 'order'],
        ['EG-06', 12],
        ['CT-250', 10],
      ]);
      expect(await keptApplication(owner, 'live', fingerprint)).toMatchObject({
        status: 'verified',
      });
      // A preview afterwards carries the record kept.
      expect(await caller().application.preview(run)).toMatchObject({
        application: { status: 'verified' },
      });
    });

    it('answers a refused write with the preview that says why, and writes nothing', async () => {
      const { run } = await arrange('live');
      const tabs = capturedTabs();
      tabs.find((t) => t.name === 'Stock')!.values[1]![1] = 5;
      held.sheet = memorySheet({ ...capturedRead(tabs), id: 'live' });
      const got = await caller().application.write({
        ...run,
        acknowledged: [],
      });
      expect(got).toMatchObject({
        kind: 'preview',
        tab: 'Orders',
        notWritable: null,
        problems: [expect.stringMatching(/^The sheet has changed since/)],
        application: null,
      });
      expect((held.sheet as typeof sheet).writes).toEqual([]);
    });

    it('will not write twice without an undo', async () => {
      const { run } = await arrange('live');
      const input = { ...run, acknowledged: [] };
      await caller().application.write(input);
      const again = await caller().application.write(input);
      expect(again).toMatchObject({
        kind: 'preview',
        problems: [
          'This run has already written to the Orders tab. Undo that first to write again.',
        ],
      });
      expect(sheet.writes).toHaveLength(1);
    });

    it('is refused where the run cannot write, after checking the proposal, and touches nothing', async () => {
      const captured = await arrange('captured');
      const asked = vi.spyOn(sheet, 'readNow');
      expect(
        await failure(
          caller().application.write({ ...captured.run, acknowledged: [] }),
        ),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message:
          'This run used a captured read. Start a run from a live read to write to the sheet.',
      });
      // The order of refusals: no proposal is said before that it cannot write.
      await keepStandInRead(scratchDb(), 'live');
      const none = await startedRun('brunch-orders', 'live');
      expect(
        await failure(
          caller().application.write({ ...none, acknowledged: [] }),
        ),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message: 'This run has no proposal kept.',
      });
      const earlier = await arrange('live', EARLIER);
      expect(
        await failure(
          caller().application.write({ ...earlier.run, acknowledged: [] }),
        ),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message:
          'This run answers to an earlier version of the instructions. Start a new run to write to the sheet.',
      });
      expect(asked).not.toHaveBeenCalled();
      expect(sheet.writes).toEqual([]);
    });

    it('is refused for decisions made on an earlier proposal', async () => {
      const { run, proposal } = await arrange('live');
      await keepProposal(owner, { ...proposal, at: LATER });
      expect(
        await failure(caller().application.write({ ...run, acknowledged: [] })),
      ).toMatchObject({
        message:
          'These decisions were made on an earlier proposal. Decide on the current one.',
      });
      expect(sheet.writes).toEqual([]);
    });

    it('answers a failure of the sheet as a bad gateway, in its own words', async () => {
      const { run } = await arrange('live');
      sheet.failAdd = true;
      expect(
        await caller().application.write({ ...run, acknowledged: [] }),
      ).toMatchObject({
        kind: 'applied',
        application: { status: 'failed', error: 'The sheet said no.' },
      });
      held.sheet = {
        ...sheet,
        readNow: async () => {
          throw new Error('The sheet could not be reached.\nMore detail.');
        },
      };
      expect(
        await failure(caller().application.write({ ...run, acknowledged: [] })),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message: 'The sheet could not be reached.\nMore detail.',
      });
    });
  });

  describe('undo', () => {
    it('puts the cells back and answers with the record', async () => {
      const original = [
        ['sku', 'order', 'note'],
        ['EG-06', 24, 'keep'],
        ['CT-250', 20, 'keep'],
      ];
      held.sheet = sheet = memorySheet(
        { ...capturedRead(), id: 'live' },
        structuredClone(original),
      );
      const { run } = await arrange('live');
      await caller().application.write({ ...run, acknowledged: [] });
      expect(sheet.grid?.[1]).toEqual(['EG-06', 12, 'keep']);
      expect(await caller().application.undo(run)).toMatchObject({
        kind: 'applied',
        application: { status: 'undone', undoneAt: expect.any(String) },
      });
      expect(sheet.grid).toEqual(original);
    });

    it('stays open for a run on an earlier version of the instructions', async () => {
      const { run, set, proposal, fingerprint } = await arrange(
        'live',
        EARLIER,
      );
      // Written while the run could, then the instructions moved on.
      await applyDecisions(
        owner,
        set,
        { ...capturedRead(), id: 'live', readAt: THURSDAY },
        fingerprint,
        proposal,
        decisions,
        [],
        sheet,
      );
      expect(await caller().application.undo(run)).toMatchObject({
        kind: 'applied',
        application: { status: 'undone' },
      });
    });

    it('says when there is nothing to undo, as a conflict', async () => {
      const { run } = await arrange('live');
      expect(await failure(caller().application.undo(run))).toEqual({
        code: 'CONFLICT',
        message: 'There is no write to undo.',
      });
    });

    it('is refused where the sheet cannot be reached, without touching it', async () => {
      const { run } = await arrange('captured');
      const asked = vi.spyOn(sheet, 'readTab');
      expect(await failure(caller().application.undo(run))).toEqual({
        code: 'BAD_GATEWAY',
        message:
          'This run used a captured read. Start a run from a live read to write to the sheet.',
      });
      expect(asked).not.toHaveBeenCalled();
    });
  });

  describe('a rulebook that no longer fits the read', () => {
    it('is said to be stale by every procedure, before the sheet is asked anything', async () => {
      await putRevision(
        owner,
        { ...outdated, hash: hashOf(PUBLISHED) },
        {
          reason: 'accepted',
        },
      );
      const { fingerprint: current } = await arrange('live');
      // A run pinned to the rulebook as it was before the read stopped fitting it.
      const old = fingerprintOf({ ...outdated, hash: hashOf(PUBLISHED) });
      const started = await caller().runs.start({
        process: 'brunch-orders',
        instructions: hashOf(PUBLISHED),
      });
      const run = { process: 'brunch-orders' as const, runId: started.id };
      await caller().runs.record({ ...run, readId: 'live', rulebook: old });
      const stale = {
        kind: 'stale',
        rulebook: old,
        problems: [expect.objectContaining({ problem: expect.any(String) })],
        current,
      };
      const asked = vi.spyOn(sheet, 'readNow');
      await expect(caller().application.preview(run)).resolves.toEqual(stale);
      await expect(
        caller().application.write({ ...run, acknowledged: [] }),
      ).resolves.toEqual(stale);
      await expect(caller().application.undo(run)).resolves.toEqual(stale);
      expect(asked).not.toHaveBeenCalled();
      expect(sheet.writes).toEqual([]);
    });
  });

  it('refuses an input that does not fit, before reaching storage', async () => {
    const { run } = await arrange('live');
    const write = { ...run, acknowledged: [] };
    for (const refused of [
      caller().application.preview({ ...run, runId: '' }),
      caller().application.preview({ ...run, runId: '../x' }),
      caller().application.preview({
        ...run,
        process: 'support-handoff' as never,
      }),
      // The old inputs, by which the screens named a run before the server
      // kept it, are not taken.
      caller().application.preview({ ...run, text: PUBLISHED } as never),
      caller().application.preview({ ...run, decisions: {} } as never),
      caller().application.preview({
        ...run,
        rulebook: 'ABCDEF012345',
      } as never),
      caller().application.write({
        ...write,
        acknowledged: undefined as never,
      }),
      caller().application.write({
        ...write,
        acknowledged: Array(1001).fill('x') as string[],
      }),
      caller().application.write({ ...write, extra: 1 } as never),
      caller().application.undo({ ...run, readId: 'live' } as never),
    ])
      expect((await failure(refused)).code).toBe('BAD_REQUEST');
    expect(sheet.writes).toEqual([]);
  });

  it('says the read is gone', async () => {
    const { run } = await arrange('live');
    // Kept as a row, but not a read the server can give any more.
    await keepStandInRead(scratchDb(), 'gone');
    await caller().runs.record({ ...run, readId: 'gone' });
    expect(await failure(caller().application.preview(run))).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringMatching(/no longer kept on the server/),
    });
  });

  describe('through a kept run', () => {
    // A run kept on the server, on the live read, with a proposal of three
    // records: two ready, one a blocking check stops.
    async function kept() {
      await keepRulesProposal(scratchDb(), 'live');
      const run = await startedRun('brunch-orders', 'live');
      return { run, on: { ...run, proposedAt: AT } };
    }
    const decideAll = (on: {
      process: string;
      runId: string;
      proposedAt: string;
    }) =>
      caller().decisions.recordMany({
        ...on,
        decisions: [
          { key: 'EG-06', kind: 'change', values: { order: 24 } },
          { key: 'CT-250', kind: 'approve' },
          { key: 'SD-01', kind: 'reject' },
        ],
      });
    const runIds = async () =>
      (
        await scratchDb()
          .select({ runId: applicationRows.runId })
          .from(applicationRows)
      ).map((row) => row.runId);

    it('writes exactly what the server holds decided, and records the run', async () => {
      const { run, on } = await kept();
      await decideAll(on);
      const preview = await caller().application.preview(run);
      if (preview.kind !== 'preview') throw new Error('Expected a preview.');
      expect(preview.problems).toEqual([]);
      expect(preview.changes.map((c) => [c.key, c.after])).toEqual([
        ['EG-06', 24],
        ['CT-250', 10],
      ]);
      const got = await caller().application.write({
        ...run,
        acknowledged: [],
      });
      expect(got).toMatchObject({
        kind: 'applied',
        application: {
          status: 'verified',
          proposedAt: AT,
          decisions: {
            'EG-06': { kind: 'change', values: { order: 24 } },
            'CT-250': { kind: 'approve', values: { order: 10 } },
            'SD-01': { kind: 'reject', values: null },
          },
        },
      });
      expect(sheet.grid).toEqual([
        ['sku', 'order'],
        ['EG-06', 24],
        ['CT-250', 10],
      ]);
      expect(await runIds()).toEqual([run.runId]);
    });

    it('is refused while a record is undecided, and writes nothing', async () => {
      const { run, on } = await kept();
      await caller().decisions.record({
        ...on,
        decision: { key: 'EG-06', kind: 'approve' },
      });
      const got = await caller().application.write({
        ...run,
        acknowledged: [],
      });
      expect(got).toMatchObject({
        kind: 'preview',
        problems: ['Not decided yet: CT-250, SD-01.'],
      });
      expect(sheet.writes).toEqual([]);
      expect(await runIds()).toEqual([]);
    });

    it('says the decisions were made on an earlier proposal, when they were', async () => {
      const { run, on } = await kept();
      await decideAll(on);
      await keepRulesProposal(scratchDb(), 'live', { at: LATER });
      expect(await failure(caller().application.preview(run))).toEqual({
        code: 'BAD_GATEWAY',
        message:
          'These decisions were made on an earlier proposal. Decide on the current one.',
      });
      // A run that decided nothing yet is only undecided.
      const fresh = await startedRun('brunch-orders', 'live');
      const preview = await caller().application.preview(fresh);
      expect(preview).toMatchObject({
        problems: ['Not decided yet: EG-06, CT-250, SD-01.'],
      });
    });

    it('refuses a decision while the write is in flight, and writes what it began with', async () => {
      const { run, on } = await kept();
      await decideAll(on);
      const gate = sheet.hold('writeRange');
      const writing = caller().application.write({ ...run, acknowledged: [] });
      await gate.reached;
      expect(
        await failure(
          caller().decisions.record({
            ...on,
            decision: { key: 'CT-250', kind: 'reject' },
          }),
        ),
      ).toEqual({
        code: 'CONFLICT',
        message:
          'The last write to the Orders tab is still being made. Try again in a moment.',
      });
      gate.open();
      expect(await writing).toMatchObject({
        kind: 'applied',
        application: { status: 'verified' },
      });
      expect(sheet.grid?.[2]).toEqual(['CT-250', 10]);
      // Once it has landed, deciding is open again; the write keeps what it wrote.
      await caller().decisions.record({
        ...on,
        decision: { key: 'CT-250', kind: 'reject' },
      });
      expect(
        await keptApplication(owner, 'live', rulesFingerprint),
      ).toMatchObject({ decisions: { 'CT-250': { kind: 'approve' } } });
    });

    it('gives the write up, unwritten, when a decision moved after it read them', async () => {
      const { run, on } = await kept();
      await decideAll(on);
      // The write has read the decisions and is reading the sheet now.
      const gate = sheet.hold('readNow');
      const writing = caller().application.write({ ...run, acknowledged: [] });
      await gate.reached;
      await caller().decisions.record({
        ...on,
        decision: { key: 'CT-250', kind: 'reject' },
      });
      gate.open();
      expect(await writing).toMatchObject({
        kind: 'preview',
        problems: [
          'A decision was changed while this write was being prepared. Look at the decisions again and write.',
        ],
      });
      expect(sheet.writes).toEqual([]);
      expect(await runIds()).toEqual([]);
      // Asked again, it writes what is decided now.
      expect(
        await caller().application.write({ ...run, acknowledged: [] }),
      ).toMatchObject({ kind: 'applied' });
      expect(sheet.grid).toEqual([
        ['sku', 'order'],
        ['EG-06', 24],
      ]);
    });

    it('undoes what it wrote, a discarded run too, and writes nothing more once discarded', async () => {
      const { run, on } = await kept();
      await decideAll(on);
      await caller().application.write({ ...run, acknowledged: [] });
      await caller().runs.discard(run);
      expect(
        await failure(caller().application.write({ ...run, acknowledged: [] })),
      ).toEqual({
        code: 'CONFLICT',
        message: 'This run was discarded. Start a new run.',
      });
      expect(await failure(caller().application.preview(run))).toMatchObject({
        code: 'CONFLICT',
      });
      expect(await caller().application.undo(run)).toMatchObject({
        kind: 'applied',
        application: { status: 'undone' },
      });
    });

    it('refuses a run with nothing to write from yet, or not kept', async () => {
      const started = await caller().runs.start({
        process: 'brunch-orders',
        instructions: hashOf(PUBLISHED),
      });
      const run = { process: started.process, runId: started.id };
      expect(await failure(caller().application.preview(run))).toEqual({
        code: 'CONFLICT',
        message: 'This run has not read its data yet.',
      });
      await keepStandInRead(scratchDb(), 'live');
      await caller().runs.record({ ...run, readId: 'live' });
      expect(await failure(caller().application.preview(run))).toEqual({
        code: 'CONFLICT',
        message: 'This run has not calculated on a rulebook yet.',
      });
      expect(
        await failure(
          caller().application.preview({ ...run, runId: 'run-nobody' }),
        ),
      ).toEqual({
        code: 'NOT_FOUND',
        message: 'This run is not kept on the server.',
      });
    });
  });
});
