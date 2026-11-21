import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  crossOriginRefusal,
  gateApplies,
  isLocalDevelopment,
  localDevelopmentRefusal,
  rejectUnlessLocalDevelopment,
} from './dev-route';

afterEach(() => vi.unstubAllEnvs());

const url = (href: string) => new URL(href);

describe('isLocalDevelopment', () => {
  it('is development mode on a loopback host', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isLocalDevelopment(url('http://localhost:3000/'))).toBe(true);
    expect(isLocalDevelopment(url('http://127.0.0.1:3000/'))).toBe(true);
    expect(isLocalDevelopment(url('http://[::1]:3000/'))).toBe(true);
    expect(isLocalDevelopment(url('http://192.168.1.20:3000/'))).toBe(false);
    expect(isLocalDevelopment(url('https://example.com/'))).toBe(false);
  });

  it('is never true outside development mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isLocalDevelopment(url('http://localhost:3000/'))).toBe(false);
  });
});

describe('localDevelopmentRefusal', () => {
  it('keeps its three checks and their answers', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const at = (host: string, origin?: string) =>
      localDevelopmentRefusal(
        new Request(`http://${host}/x`, origin ? { headers: { origin } } : {}),
      );
    expect(at('localhost:3000')).toBeNull();
    expect(at('localhost:3000', 'http://localhost:3000')).toBeNull();
    expect(at('localhost:3000', 'http://localhost:4000')).toEqual({
      status: 403,
      message: 'Cross-origin request rejected.',
    });
    expect(at('example.com')).toEqual({ status: 404, message: 'Not found.' });
  });

  it('can check the browser origin against the configured dev host', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SAFEPOINT_DEV_HOST', '172.20.10.12');
    const check = (origin: string, host = '172.20.10.12:3000') =>
      new Request('http://localhost:3000/api/trpc/runs.list', {
        method: 'POST',
        headers: { origin, host },
      });
    const options = { allowDevHost: true };
    expect(
      localDevelopmentRefusal(check('http://172.20.10.12:3000'), options),
    ).toBeNull();
    expect(
      localDevelopmentRefusal(check('http://172.20.10.12:3000'))?.status,
    ).toBe(403);
    expect(
      localDevelopmentRefusal(check('http://172.20.10.12:4000'), options)
        ?.status,
    ).toBe(403);
    expect(
      localDevelopmentRefusal(
        check('http://172.20.10.12:3000', 'localhost:3000'),
        options,
      )?.status,
    ).toBe(403);
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      crossOriginRefusal(check('http://172.20.10.12:3000'), options)?.status,
    ).toBe(403);
  });

  it('shares its cross-origin check', () => {
    const request = new Request('https://example.com/x', {
      headers: { origin: 'https://elsewhere.example' },
    });
    expect(crossOriginRefusal(request)?.status).toBe(403);
  });
});

describe('gateApplies', () => {
  it('is off in local development and on everywhere else', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(gateApplies(url('http://localhost:3000/'))).toBe(false);
    expect(gateApplies(url('https://example.com/'))).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(gateApplies(url('http://localhost:3000/'))).toBe(true);
  });

  it('is switched on in local development by SAFEPOINT_GATE=1 alone', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SAFEPOINT_GATE', '1');
    expect(gateApplies(url('http://localhost:3000/'))).toBe(true);
    vi.stubEnv('SAFEPOINT_GATE', 'true');
    expect(gateApplies(url('http://localhost:3000/'))).toBe(false);
  });
});

describe('the development-only routes, whatever is signed in', () => {
  it('refuse outside local development even with a gate cookie, and never read the gate switch', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFEPOINT_GATE', '1');
    const request = new Request(
      'https://safepoint.example/api/dev/stylesheets',
      {
        method: 'POST',
        headers: { cookie: 'safepoint-access=anything-at-all' },
      },
    );
    expect(localDevelopmentRefusal(request)).toEqual({
      status: 404,
      message: 'Not found.',
    });
    expect(rejectUnlessLocalDevelopment(request)?.status).toBe(404);
  });

  it('stay available in local development with the gate switched on', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SAFEPOINT_GATE', '1');
    expect(
      rejectUnlessLocalDevelopment(
        new Request('http://localhost:3000/api/dev/stylesheets'),
      ),
    ).toBeNull();
  });
});
