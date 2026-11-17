import { describe, expect, it } from 'vitest';

import { accessConfig } from './config';
import { cookieValue } from './signed-cookie';
import {
  SESSION_COOKIE,
  SESSION_LIFETIME_SECONDS,
  cleanName,
  passwordMatches,
  readSession,
  signSession,
  verifySession,
} from './session';

const SECRET = 'a-signing-secret-of-at-least-thirty-two-characters';
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const encode = (text: string) =>
  btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

describe('a session cookie', () => {
  it('is verified with the name and issue time it was signed with', async () => {
    const value = await signSession('Maya Novak', SECRET, NOW);
    expect(await verifySession(value, SECRET, NOW + DAY)).toEqual({
      name: 'Maya Novak',
      issuedAt: NOW / 1000,
    });
  });

  it('keeps a name that is not ASCII', async () => {
    const value = await signSession('Zoë Å 山', SECRET, NOW);
    expect((await verifySession(value, SECRET, NOW))?.name).toBe('Zoë Å 山');
  });

  it('fails when the payload is changed', async () => {
    const value = await signSession('Maya', SECRET, NOW);
    const [, signature] = value.split('.');
    const forged = encode(JSON.stringify({ v: 1, n: 'Admin', i: NOW / 1000 }));
    expect(
      await verifySession(`${forged}.${signature}`, SECRET, NOW),
    ).toBeNull();
  });

  it('fails when the signature is changed', async () => {
    const value = await signSession('Maya', SECRET, NOW);
    const flipped = value.slice(0, -2) + (value.endsWith('AA') ? 'BB' : 'AA');
    expect(await verifySession(flipped, SECRET, NOW)).toBeNull();
    expect(
      await verifySession(`${value.split('.')[0]}.`, SECRET, NOW),
    ).toBeNull();
  });

  it('fails once its lifetime, counted from the signed time, has run out', async () => {
    const value = await signSession('Maya', SECRET, NOW);
    const last = NOW + SESSION_LIFETIME_SECONDS * 1000;
    expect(await verifySession(value, SECRET, last)).not.toBeNull();
    expect(await verifySession(value, SECRET, last + 1000)).toBeNull();
  });

  it('fails when it claims to have been issued in the future', async () => {
    const value = await signSession('Maya', SECRET, NOW + DAY);
    expect(await verifySession(value, SECRET, NOW)).toBeNull();
  });

  it('fails when signed with another secret', async () => {
    const value = await signSession('Maya', SECRET, NOW);
    expect(await verifySession(value, `${SECRET}-rotated`, NOW)).toBeNull();
  });

  it('fails, without throwing, on anything that is not one', async () => {
    const properlySigned = async (payload: string) => {
      // A payload the secret really signed, but of the wrong shape.
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const signature = new Uint8Array(
        await crypto.subtle.sign(
          'HMAC',
          key,
          new TextEncoder().encode(payload),
        ),
      );
      const text = btoa(String.fromCharCode(...signature))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
      return `${payload}.${text}`;
    };
    const garbage = [
      '',
      '.',
      '..',
      'x',
      'a.b',
      'a.b.c',
      '%%%.%%%',
      '\u0000.\u0000',
      'e30.e30',
      'x'.repeat(10_000),
      await properlySigned(encode('not json')),
      await properlySigned(encode('null')),
      await properlySigned(encode('{"v":2,"n":"Maya","i":1}')),
      await properlySigned(encode(`{"v":1,"n":" Maya","i":${NOW / 1000}}`)),
      await properlySigned(encode(`{"v":1,"n":"","i":${NOW / 1000}}`)),
      await properlySigned(encode('{"v":1,"n":"Maya","i":"1"}')),
      await properlySigned('_w'),
    ];
    for (const value of garbage)
      expect(await verifySession(value, SECRET, NOW)).toBeNull();
    expect(await verifySession(null, SECRET, NOW)).toBeNull();
    expect(await verifySession(undefined, SECRET, NOW)).toBeNull();
  });

  it('is only issued for a name that is kept', async () => {
    await expect(signSession('   ', SECRET, NOW)).rejects.toThrow();
    await expect(signSession('x'.repeat(81), SECRET, NOW)).rejects.toThrow();
  });
});

describe('a name', () => {
  it('is trimmed, required and at most 80 characters', () => {
    expect(cleanName('  Maya  ')).toBe('Maya');
    expect(cleanName('')).toBeNull();
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(80))).toHaveLength(80);
    expect(cleanName('x'.repeat(81))).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName(null)).toBeNull();
  });

  it('is kept as text and never changed into anything else', () => {
    expect(cleanName('<img src=x onerror=alert(1)>')).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
});

describe('reading the cookie from a request', () => {
  it('finds it among others', async () => {
    const value = await signSession('Maya', SECRET, NOW);
    const request = new Request('https://example.com/', {
      headers: { cookie: `a=1; ${SESSION_COOKIE}=${value}; b=2` },
    });
    expect((await readSession(request, SECRET, NOW))?.name).toBe('Maya');
    expect(cookieValue('a=1; b=2', SESSION_COOKIE)).toBeNull();
    expect(cookieValue(null, SESSION_COOKIE)).toBeNull();
  });
});

describe('the password', () => {
  it('matches only itself', async () => {
    expect(
      await passwordMatches('correct horse battery', 'correct horse battery'),
    ).toBe(true);
    expect(
      await passwordMatches('correct horse batter', 'correct horse battery'),
    ).toBe(false);
    expect(await passwordMatches('', 'correct horse battery')).toBe(false);
  });
});

describe('the configuration', () => {
  const long = {
    SAFEPOINT_ACCESS_KEY: 'k'.repeat(16),
    SAFEPOINT_COOKIE_SECRET: 's'.repeat(32),
  };

  it('is there only when both values are long enough', () => {
    expect(accessConfig(long)).toEqual({
      accessKey: 'k'.repeat(16),
      cookieSecret: 's'.repeat(32),
    });
    expect(accessConfig({})).toBeNull();
    expect(accessConfig({ ...long, SAFEPOINT_ACCESS_KEY: '' })).toBeNull();
    expect(
      accessConfig({ ...long, SAFEPOINT_ACCESS_KEY: 'k'.repeat(15) }),
    ).toBeNull();
    expect(
      accessConfig({ ...long, SAFEPOINT_COOKIE_SECRET: 's'.repeat(31) }),
    ).toBeNull();
  });
});
