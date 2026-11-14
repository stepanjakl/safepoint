import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inScratchStorage } from '@/lib/definitions/scratch.fixture';
import { readWholeSheet, type SheetRead } from '@/lib/sheets/composio';
import { sourceReads } from '@/server/db/schema';

import { appRouter } from '../root';

// The sources procedures, called in process, on a scratch database and directory
// (the captured copy in fixtures/ is not found there). The provider is a stand-in: nothing reaches the network.

vi.mock('@/lib/sheets/composio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sheets/composio')>()),
  readWholeSheet: vi.fn(),
}));

const SOURCE = 'brunch-store-sheet';
const SHEET_ENV = [
  'COMPOSIO_API_KEY',
  'COMPOSIO_USER_ID',
  'COMPOSIO_GOOGLESHEETS_ACCOUNT_ID',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
];

const sheet: SheetRead = {
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
        ['Item', 'Count'],
        ['Eggs', 12],
        ['Bread', 4],
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

describe('sources router', () => {
  const { database: db } = inScratchStorage();
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.mocked(readWholeSheet).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('summarises a source, and has nothing for one never read', async () => {
    await expect(caller().sources.summary({ source: SOURCE })).resolves.toBe(
      null,
    );
  });

  it('reads a source afresh, keeps the read, and gives its values', async () => {
    for (const name of SHEET_ENV) vi.stubEnv(name, 'stand-in');
    vi.mocked(readWholeSheet).mockResolvedValueOnce(sheet);
    const read = await caller().sources.read({ source: SOURCE });
    expect(read).toMatchObject({
      origin: 'live',
      title: 'Stand-in',
      resources: [{ name: 'Stock', rows: 2, columns: ['Item', 'Count'] }],
    });
    await expect(caller().sources.summary({ source: SOURCE })).resolves.toEqual(
      read,
    );
    await expect(
      caller().sources.values({ source: SOURCE, read: read.readId }),
    ).resolves.toEqual({
      readId: read.readId,
      resources: [{ name: 'Stock', values: sheet.valueRanges[0]!.values }],
    });
  });

  it('refuses an input that does not fit, before reaching storage', async () => {
    expect(
      (
        await failure(
          caller().sources.summary({ source: SOURCE, extra: 1 } as never),
        )
      ).code,
    ).toBe('BAD_REQUEST');
    expect(
      (
        await failure(
          caller().sources.values({ source: SOURCE, read: 'x'.repeat(81) }),
        )
      ).code,
    ).toBe('BAD_REQUEST');
  });

  it('names a source it does not have, and a read no longer kept', async () => {
    expect(await failure(caller().sources.summary({ source: 'nope' }))).toEqual(
      { code: 'NOT_FOUND', message: 'No such source.' },
    );
    expect(
      await failure(caller().sources.values({ source: SOURCE, read: 'gone' })),
    ).toEqual({
      code: 'NOT_FOUND',
      message: 'This read is no longer kept on the server.',
    });
  });

  it('says what is missing before calling the provider', async () => {
    for (const name of SHEET_ENV) vi.stubEnv(name, '');
    expect(await failure(caller().sources.read({ source: SOURCE }))).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: `Missing ${SHEET_ENV.join(', ')}.`,
    });
    expect(readWholeSheet).not.toHaveBeenCalled();
  });

  it('names a kept read that cannot be read, rather than calling it gone', async () => {
    await db()
      .insert(sourceReads)
      .values({
        source: SOURCE,
        readId: 'broken',
        readAt: new Date(sheet.readAt),
        body: { readId: 'broken' },
      });
    expect(
      await failure(
        caller().sources.values({ source: SOURCE, read: 'broken' }),
      ),
    ).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'The kept read brunch-store-sheet/broken does not fit the stored shape: readAt: Invalid input: expected string, received undefined; origin: Invalid option: expected one of "live"|"captured"; title: Invalid input: expected string, received undefined.',
    });
  });
});
