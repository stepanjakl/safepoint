import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { proxy } from './proxy';
import { SESSION_COOKIE, signSession } from './server/access/session';
import {
  VISITOR_COOKIE,
  newVisitor,
  signVisitor,
  verifyVisitor,
} from './server/access/visitor';

const KEY = 'a-shared-password-long-enough';
const SECRET = 'a-signing-secret-of-at-least-thirty-two-characters';

const at = (
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) => new NextRequest(`https://safepoint.example${path}`, init);

const withCookie = async (secret = SECRET) => ({
  headers: { cookie: `${SESSION_COOKIE}=${await signSession('Maya', secret)}` },
});

describe('the request proxy outside local development', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFEPOINT_ACCESS_KEY', KEY);
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sends a page without a cookie to the gate, remembering where it was going', async () => {
    const response = await proxy(at('/workspace/brunch?tab=rules'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://safepoint.example/access?next=%2Fworkspace%2Fbrunch%3Ftab%3Drules',
    );
  });

  it('sends the home page to the plain gate', async () => {
    const response = await proxy(at('/'));
    expect(response.headers.get('location')).toBe(
      'https://safepoint.example/access',
    );
  });

  it('lets a page through with a valid cookie', async () => {
    const response = await proxy(at('/workspace', await withCookie()));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('answers an API call without a cookie with 401 JSON, not a redirect', async () => {
    const response = await proxy(
      at('/api/trpc/runs.list', { method: 'POST', body: '{}' }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      kind: 'error',
      message: 'Sign in required.',
    });
  });

  it('refuses a cookie signed with another secret, a page or an API call', async () => {
    const forged = await withCookie(
      'another-signing-secret-of-thirty-two-chars',
    );
    expect((await proxy(at('/workspace', forged))).status).toBe(307);
    expect((await proxy(at('/api/trpc/x', forged))).status).toBe(401);
  });

  it('lets an API call through with a valid cookie', async () => {
    const response = await proxy(at('/api/trpc/runs.list', await withCookie()));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([
    '/_next/static/chunks/app.js',
    '/_next/image?url=%2Fx&w=64&q=75',
    '/icon.svg',
    '/.well-known/workflow/v1/flow',
  ])('lets %s through untouched with no cookie', async (path) => {
    const response = await proxy(at(path, { method: 'POST', body: 'x' }));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('does not exempt a path that only looks like an exempt one', async () => {
    for (const path of [
      '/icon.svg/extra',
      '/_nextish/x',
      '/.well-known/other',
      '/.well-known/workflow',
    ])
      expect((await proxy(at(path))).status).toBe(307);
  });

  it('lets the gate page and its action through without a cookie', async () => {
    for (const request of [
      at('/access'),
      at('/access?next=%2Fworkspace'),
      at('/access', { method: 'POST', body: 'x' }),
    ])
      expect((await proxy(request)).headers.get('x-middleware-next')).toBe('1');
  });

  it('does not carry a protocol-relative path as a return target', async () => {
    const response = await proxy(at('//evil.example/path'));
    expect(response.headers.get('location')).toBe(
      'https://safepoint.example/access',
    );
  });

  describe('when the deployment is not configured', () => {
    it.each([
      ['no key', { SAFEPOINT_ACCESS_KEY: '' }],
      ['no secret', { SAFEPOINT_COOKIE_SECRET: '' }],
      ['a short key', { SAFEPOINT_ACCESS_KEY: 'short' }],
      ['a short secret', { SAFEPOINT_COOKIE_SECRET: 'short' }],
    ])('refuses every request with %s', async (_name, env) => {
      const cookie = await withCookie();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      for (const request of [
        at('/'),
        at('/access'),
        at('/api/trpc/x'),
        at('/workspace', cookie),
      ]) {
        const response = await proxy(request);
        expect(response.status).toBe(503);
        expect(await response.text()).toBe(
          'This deployment is not configured.',
        );
      }
    });
  });
});

describe('the visitor cookie the proxy issues', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFEPOINT_ACCESS_KEY', KEY);
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  const issued = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((line) => line.startsWith(`${VISITOR_COOKIE}=`));

  const valueOf = (line: string) => line.split(';')[0]!.split('=')[1]!;

  it('adds a valid one to the gate redirect without changing it', async () => {
    const response = await proxy(at('/workspace?tab=rules'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://safepoint.example/access?next=%2Fworkspace%3Ftab%3Drules',
    );
    const line = issued(response)!;
    expect(await verifyVisitor(valueOf(line), SECRET)).not.toBeNull();
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=lax/i);
    expect(line).toMatch(/Secure/);
    expect(line).toMatch(/Max-Age=31536000/);
  });

  it('adds one to a page that passes, and shows it to that same request', async () => {
    const response = await proxy(at('/workspace', await withCookie()));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    const line = issued(response)!;
    expect(line).toBeDefined();
    expect(response.headers.get('x-middleware-request-cookie') ?? '').toContain(
      `${VISITOR_COOKIE}=${valueOf(line)}`,
    );
    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      `${SESSION_COOKIE}=`,
    );
  });

  it('adds one to the gate page too', async () => {
    const response = await proxy(at('/access'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(issued(response)).toBeDefined();
  });

  it('keeps the one a visitor already has', async () => {
    const mine = await signVisitor(newVisitor(), SECRET);
    const response = await proxy(
      at('/workspace', {
        headers: { cookie: `${VISITOR_COOKIE}=${mine}` },
      }),
    );
    expect(response.status).toBe(307);
    expect(issued(response)).toBeUndefined();
  });

  it('replaces one that is forged, on the request the page sees too', async () => {
    const forged = await signVisitor(
      newVisitor(),
      'another-signing-secret-of-thirty-two-chars',
    );
    const session = (await withCookie()).headers.cookie;
    const response = await proxy(
      at('/workspace', {
        headers: { cookie: `${session}; ${VISITOR_COOKIE}=${forged}` },
      }),
    );
    expect(issued(response)).toBeDefined();
    expect(response.headers.get('x-middleware-request-cookie')).not.toContain(
      forged,
    );
  });

  it.each([
    ['an API call', '/api/trpc/runs.list'],
    ['a build asset', '/_next/static/chunks/app.js'],
    ['the tab icon', '/icon.svg'],
    ['a Workflow route', '/.well-known/workflow/v1/flow'],
    ['a file', '/fonts/body.woff2'],
  ])('adds none to %s', async (_name, path) => {
    const response = await proxy(at(path, { method: 'POST', body: 'x' }));
    expect(issued(response)).toBeUndefined();
  });

  it('adds none where the deployment has no secret, and answers as before', async () => {
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', '');
    const response = await proxy(at('/workspace'));
    expect(response.status).toBe(503);
    expect(issued(response)).toBeUndefined();
  });

  it('is signed with a development secret on a laptop, not Secure', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', '');
    const response = await proxy(new NextRequest('http://localhost:3000/'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    const line = issued(response)!;
    expect(line).not.toMatch(/Secure/);
    expect(
      await verifyVisitor(
        valueOf(line),
        'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxx',
      ),
    ).toBeNull();
  });
});

describe('the request proxy in local development', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  const local = (path: string) =>
    new NextRequest(`http://localhost:3000${path}`);

  it('is no gate, and needs no configuration', async () => {
    for (const path of ['/', '/workspace', '/api/trpc/runs.list'])
      expect((await proxy(local(path))).headers.get('x-middleware-next')).toBe(
        '1',
      );
  });

  it('is a gate again with SAFEPOINT_GATE=1', async () => {
    vi.stubEnv('SAFEPOINT_GATE', '1');
    expect((await proxy(local('/'))).status).toBe(503);
    vi.stubEnv('SAFEPOINT_ACCESS_KEY', KEY);
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', SECRET);
    expect((await proxy(local('/workspace'))).status).toBe(307);
    expect((await proxy(local('/api/trpc/x'))).status).toBe(401);
  });

  it('is no gate on a host that is not loopback, even in development mode', async () => {
    const response = await proxy(
      new NextRequest('http://192.168.1.20:3000/workspace'),
    );
    expect(response.status).toBe(503);
  });
});
