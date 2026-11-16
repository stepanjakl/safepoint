import 'server-only';

import { cookies } from 'next/headers';

import { accessConfig } from './config';
import { SESSION_COOKIE, verifySession } from './session';

// Who is signed in on this request, or null: no gate cookie (local
// development has none), a bad one, or a deployment that is not configured.
export async function signedInAs(): Promise<string | null> {
  const config = accessConfig();
  if (config === null) return null;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return (await verifySession(value, config.cookieSecret))?.name ?? null;
}
