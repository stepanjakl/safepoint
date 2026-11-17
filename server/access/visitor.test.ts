import { describe, expect, it } from 'vitest';

import { signBody } from './signed-cookie';
import {
  VISITOR_COOKIE,
  VISITOR_LIFETIME_SECONDS,
  newVisitor,
  readVisitor,
  signVisitor,
  verifyVisitor,
  visitorCookieOptions,
  visitorSecret,
} from './visitor';

const SECRET = 'a-signing-secret-of-at-least-thirty-two-characters';
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const ID = '2f6c1c1e-6f0f-4c6a-9a43-0b5b7e7b7a11';

const visitor = () => newVisitor(NOW, new Uint8Array([1, 1, 4, 0]), ID);

describe('a visitor cookie', () => {
  it('is made from bytes: the name, the orb, the id and the issue time', () => {
    expect(visitor()).toEqual({
      id: ID,
      name: 'Sunny Shakshuka',
      orb: 4,
      issuedAt: NOW / 1000,
    });
  });

  it('round-trips', async () => {
    const value = await signVisitor(visitor(), SECRET);
    expect(await verifyVisitor(value, SECRET, NOW + DAY)).toEqual(visitor());
  });

  it('is read from a Cookie header among others', async () => {
    const value = await signVisitor(visitor(), SECRET);
    const request = new Request('https://safepoint.example/', {
      headers: { cookie: `a=b; ${VISITOR_COOKIE}=${value}; c=d` },
    });
    expect((await readVisitor(request, SECRET, NOW))?.id).toBe(ID);
  });

  it('refuses a changed payload under the old signature', async () => {
    const value = await signVisitor(visitor(), SECRET);
    const signature = value.split('.')[1];
    const other = (
      await signVisitor({ ...visitor(), name: 'Admin' }, SECRET)
    ).split('.')[0];
    expect(
      await verifyVisitor(`${other}.${signature}`, SECRET, NOW),
    ).toBeNull();
  });

  it('refuses a changed signature', async () => {
    const value = await signVisitor(visitor(), SECRET);
    const [payload, signature] = value.split('.') as [string, string];
    const flipped =
      (signature.startsWith('A') ? 'B' : 'A') + signature.slice(1);
    expect(
      await verifyVisitor(`${payload}.${flipped}`, SECRET, NOW),
    ).toBeNull();
  });

  it('refuses another secret', async () => {
    const value = await signVisitor(visitor(), SECRET);
    expect(
      await verifyVisitor(
        value,
        'another-signing-secret-of-thirty-two-chars',
        NOW,
      ),
    ).toBeNull();
  });

  it('refuses one past its lifetime, and one from the far future', async () => {
    const value = await signVisitor(visitor(), SECRET);
    expect(
      await verifyVisitor(
        value,
        SECRET,
        NOW + (VISITOR_LIFETIME_SECONDS + 1) * 1000,
      ),
    ).toBeNull();
    expect(await verifyVisitor(value, SECRET, NOW - 5 * 60 * 1000)).toBeNull();
  });

  it('refuses a signed body that is not a visitor', async () => {
    for (const body of [
      { v: 2, id: ID, n: 'Sunny Shakshuka', o: 0, i: NOW / 1000 },
      { v: 1, id: 'not-a-uuid', n: 'Sunny Shakshuka', o: 0, i: NOW / 1000 },
      { v: 1, id: ID, n: '  ', o: 0, i: NOW / 1000 },
      { v: 1, id: ID, n: 'Sunny Shakshuka', o: -1, i: NOW / 1000 },
      { v: 1, id: ID, n: 'Sunny Shakshuka', o: 0.5, i: NOW / 1000 },
      { v: 1, id: ID, n: 'Sunny Shakshuka', o: 0 },
    ])
      expect(
        await verifyVisitor(await signBody(body, SECRET), SECRET, NOW),
      ).toBeNull();
  });

  it('never throws on garbage', async () => {
    for (const value of [
      null,
      undefined,
      '',
      '.',
      'a.b.c',
      'garbage',
      '!!!.???',
      `${'x'.repeat(5000)}.${'y'.repeat(5000)}`,
    ])
      expect(await verifyVisitor(value, SECRET, NOW)).toBeNull();
  });
});

describe('the visitor secret', () => {
  it('is the configured one when it is long enough', () => {
    expect(visitorSecret(false, { SAFEPOINT_COOKIE_SECRET: SECRET })).toBe(
      SECRET,
    );
    expect(visitorSecret(true, { SAFEPOINT_COOKIE_SECRET: SECRET })).toBe(
      SECRET,
    );
  });

  it('is a fixed development one on a laptop alone', () => {
    expect(visitorSecret(true, {})).toContain('local-development-only');
    expect(visitorSecret(false, {})).toBeNull();
    expect(
      visitorSecret(false, { SAFEPOINT_COOKIE_SECRET: 'short' }),
    ).toBeNull();
  });
});

describe('the visitor cookie options', () => {
  it('lasts a year, is HttpOnly and Lax, and is Secure unless local', () => {
    expect(visitorCookieOptions(true)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 365 * 24 * 60 * 60,
    });
    expect(visitorCookieOptions(false).secure).toBe(false);
  });
});
