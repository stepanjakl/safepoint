import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { inScratchDatabase, rowsOf } from '@/lib/engine/scratch.fixture';
import { readWholeSheet, type SheetRead } from '@/lib/sheets/composio';
import { ensureProcess } from '@/server/db/scope';
import { reads } from '@/server/db/schema';

import { keptRead, readAndKeep, whyNotWritable } from './run-reads';

// A run's read, kept in the database and read back. The provider is a
// stand-in: nothing reaches the network.

vi.mock('@/lib/sheets/composio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sheets/composio')>()),
  readWholeSheet: vi.fn(),
}));

const live: SheetRead = {
  readAt: '2026-11-13T09:00:00.000Z',
  connection: { userId: 'user', connectedAccountId: 'account' },
  spreadsheet: {
    id: 'sheet',
    url: 'https://sheets.invalid/sheet',
    title: 'Stand-in',
    timeZone: null,
    locale: null,
    tabIds: { Stock: 0 },
  },
  tabs: ['Stock'],
  requests: [],
  valueRanges: [
    {
      range: "'Stock'!A1:C3",
      // Cells as a sheet gives them: text, whole and fractional numbers, an
      // empty one, and a key order that is not alphabetical.
      values: [
        ['sku', 'on_hand', 'note'],
        ['EG-06', 38, ''],
        ['AV-RR', 12.5, 'two "words" and a é'],
      ],
    },
  ],
};

describe('a run’s kept reads', () => {
  const db = inScratchDatabase();
  beforeEach(() => vi.mocked(readWholeSheet).mockReset());

  const storedText = async () =>
    (
      await rowsOf<{ body: string }>(
        db(),
        sql`select body::text as body from reads order by id`,
      )
    ).map((row) => row.body);

  it('gives back the read that was kept, to the byte', async () => {
    vi.mocked(readWholeSheet).mockResolvedValueOnce(live);
    const kept = await readAndKeep('live');
    const got = await keptRead(kept.id);
    expect(got).toEqual(kept);
    // As a file of it was written (compact), and as the column holds it.
    expect(JSON.stringify(got)).toBe(JSON.stringify(kept));
    expect(await storedText()).toEqual([JSON.stringify(kept)]);
    expect(got!.tabs.find((tab) => tab.name === 'Stock')?.values).toEqual(
      live.valueRanges[0]!.values,
    );
  });

  it('keeps the captured read, with the label a person is shown', async () => {
    const kept = await readAndKeep('captured');
    expect(kept.source).toMatch(/^Captured read from /);
    expect(readWholeSheet).not.toHaveBeenCalled();
    expect(await keptRead(kept.id)).toEqual(kept);
    expect(whyNotWritable(kept)).toMatch(/captured read/);
  });

  it('keeps one read once: keeping it again answers the same read', async () => {
    vi.mocked(readWholeSheet).mockResolvedValue(live);
    const first = await readAndKeep('live');
    const again = await readAndKeep('live');
    expect(again).toEqual(first);
    // Together, as two requests can arrive.
    const together = await Promise.all([
      readAndKeep('live'),
      readAndKeep('live'),
    ]);
    expect(together).toEqual([first, first]);
    expect(await storedText()).toEqual([JSON.stringify(first)]);
  });

  it('says a read is not kept for an id that is not kept, or not an id', async () => {
    await readAndKeep('captured');
    expect(await keptRead('gone')).toBeNull();
    for (const id of ['../x', 'a/b', 'a.json', '', ' ', 'x'.repeat(81)])
      expect(await keptRead(id)).toBeNull();
  });

  it('names a read that is kept but cannot be read, rather than calling it gone', async () => {
    await ensureProcess(db(), 'brunch-orders');
    await db()
      .insert(reads)
      .values({
        process: 'brunch-orders',
        id: 'unreadable',
        readAt: new Date(),
        source: 'x',
        body: { id: 'unreadable', tabs: 'none' } as never,
      });
    await expect(keptRead('unreadable')).rejects.toThrow(
      'The kept read brunch-orders/unreadable does not fit the stored shape',
    );
  });
});
