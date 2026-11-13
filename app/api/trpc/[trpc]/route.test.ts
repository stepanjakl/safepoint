import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inScratchDirectory } from '@/lib/definitions/scratch.fixture';
import { readWholeSheet } from '@/lib/sheets/composio';

import { GET, POST } from './route';

// What a failure looks like once it has left the server: the handler called
// with a Request in process, nothing on the network. The provider is a
// stand-in that fails as a real one can, with more than one line.

vi.mock('@/lib/sheets/composio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sheets/composio')>()),
  readWholeSheet: vi.fn(),
}));

const BASE = 'http://localhost:3000/api/trpc';
const SHEET_ENV = [
  'COMPOSIO_API_KEY',
  'COMPOSIO_USER_ID',
  'COMPOSIO_GOOGLESHEETS_ACCOUNT_ID',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
];

const query = (path: string, input: unknown) =>
  GET(
    new Request(
      `${BASE}/${path}?input=${encodeURIComponent(JSON.stringify(input))}`,
    ),
  );

const mutation = (path: string, body: string) =>
  POST(
    new Request(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );

async function answer(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe('/api/trpc', () => {
  inScratchDirectory();
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  it('answers a query with its result', async () => {
    expect(
      await answer(
        await query('sources.summary', { source: 'brunch-store-sheet' }),
      ),
    ).toEqual({ status: 200, body: { result: { data: null } } });
  });

  it('says "Invalid request." for an input that does not fit, not the issues', async () => {
    const { status, body } = await answer(
      await query('sources.values', { source: 'brunch-store-sheet' }),
    );
    expect(status).toBe(400);
    expect(body.error.message).toBe('Invalid request.');
    expect(body.error.data).toEqual({
      code: 'BAD_REQUEST',
      httpStatus: 400,
      path: 'sources.values',
    });
  });

  it('says "Invalid request." for a body that is not JSON', async () => {
    const { status, body } = await answer(
      await mutation('sources.read', '{not json'),
    );
    expect(status).toBe(400);
    expect(body.error.message).toBe('Invalid request.');
  });

  it('gives the first line of a thrown error, and no stack', async () => {
    for (const name of SHEET_ENV) vi.stubEnv(name, 'stand-in');
    vi.mocked(readWholeSheet).mockRejectedValueOnce(
      new Error('The sheet could not be reached.\n    at call (composio.ts)'),
    );
    const { status, body } = await answer(
      await mutation(
        'sources.read',
        JSON.stringify({ source: 'brunch-store-sheet' }),
      ),
    );
    expect(status).toBe(502);
    expect(body.error.message).toBe('The sheet could not be reached.');
    expect(body.error.data).toEqual({
      code: 'BAD_GATEWAY',
      httpStatus: 502,
      path: 'sources.read',
    });
  });

  it('refuses a call from another origin before reading its input', async () => {
    const { status, body } = await answer(
      await POST(
        new Request(`${BASE}/sources.read`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:4000',
          },
          body: '{not json',
        }),
      ),
    );
    expect(status).toBe(403);
    expect(body.error.message).toBe('Cross-origin request rejected.');
  });
});
