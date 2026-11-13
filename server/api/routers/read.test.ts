import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inScratchDirectory } from '@/lib/definitions/scratch.fixture';
import { readWholeSheet, type SheetRead } from '@/lib/sheets/composio';
import { READ_GONE } from '@/server/storage/brunch-orders-reads';

import { appRouter } from '../root';

// A run's read, called in process on files in a scratch directory. The
// provider is a stand-in: nothing reaches the network.

vi.mock('@/lib/sheets/composio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sheets/composio')>()),
  readWholeSheet: vi.fn(),
}));

const SHEET_ENV = [
  'COMPOSIO_API_KEY',
  'COMPOSIO_USER_ID',
  'COMPOSIO_GOOGLESHEETS_ACCOUNT_ID',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
];

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
      range: "'Stock'!A1:B3",
      values: [
        ['sku', 'on_hand'],
        ['EG-06', 38],
        ['AV-RR', 12],
      ],
    },
  ],
};

const caller = () =>
  appRouter.createCaller({
    request: new Request('http://localhost:3000/api/trpc'),
  });

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(TRPCError);
  const { code, message } = error as TRPCError;
  return { code, message };
}

describe('read router', () => {
  const scratch = inScratchDirectory();
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.mocked(readWholeSheet).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('keeps a read of the live sheet, and gives it back by its id', async () => {
    for (const name of SHEET_ENV) vi.stubEnv(name, 'stand-in');
    vi.mocked(readWholeSheet).mockResolvedValueOnce(live);
    const kept = await caller().read.keep({ source: 'live' });
    expect(kept).toMatchObject({
      readAt: live.readAt,
      spreadsheet: { title: 'Stand-in', url: 'https://sheets.invalid/sheet' },
      tabs: expect.arrayContaining([{ name: 'Stock', rows: 3 }]),
      problems: expect.any(Array),
    });
    const got = await caller().read.get({ id: kept.id });
    expect(got).toMatchObject({ id: kept.id, readAt: live.readAt });
    expect(got.tabs.find((tab) => tab.name === 'Stock')?.values).toEqual(
      live.valueRanges[0]!.values,
    );
  });

  it('keeps the captured read with no network', async () => {
    const kept = await caller().read.keep({ source: 'captured' });
    expect(kept.source).toMatch(/^Captured read/);
    expect(readWholeSheet).not.toHaveBeenCalled();
    await expect(caller().read.get({ id: kept.id })).resolves.toMatchObject({
      id: kept.id,
    });
  });

  it('refuses an input that does not fit, before reaching storage', async () => {
    for (const refused of [
      caller().read.get({ id: 'x'.repeat(81) }),
      caller().read.get({ id: 'a', extra: 1 } as never),
      caller().read.keep({ source: 'elsewhere' as never }),
    ])
      expect((await failure(refused)).code).toBe('BAD_REQUEST');
  });

  it('says a read is no longer kept, and names one that cannot be read', async () => {
    expect(await failure(caller().read.get({ id: 'gone' }))).toEqual({
      code: 'NOT_FOUND',
      message: READ_GONE,
    });
    const reads = path.join(scratch(), 'data', 'brunch-orders', 'reads');
    mkdirSync(reads, { recursive: true });
    writeFileSync(path.join(reads, 'broken.json'), '{');
    expect(await failure(caller().read.get({ id: 'broken' }))).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'data/brunch-orders/reads/broken.json is not valid JSON.',
    });
  });

  it('says what is missing before reaching the sheet', async () => {
    for (const name of SHEET_ENV) vi.stubEnv(name, '');
    const missing = {
      code: 'SERVICE_UNAVAILABLE',
      message: `Missing ${SHEET_ENV.join(', ')}.`,
    };
    expect(await failure(caller().read.keep({ source: 'live' }))).toEqual(
      missing,
    );
    expect(await failure(caller().read.capture())).toEqual(missing);
    expect(readWholeSheet).not.toHaveBeenCalled();
  });

  it('answers a failed read as a bad gateway, with its own words', async () => {
    for (const name of SHEET_ENV) vi.stubEnv(name, 'stand-in');
    vi.mocked(readWholeSheet).mockRejectedValueOnce(new Error('Sheet down.'));
    expect(await failure(caller().read.keep({ source: 'live' }))).toEqual({
      code: 'BAD_GATEWAY',
      message: 'Sheet down.',
    });
  });
});
