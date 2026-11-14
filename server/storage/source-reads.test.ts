import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  inScratchDatabase,
  inScratchDirectory,
  rowsOf,
} from '@/lib/definitions/scratch.fixture';
import { readWholeSheet, type SheetRead } from '@/lib/sheets/composio';
import { sourceReads } from '@/server/db/schema';

import {
  keptSourceReadSchema,
  latestSummary,
  readSource,
  sourceValues,
} from './source-reads';

// A source's own reads: kept, the latest of them, and the captured copy until
// there is one. The provider is a stand-in: nothing reaches the network.

vi.mock('@/lib/sheets/composio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sheets/composio')>()),
  readWholeSheet: vi.fn(),
}));

const SOURCE = 'brunch-store-sheet';

const sheet = (readAt: string, count: number): SheetRead => ({
  readAt,
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
      range: "'Stock'!A1:B3",
      values: [
        ['Item', 'Count'],
        ['Eggs', count],
        ['Bread', 4.5],
      ],
    },
  ],
});

// A kept read written straight to the table, under any id.
const body = (readId: string, readAt = '2026-11-13T09:00:00.000Z') =>
  keptSourceReadSchema.parse({
    readId,
    readAt,
    origin: 'live',
    title: 'Kept',
    url: null,
    resources: [{ name: 'Stock', values: [['Item'], [readId]] }],
  });

describe('a source’s kept reads', () => {
  const db = inScratchDatabase();
  const insert = (readId: string, readAt?: string) =>
    db()
      .insert(sourceReads)
      .values({
        source: SOURCE,
        readId,
        readAt: new Date(readAt ?? '2026-11-13T09:00:00.000Z'),
        body: body(readId, readAt),
      });
  beforeEach(() => vi.mocked(readWholeSheet).mockReset());

  describe('with the captured copy to fall back on', () => {
    it('summarises the captured copy when nothing is kept', async () => {
      const summary = await latestSummary(SOURCE);
      expect(summary).toMatchObject({
        readId: 'captured',
        origin: 'captured',
      });
      expect(summary!.resources.length).toBeGreaterThan(0);
      expect(await sourceValues(SOURCE, 'captured')).toMatchObject({
        readId: 'captured',
      });
    });

    it('gives way to a read once there is one, and falls back if it cannot be read', async () => {
      await insert('2026-11-13T09-00-00-000Z-aaaaaaaa');
      expect(await latestSummary(SOURCE)).toMatchObject({
        readId: '2026-11-13T09-00-00-000Z-aaaaaaaa',
        origin: 'live',
      });
      // A later read that does not fit the stored shape: the page still
      // shows what it can, the captured copy, and does not fail.
      await db()
        .insert(sourceReads)
        .values({
          source: SOURCE,
          readId: '2026-11-14T09-00-00-000Z-bbbbbbbb',
          readAt: new Date('2026-11-14T09:00:00.000Z'),
          body: { readId: 'x' },
        });
      expect(await latestSummary(SOURCE)).toMatchObject({
        readId: 'captured',
      });
      // Asked for itself, it is named.
      await expect(
        sourceValues(SOURCE, '2026-11-14T09-00-00-000Z-bbbbbbbb'),
      ).rejects.toThrow(
        'The kept read brunch-store-sheet/2026-11-14T09-00-00-000Z-bbbbbbbb does not fit the stored shape',
      );
    });
  });

  describe('with no copy in the working directory', () => {
    inScratchDirectory();

    it('has nothing for a source never read', async () => {
      expect(await latestSummary(SOURCE)).toBeNull();
      expect(await sourceValues(SOURCE, 'captured')).toBeNull();
    });
  });

  it('is the last by id, as the last file name was, not the last written or read', async () => {
    // Written in an order that is neither the ids' nor the times'.
    await insert('2026-11-12T09-00-00-000Z-cccccccc', '2026-11-20T00:00:00Z');
    await insert('2026-11-14T09-00-00-000Z-aaaaaaaa', '2026-11-01T00:00:00Z');
    await insert('2026-11-13T09-00-00-000Z-bbbbbbbb', '2026-11-30T00:00:00Z');
    expect(await latestSummary(SOURCE)).toMatchObject({
      readId: '2026-11-14T09-00-00-000Z-aaaaaaaa',
    });
  });

  it('orders ids by byte, whatever the database’s collation', async () => {
    const ids = [
      'a-1',
      'a_1',
      'a1',
      'A1',
      'B',
      'b',
      'a-Z',
      '2026-11-14T09-00-00-000Z-abc',
    ];
    for (const id of ids) await insert(id);
    // The last file name, as JavaScript sorts strings.
    expect((await latestSummary(SOURCE))!.readId).toBe([...ids].sort().at(-1));
    // Serves the query: the index, not a sort of every read, is its plan.
    const plan = await rowsOf<{ 'QUERY PLAN': string }>(
      db(),
      sql`set enable_seqscan = off`,
    ).then(() =>
      rowsOf<{ 'QUERY PLAN': string }>(
        db(),
        sql`explain select read_id from source_reads where source = ${SOURCE} order by read_id collate "C" desc limit 1`,
      ),
    );
    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain(
      'source_reads_latest',
    );
  });

  it('keeps a read, summarises it, and gives its values back to the byte', async () => {
    vi.mocked(readWholeSheet).mockResolvedValueOnce(
      sheet('2026-11-13T09:00:00.000Z', 12),
    );
    const read = await readSource(SOURCE);
    expect(read).toMatchObject({
      origin: 'live',
      resources: [{ name: 'Stock', rows: 2, columns: ['Item', 'Count'] }],
    });
    expect(await latestSummary(SOURCE)).toEqual(read);
    expect(await sourceValues(SOURCE, read.readId)).toEqual({
      readId: read.readId,
      resources: [
        {
          name: 'Stock',
          values: [
            ['Item', 'Count'],
            ['Eggs', 12],
            ['Bread', 4.5],
          ],
        },
      ],
    });
    const [stored] = await rowsOf<{ body: string }>(
      db(),
      sql`select body::text as body from source_reads`,
    );
    expect(JSON.parse(stored!.body)).toMatchObject({ readId: read.readId });
    expect(stored!.body).toBe(
      JSON.stringify({
        readId: read.readId,
        readAt: '2026-11-13T09:00:00.000Z',
        origin: 'live',
        title: 'Stand-in',
        url: 'https://sheets.invalid/sheet',
        resources: [
          {
            name: 'Stock',
            values: [
              ['Item', 'Count'],
              ['Eggs', 12],
              ['Bread', 4.5],
            ],
          },
        ],
      }),
    );
  });

  it('keeps the same read once, however many times it is taken', async () => {
    vi.mocked(readWholeSheet).mockResolvedValue(
      sheet('2026-11-13T09:00:00.000Z', 12),
    );
    const first = await readSource(SOURCE);
    expect(await readSource(SOURCE)).toEqual(first);
    await Promise.all([readSource(SOURCE), readSource(SOURCE)]);
    expect(await db().select().from(sourceReads)).toHaveLength(1);
  });

  it('is not found for an id that is not kept or is not an id', async () => {
    for (const id of ['gone', '../x', 'a/b', '', 'x'.repeat(81)])
      expect(await sourceValues(SOURCE, id)).toBeNull();
  });
});
