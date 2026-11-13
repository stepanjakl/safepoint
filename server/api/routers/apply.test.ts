import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecisionMade, OutputSheet } from '@/lib/definitions/apply';
import { capturedRead, capturedTabs } from '@/lib/definitions/captured.fixture';
import { fingerprintOf, hashOf } from '@/lib/definitions/fingerprint';
import { inScratchDirectory } from '@/lib/definitions/scratch.fixture';
import type { DefinitionSet, Proposal } from '@/lib/definitions/types';
import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import { applyDecisions, keptApplication } from '@/server/storage/applications';
import { writeKept } from '@/server/storage/files';
import { runKeyOf } from '@/server/storage/proposals';
import { runFile } from '@/server/storage/run-key';
import { memorySheet } from '@/server/storage/sheet.fixture';
import { putRevision } from '@/server/storage/rulebooks';

import {
  accepted,
  caller,
  failure,
  keepAsCurrent,
  outdated,
} from '../run.fixture';

// Apply, called in process on a scratch directory, with the sheet held in
// memory and the reads the captured one: nothing reaches the network.

const held = vi.hoisted(() => ({ sheet: null as unknown as OutputSheet }));
vi.mock('@/server/storage/brunch-orders-reads', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/server/storage/brunch-orders-reads')
    >();
  const { capturedRead } = await import('@/lib/definitions/captured.fixture');
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

// The rulebook current for `text`, and a proposal kept for `readId` on it.
async function arrange(
  readId: string,
  text = PUBLISHED,
  rulebook: DefinitionSet = accepted,
) {
  const set = { ...rulebook, hash: hashOf(text) };
  await keepAsCurrent(set);
  const fingerprint = fingerprintOf(set);
  const proposal: Proposal = {
    fingerprint,
    readId,
    model: 'test',
    at: '2026-10-29T09:00:00.000Z',
    // Whole cases that pass every blocking check of the rulebook.
    records: { 'EG-06': record(12), 'CT-250': record(10) },
  };
  await writeKept(
    runFile('proposals', runKeyOf(owner, readId, fingerprint)),
    proposal,
  );
  return {
    set,
    proposal,
    fingerprint,
    run: {
      text,
      readId,
      rulebook: fingerprint,
      evaluation: 'rules' as const,
    },
    decided: { proposedAt: proposal.at, decisions },
  };
}

describe('apply router', () => {
  inScratchDirectory();
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
      const { run, decided } = await arrange('live');
      const got = await caller().application.preview({ ...run, ...decided });
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
      const { run, decided } = await arrange('captured');
      const asked = vi.spyOn(sheet, 'readNow');
      const got = await caller().application.preview({ ...run, ...decided });
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
      const { run, decided } = await arrange('live');
      vi.stubEnv('COMPOSIO_API_KEY', '');
      const asked = vi.spyOn(sheet, 'readNow');
      expect(
        await caller().application.preview({ ...run, ...decided }),
      ).toMatchObject({
        notWritable: 'Missing COMPOSIO_API_KEY.',
      });
      expect(asked).not.toHaveBeenCalled();
    });

    it('says a run on an earlier version of the instructions cannot write', async () => {
      const { run, decided } = await arrange('live', EARLIER);
      const asked = vi.spyOn(sheet, 'readNow');
      expect(
        await caller().application.preview({ ...run, ...decided }),
      ).toMatchObject({
        kind: 'preview',
        notWritable:
          'This run answers to an earlier version of the instructions. Start a new run to write to the sheet.',
      });
      expect(asked).not.toHaveBeenCalled();
    });

    it('says why the sheet cannot take it, as problems', async () => {
      const { run, decided } = await arrange('live');
      const tabs = capturedTabs();
      tabs.find((t) => t.name === 'Stock')!.values[1]![1] = 5;
      held.sheet = memorySheet({ ...capturedRead(tabs), id: 'live' });
      const got = await caller().application.preview({ ...run, ...decided });
      if (got.kind !== 'preview') throw new Error('Expected a preview.');
      expect(got.problems[0]).toBe(
        'The sheet has changed since this run read it (Stock). Start a new run to propose from what it holds now.',
      );
    });

    it('settles a write that was cut short from the sheet where it can be reached, and shows it as not confirmed where it cannot', async () => {
      const { run, decided, set, proposal, fingerprint } =
        await arrange('live');
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
      const unsettled = await caller().application.preview({
        ...run,
        ...decided,
      });
      expect(unsettled).toMatchObject({
        application: { status: 'pending' },
      });
      expect(asked).not.toHaveBeenCalled();
      // Reachable: settled by reading the block back.
      vi.stubEnv('COMPOSIO_API_KEY', 'stand-in');
      expect(
        await caller().application.preview({ ...run, ...decided }),
      ).toMatchObject({ application: { status: 'verified', error: null } });
    });

    it('says the decisions are not on the proposal kept, or that none is', async () => {
      const { run, decided } = await arrange('live');
      expect(
        await failure(
          caller().application.preview({
            ...run,
            ...decided,
            proposedAt: '2026-10-29T10:00:00.000Z',
          }),
        ),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message:
          'These decisions were made on an earlier proposal. Decide on the current one.',
      });
      // Another read has none kept for the rulebook.
      expect(
        await failure(
          caller().application.preview({
            ...run,
            ...decided,
            readId: 'captured',
          }),
        ),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message: 'This run has no proposal kept.',
      });
    });
  });

  describe('write', () => {
    it('writes the decisions, reads them back and answers with the record', async () => {
      const { run, decided, fingerprint } = await arrange('live');
      const got = await caller().application.write({
        ...run,
        ...decided,
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
      expect(
        await caller().application.preview({ ...run, ...decided }),
      ).toMatchObject({ application: { status: 'verified' } });
    });

    it('answers a refused write with the preview that says why, and writes nothing', async () => {
      const { run, decided } = await arrange('live');
      const tabs = capturedTabs();
      tabs.find((t) => t.name === 'Stock')!.values[1]![1] = 5;
      held.sheet = memorySheet({ ...capturedRead(tabs), id: 'live' });
      const got = await caller().application.write({
        ...run,
        ...decided,
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
      const { run, decided } = await arrange('live');
      const input = { ...run, ...decided, acknowledged: [] };
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
          caller().application.write({
            ...captured.run,
            ...captured.decided,
            acknowledged: [],
          }),
        ),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message:
          'This run used a captured read. Start a run from a live read to write to the sheet.',
      });
      // The order of refusals: no proposal is said before that it cannot write.
      expect(
        await failure(
          caller().application.write({
            ...captured.run,
            ...captured.decided,
            readId: 'live',
            acknowledged: [],
          }),
        ),
      ).toEqual({
        code: 'BAD_GATEWAY',
        message: 'This run has no proposal kept.',
      });
      const earlier = await arrange('live', EARLIER);
      expect(
        await failure(
          caller().application.write({
            ...earlier.run,
            ...earlier.decided,
            acknowledged: [],
          }),
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
      const { run, decided } = await arrange('live');
      expect(
        await failure(
          caller().application.write({
            ...run,
            ...decided,
            proposedAt: '2026-10-29T10:00:00.000Z',
            acknowledged: [],
          }),
        ),
      ).toMatchObject({
        message:
          'These decisions were made on an earlier proposal. Decide on the current one.',
      });
      expect(sheet.writes).toEqual([]);
    });

    it('answers a failure of the sheet as a bad gateway, in its own words', async () => {
      const { run, decided } = await arrange('live');
      sheet.failAdd = true;
      expect(
        await caller().application.write({
          ...run,
          ...decided,
          acknowledged: [],
        }),
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
        await failure(
          caller().application.write({
            ...run,
            ...decided,
            acknowledged: [],
          }),
        ),
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
      const { run, decided } = await arrange('live');
      await caller().application.write({
        ...run,
        ...decided,
        acknowledged: [],
      });
      expect(sheet.grid?.[1]).toEqual(['EG-06', 12, 'keep']);
      expect(await caller().application.undo(run)).toMatchObject({
        kind: 'applied',
        application: { status: 'undone', undoneAt: expect.any(String) },
      });
      expect(sheet.grid).toEqual(original);
    });

    it('stays open for a run on an earlier version of the instructions', async () => {
      const { run, decided, set, proposal, fingerprint } = await arrange(
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
        decided.decisions,
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
      const { run: current, decided } = await arrange('live');
      const old = fingerprintOf({ ...outdated, hash: hashOf(PUBLISHED) });
      const run = { ...current, rulebook: old };
      const stale = {
        kind: 'stale',
        rulebook: old,
        problems: [expect.objectContaining({ problem: expect.any(String) })],
        current: current.rulebook,
      };
      const asked = vi.spyOn(sheet, 'readNow');
      await expect(
        caller().application.preview({ ...run, ...decided }),
      ).resolves.toEqual(stale);
      await expect(
        caller().application.write({ ...run, ...decided, acknowledged: [] }),
      ).resolves.toEqual(stale);
      await expect(caller().application.undo(run)).resolves.toEqual(stale);
      expect(asked).not.toHaveBeenCalled();
      expect(sheet.writes).toEqual([]);
    });
  });

  it('refuses an input that does not fit, before reaching storage', async () => {
    const { run, decided } = await arrange('live');
    const write = { ...run, ...decided, acknowledged: [] };
    for (const refused of [
      caller().application.preview({ ...run, ...decided, text: '' }),
      caller().application.preview({ ...run, ...decided, readId: '' }),
      caller().application.preview({ ...run, ...decided, readId: '../x' }),
      // Apply names the rulebook it calculated on: none is not an option.
      caller().application.preview({
        ...run,
        ...decided,
        rulebook: undefined as never,
      }),
      caller().application.preview({
        ...run,
        ...decided,
        rulebook: 'not-an-id',
      }),
      caller().application.preview({
        ...run,
        ...decided,
        decisions: { 'EG-06': { kind: 'maybe', at: 'x' } } as never,
      }),
      caller().application.write({
        ...write,
        acknowledged: undefined as never,
      }),
      caller().application.write({
        ...write,
        acknowledged: Array(1001).fill('x') as string[],
      }),
      caller().application.write({ ...write, extra: 1 } as never),
      caller().application.undo({ ...run, rulebook: 'ABCDEF012345' }),
    ])
      expect((await failure(refused)).code).toBe('BAD_REQUEST');
    expect(sheet.writes).toEqual([]);
  });

  it('says the read is gone', async () => {
    const { run, decided } = await arrange('live');
    expect(
      await failure(
        caller().application.preview({ ...run, ...decided, readId: 'gone' }),
      ),
    ).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringMatching(/no longer kept on the server/),
    });
  });
});
