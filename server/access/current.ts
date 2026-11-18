import 'server-only';

import { cookies, headers } from 'next/headers';

import { isLocalDevelopment } from '@/lib/dev/dev-route';

import { accessConfig } from './config';
import { SESSION_COOKIE, verifySession } from './session';
import { VISITOR_COOKIE, verifyVisitor, visitorSecret } from './visitor';

// Who is signed in on this request, or null: no gate cookie (local
// development has none), a bad one, or a deployment that is not configured.
export async function signedInAs(): Promise<string | null> {
  const config = accessConfig();
  if (config === null) return null;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return (await verifySession(value, config.cookieSecret))?.name ?? null;
}

// Who this browser is before anyone has said: the name and orb on the visitor
// cookie the proxy issued, or null (no cookie yet, a bad one, or no key).
// Local development is judged on the host the request came to, as the proxy
// judges it.
export async function currentVisitor(): Promise<{
  id: string;
  name: string;
  orb: number;
} | null> {
  const host = (await headers()).get('host');
  let local = false;
  try {
    local = host !== null && isLocalDevelopment(new URL(`http://${host}`));
  } catch {
    local = false;
  }
  const secret = visitorSecret(local);
  if (secret === null) return null;
  const visitor = await verifyVisitor(
    (await cookies()).get(VISITOR_COOKIE)?.value,
    secret,
  );
  return visitor && { id: visitor.id, name: visitor.name, orb: visitor.orb };
}
