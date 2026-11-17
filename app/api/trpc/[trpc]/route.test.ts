import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inScratchStorage } from '@/lib/engine/scratch.fixture';
import { keepText, TEXT } from '@/lib/engine/set.fixture';
import { hashOf } from '@/lib/engine/fingerprint';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { readWholeSheet } from '@/lib/sheets/composio';
import { accepted, keepAsCurrent } from '@/server/api/run.fixture';

import { GET, POST } from './route';

// What a failure looks like once it has left the server: the handler called
// with a Request in process, nothing on the network. The provider is a
// stand-in that fails as a real one can, with more than one line.

vi.mock('@/server/storage/run-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/storage/run-reads')>()),
  keptRead: async (_reads: unknown, id: string) =>
    id === 'test'
      ? (await import('@/lib/engine/captured.fixture')).capturedRead()
      : null,
}));
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

// The client sends every call as a POST with its input as the body, queries
// too (components/trpc/provider.tsx).
const call = (path: string, body: string) =>
  POST(
    new Request(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );
const query = (path: string, input: unknown) =>
  call(path, JSON.stringify(input));
const mutation = call;

async function answer(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe('/api/trpc', () => {
  inScratchStorage();
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  it('answers a query with its result', async () => {
    expect(
      await answer(
        await query('sources.summary', { source: 'brunch-store-sheet' }),
      ),
    ).toEqual({ status: 200, body: { result: { data: null } } });
  });

  it('answers a query whose input is as long as the schema allows', async () => {
    // Far past what a URL carries: the instructions a run answers to.
    const text = 'x'.repeat(20_000);
    await keepText(text);
    await keepAsCurrent({ ...accepted, hash: hashOf(text) });
    const { status, body } = await answer(
      await query('calculate.get', { text, readId: 'test' }),
    );
    expect(status).toBe(200);
    expect(body.result.data).toMatchObject({ kind: 'calculation' });
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

  it('gives a corrupt kept file as its own message, on the first line', async () => {
    // The rulebook for TEXT cannot be read: the screen is told which file.
    const folder = path.join(
      process.cwd(),
      'fixtures',
      owner.id,
      'rulebooks',
      `v1-${hashOf(TEXT)}`,
    );
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'current.json'), '{not json');
    const { status, body } = await answer(
      await query('rules.get', { text: TEXT }),
    );
    expect(status).toBe(502);
    expect(body.error.message).toBe(
      `fixtures/${owner.id}/rulebooks/v1-${hashOf(TEXT)}/current.json is not valid JSON.`,
    );
    expect(body.error.data).toEqual({
      code: 'BAD_GATEWAY',
      httpStatus: 502,
      path: 'rules.get',
    });
  });

  it('does not run a mutation sent as a query: what writes to the sheet is only ever a POST', async () => {
    for (const path of [
      'application.write',
      'application.undo',
      'application.preview',
    ]) {
      const input = encodeURIComponent(
        JSON.stringify({ text: 'x', readId: 'test', rulebook: '0123456789ab' }),
      );
      const { status, body } = await answer(
        await GET(
          new Request(`${BASE}/${path}?input=${input}`, { method: 'GET' }),
        ),
      );
      expect(status).toBe(405);
      expect(body.error.data.code).toBe('METHOD_NOT_SUPPORTED');
    }
    expect(readWholeSheet).not.toHaveBeenCalled();
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
