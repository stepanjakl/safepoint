import 'server-only';

import { visitorName } from '@/lib/shell/visitor-name';
import { VISITOR_ORB_COUNT } from '@/lib/shell/visitor-orb';

import { cleanName } from './session';
import { cookieValue, signBody, verifiedBody } from './signed-cookie';

/*
  The signed cookie that gives every visitor an identity before they have said
  who they are: { v, id, n, o, i } -- a version, a random id, a name, an orb
  index and the issue time in seconds, signed as the gate's cookie is
  (signed-cookie.ts). It names no one real and grants nothing: the gate is a
  separate cookie. A bad cookie is simply not a visitor, and the proxy issues
  a fresh one.
*/

export const VISITOR_COOKIE = 'safepoint-visitor';
export const VISITOR_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

const VERSION = 1;
const MIN_SECRET_LENGTH = 32;
const CLOCK_SKEW_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Only ever used on a laptop (visitorSecret below), and named so that it
// cannot be mistaken for a deployment's.
const LOCAL_DEVELOPMENT_ONLY_SECRET =
  'safepoint-local-development-only-visitor-secret';

export type Visitor = {
  id: string;
  name: string;
  orb: number;
  issuedAt: number;
};

/*
  The key to sign with: SAFEPOINT_COOKIE_SECRET, shared with the gate, and in
  local development alone a fixed one when that is unset, so a laptop needs
  no configuration. Anywhere else, without a long enough secret there is no
  key, and so no visitor cookie.
*/
export function visitorSecret(
  local: boolean,
  env: Partial<Record<string, string>> = process.env,
): string | null {
  const configured = env.SAFEPOINT_COOKIE_SECRET ?? '';
  if (configured.length >= MIN_SECRET_LENGTH) return configured;
  return local ? LOCAL_DEVELOPMENT_ONLY_SECRET : null;
}

// A new visitor, from 16 random bytes: the name and the orb are chosen by
// them, the id is a UUID of its own.
export function newVisitor(
  now: number = Date.now(),
  bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
  id: string = crypto.randomUUID(),
): Visitor {
  return {
    id,
    name: visitorName(bytes),
    orb: (bytes[2] ?? 0) % VISITOR_ORB_COUNT,
    issuedAt: Math.floor(now / 1000),
  };
}

export const signVisitor = (
  visitor: Visitor,
  secret: string,
): Promise<string> =>
  signBody(
    {
      v: VERSION,
      id: visitor.id,
      n: visitor.name,
      o: visitor.orb,
      i: visitor.issuedAt,
    },
    secret,
  );

export async function verifyVisitor(
  value: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<Visitor | null> {
  try {
    const body = await verifiedBody(value, secret);
    if (body === null) return null;
    const { v, id, n, o, i } = body;
    const name = cleanName(n);
    if (v !== VERSION || name === null || name !== n) return null;
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    if (typeof o !== 'number' || !Number.isInteger(o) || o < 0) return null;
    if (typeof i !== 'number' || !Number.isInteger(i)) return null;
    const age = Math.floor(now / 1000) - i;
    if (age > VISITOR_LIFETIME_SECONDS || age < -CLOCK_SKEW_SECONDS)
      return null;
    return { id, name, orb: o, issuedAt: i };
  } catch {
    return null;
  }
}

export const readVisitor = (
  request: Request,
  secret: string,
  now?: number,
): Promise<Visitor | null> =>
  verifyVisitor(
    cookieValue(request.headers.get('cookie'), VISITOR_COOKIE),
    secret,
    now,
  );

// Secure wherever the connection is not local development's own, as the gate
// cookie decides it.
export const visitorCookieOptions = (secure: boolean) =>
  ({
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: VISITOR_LIFETIME_SECONDS,
  }) as const;
