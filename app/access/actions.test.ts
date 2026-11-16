import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => ({
  set: vi.fn(),
  delete: vi.fn(),
}));
const host = vi.hoisted(() => ({ value: 'safepoint.example' }));

vi.mock('next/headers', () => ({
  cookies: async () => jar,
  headers: async () => new Headers({ host: host.value }),
}));
// The real redirect throws to end the action; so does this.
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to });
  },
}));

import { signIn, signOut } from './actions';
import { SESSION_COOKIE, verifySession } from '@/server/access/session';

const KEY = 'a-shared-password-long-enough';
const SECRET = 'a-signing-secret-of-at-least-thirty-two-characters';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const start = { error: null, name: '' };

async function redirectedTo(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown as { to?: string },
  );
  return error?.to ?? null;
}

describe('the gate page actions', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFEPOINT_ACCESS_KEY', KEY);
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', SECRET);
    host.value = 'safepoint.example';
    jar.set.mockClear();
    jar.delete.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sets a signed, secure, http-only cookie and returns to where the person was going', async () => {
    const to = await redirectedTo(
      signIn(
        start,
        form({ password: KEY, name: '  Maya  ', next: '/workspace?tab=rules' }),
      ),
    );
    expect(to).toBe('/workspace?tab=rules');
    const [name, value, options] = jar.set.mock.calls[0]!;
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    expect((await verifySession(value, SECRET))?.name).toBe('Maya');
  });

  it('is not Secure on a local host in development, where http is all there is', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    host.value = 'localhost:3002';
    await redirectedTo(signIn(start, form({ password: KEY, name: 'Maya' })));
    expect(jar.set.mock.calls[0]![2]).toMatchObject({ secure: false });
  });

  it.each([
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
  ])('never returns to %s', async (next) => {
    expect(
      await redirectedTo(
        signIn(start, form({ password: KEY, name: 'Maya', next })),
      ),
    ).toBe('/');
  });

  it('says so, and sets nothing, when the password is wrong', async () => {
    const state = await signIn(
      start,
      form({ password: `${KEY}x`, name: 'Maya' }),
    );
    expect(state).toEqual({
      error: 'That password is not right.',
      name: 'Maya',
    });
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('wants a name, trimmed and at most 80 characters', async () => {
    for (const name of ['', '   ', 'x'.repeat(81)]) {
      const state = await signIn(start, form({ password: KEY, name }));
      expect(state.error).toBe('Enter your name, up to 80 characters.');
    }
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('keeps a name as text, never as markup', async () => {
    await redirectedTo(
      signIn(start, form({ password: KEY, name: '<b>Maya</b>' })),
    );
    expect((await verifySession(jar.set.mock.calls[0]![1], SECRET))?.name).toBe(
      '<b>Maya</b>',
    );
  });

  it('signs nobody in while the deployment is not configured', async () => {
    vi.stubEnv('SAFEPOINT_ACCESS_KEY', '');
    const state = await signIn(start, form({ password: '', name: 'Maya' }));
    expect(state.error).toBe('This deployment is not configured.');
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('signs out by clearing the cookie and going back to the gate page', async () => {
    expect(await redirectedTo(signOut())).toBe('/access');
    expect(jar.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});
