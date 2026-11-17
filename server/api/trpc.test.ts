import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE, signSession } from '@/server/access/session';
import {
  VISITOR_COOKIE,
  newVisitor,
  signVisitor,
  visitorSecret,
} from '@/server/access/visitor';

import { gatedProcedure, router } from './trpc';

// The gate every stateful procedure passes, on a procedure that does nothing
// else, so a refusal can only come from the gate.
const gated = router({
  ping: gatedProcedure.query(() => 'pong'),
  whoami: gatedProcedure.query(({ ctx }) => ctx.actor),
  visitor: gatedProcedure.query(({ ctx }) => ctx.visitor),
});

const ID = '2f6c1c1e-6f0f-4c6a-9a43-0b5b7e7b7a11';

const caller = (url: string, headers?: HeadersInit) =>
  gated.createCaller({ request: new Request(url, { headers }) });
const call = (url: string, headers?: HeadersInit) =>
  caller(url, headers).ping();

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

  it('names nobody in local development', async () => {
    await expect(
      caller('http://localhost:3000/api/trpc/whoami').whoami(),
    ).resolves.toBeNull();
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

describe('gatedProcedure outside local development', () => {
  const KEY = 'a-shared-password-long-enough';
  const SECRET = 'a-signing-secret-of-at-least-thirty-two-characters';
  const URL_ = 'https://safepoint.example/api/trpc/ping';
  const cookie = async (name = 'Maya', secret = SECRET) => ({
    cookie: `${SESSION_COOKIE}=${await signSession(name, secret)}`,
  });

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFEPOINT_ACCESS_KEY', KEY);
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuses a call with no cookie', async () => {
    expect(await refusal(call(URL_))).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Sign in required.',
    });
  });

  it('refuses a cookie that is not a session of this deployment', async () => {
    for (const headers of [
      { cookie: `${SESSION_COOKIE}=garbage` },
      await cookie('Maya', 'another-signing-secret-of-thirty-two-chars'),
    ])
      expect((await refusal(call(URL_, headers))).code).toBe('UNAUTHORIZED');
  });

  it('answers a call with a valid cookie, and says who is acting', async () => {
    const headers = await cookie('Maya Novak');
    await expect(call(URL_, headers)).resolves.toBe('pong');
    await expect(
      caller('https://safepoint.example/api/trpc/whoami', headers).whoami(),
    ).resolves.toBe('Maya Novak');
  });

  it('still refuses a foreign origin, cookie or not', async () => {
    expect(
      await refusal(
        call(URL_, { ...(await cookie()), origin: 'https://evil.example' }),
      ),
    ).toEqual({ code: 'FORBIDDEN', message: 'Cross-origin request rejected.' });
  });

  it('answers a same-origin call with a cookie', async () => {
    await expect(
      call(URL_, { ...(await cookie()), origin: 'https://safepoint.example' }),
    ).resolves.toBe('pong');
  });

  it('refuses everything while the deployment is not configured', async () => {
    const headers = await cookie();
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', 'short');
    expect(await refusal(call(URL_, headers))).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'This deployment is not configured.',
    });
  });

  it('does not take a loopback host outside development for local', async () => {
    expect(
      (await refusal(call('http://localhost:3000/api/trpc/ping'))).code,
    ).toBe('UNAUTHORIZED');
  });

  it('applies in local development too with SAFEPOINT_GATE=1, and then names the person', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SAFEPOINT_GATE', '1');
    const local = 'http://localhost:3000/api/trpc/whoami';
    expect((await refusal(caller(local).whoami())).code).toBe('UNAUTHORIZED');
    await expect(caller(local, await cookie('Maya')).whoami()).resolves.toBe(
      'Maya',
    );
  });

  it('names the visitor when the gate has a session of a different name, and keeps the session name as the actor', async () => {
    const mine = newVisitor(Date.now(), new Uint8Array([1, 1, 2]), ID);
    const headers = {
      cookie: `${(await cookie('Maya')).cookie}; ${VISITOR_COOKIE}=${await signVisitor(mine, SECRET)}`,
    };
    const url = 'https://safepoint.example/api/trpc/whoami';
    await expect(caller(url, headers).whoami()).resolves.toBe('Maya');
    await expect(caller(url, headers).visitor()).resolves.toEqual({
      id: ID,
      name: 'Sunny Shakshuka',
      orb: 2,
    });
  });
});

describe('the visitor as the actor', () => {
  const SECRET = 'a-signing-secret-of-at-least-thirty-two-characters';
  const url = 'http://localhost:3000/api/trpc/whoami';
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  const withVisitor = async (secret: string) => ({
    cookie: `${VISITOR_COOKIE}=${await signVisitor(newVisitor(Date.now(), new Uint8Array([0, 0, 0]), ID), secret)}`,
  });

  it('is who acts in local development, signed with the development secret', async () => {
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', '');
    const headers = await withVisitor(visitorSecret(true, {}) as string);
    await expect(caller(url, headers).whoami()).resolves.toBe(
      'Curious Croissant',
    );
    await expect(caller(url, headers).visitor()).resolves.toMatchObject({
      id: ID,
    });
  });

  it('is nobody when the cookie is forged or absent', async () => {
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', SECRET);
    const forged = await withVisitor(
      'another-signing-secret-of-thirty-two-chars',
    );
    await expect(caller(url, forged).whoami()).resolves.toBeNull();
    await expect(caller(url, forged).visitor()).resolves.toBeNull();
    await expect(caller(url).whoami()).resolves.toBeNull();
  });
});
