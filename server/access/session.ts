import 'server-only';

import { cookieValue, signBody, verifiedBody } from './signed-cookie';

/*
  The signed cookie that holds a person's name once they have given the shared
  password: base64url(payload) "." base64url(HMAC-SHA-256 of that text), the
  payload being { v, n, i } -- a version, the name and the issue time in
  seconds. The encoding and signature are signed-cookie.ts's, shared with the
  visitor cookie. Nothing here throws on a bad cookie: it is simply not a
  session.

  A lifetime is checked from the signed issue time, not only from the cookie's
  own expiry, which the browser controls. A changed secret, or a changed
  VERSION, makes every cookie already out fail the signature or the version.
*/

export const SESSION_COOKIE = 'safepoint-access';
export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const NAME_MAX_LENGTH = 80;

const VERSION = 1;
// A clock a little ahead of the one that signed is not a forgery.
const CLOCK_SKEW_SECONDS = 60;

export type Session = { name: string; issuedAt: number };

const encoder = new TextEncoder();

// A name as it is kept: trimmed, and nothing else done to it. It is text for a
// person to read, never markup, and React escapes it wherever it is shown.
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name.length > 0 && name.length <= NAME_MAX_LENGTH ? name : null;
}

export async function signSession(
  name: string,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const clean = cleanName(name);
  if (clean === null) throw new Error('A session needs a name.');
  return signBody({ v: VERSION, n: clean, i: Math.floor(now / 1000) }, secret);
}

export async function verifySession(
  value: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<Session | null> {
  try {
    const body = await verifiedBody(value, secret);
    if (body === null) return null;
    const { v, n, i } = body;
    const name = cleanName(n);
    if (v !== VERSION || name === null || name !== n) return null;
    if (typeof i !== 'number' || !Number.isInteger(i)) return null;
    const age = Math.floor(now / 1000) - i;
    if (age > SESSION_LIFETIME_SECONDS || age < -CLOCK_SKEW_SECONDS)
      return null;
    return { name, issuedAt: i };
  } catch {
    return null;
  }
}

export const readSession = (
  request: Request,
  secret: string,
  now?: number,
): Promise<Session | null> =>
  verifySession(
    cookieValue(request.headers.get('cookie'), SESSION_COOKIE),
    secret,
    now,
  );

/*
  Secure wherever the connection is not local development's own: a cookie
  marked Secure is not sent over plain http, which is all a laptop has.
*/
export const sessionCookieOptions = (secure: boolean) =>
  ({
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_LIFETIME_SECONDS,
  }) as const;

/*
  The password, compared as two SHA-256 digests XORed to the end, so how much
  of a wrong guess was right cannot be read from how long the answer took.
*/
export async function passwordMatches(
  given: string,
  expected: string,
): Promise<boolean> {
  const [a, b] = await Promise.all(
    [given, expected].map(
      async (text) =>
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', encoder.encode(text)),
        ),
    ),
  );
  let difference = 0;
  for (let index = 0; index < a!.length; index += 1)
    difference |= a![index]! ^ b![index]!;
  return difference === 0;
}
