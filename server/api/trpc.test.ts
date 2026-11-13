import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedProcedure, router } from './trpc';

// The gate every stateful procedure passes, on a procedure that does nothing
// else, so a refusal can only come from the gate.
const gated = router({ ping: gatedProcedure.query(() => 'pong') });

const call = (url: string, headers?: HeadersInit) =>
  gated.createCaller({ request: new Request(url, { headers }) }).ping();

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(TRPCError);
  const { code, message } = error as TRPCError;
  return { code, message };
}

describe('gatedProcedure', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  it('answers a same-origin call from a loopback host in development', async () => {
    await expect(call('http://localhost:3000/api/trpc/ping')).resolves.toBe(
      'pong',
    );
    await expect(
      call('http://127.0.0.1:3000/api/trpc/ping', {
        origin: 'http://127.0.0.1:3000',
      }),
    ).resolves.toBe('pong');
    await expect(call('http://[::1]:3000/api/trpc/ping')).resolves.toBe('pong');
  });

  it('is not found outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await refusal(call('http://localhost:3000/api/trpc/ping'))).toEqual({
      code: 'NOT_FOUND',
      message: 'Not found.',
    });
  });

  it('is not found from a host other than loopback', async () => {
    expect(
      await refusal(call('http://192.168.1.20:3000/api/trpc/ping')),
    ).toEqual({ code: 'NOT_FOUND', message: 'Not found.' });
  });

  it('refuses a call from a foreign origin', async () => {
    expect(
      await refusal(
        call('http://localhost:3000/api/trpc/ping', {
          origin: 'http://localhost:4000',
        }),
      ),
    ).toEqual({ code: 'FORBIDDEN', message: 'Cross-origin request rejected.' });
  });
});
