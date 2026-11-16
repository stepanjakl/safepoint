'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { isLocalDevelopment } from '@/lib/dev/dev-route';
import { accessConfig, NOT_CONFIGURED_MESSAGE } from '@/server/access/config';
import { GATE_PATH, safeReturnPath } from '@/server/access/return-path';
import {
  cleanName,
  passwordMatches,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from '@/server/access/session';

/*
  The gate page's two actions. Next refuses a Server Action called from
  another origin; past that, nothing here trusts the browser beyond the
  password and name it was sent, and the return target is checked again.
*/

export type SignInState = { error: string | null; name: string };

const WRONG_PASSWORD = 'That password is not right.';
const NAME_REQUIRED = 'Enter your name, up to 80 characters.';

// Secure wherever this is not local development, judged on the host the
// request came to, as the proxy judges it.
async function onLocalHost(): Promise<boolean> {
  const host = (await headers()).get('host');
  try {
    return host !== null && isLocalDevelopment(new URL(`http://${host}`));
  } catch {
    return false;
  }
}

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const rawName = formData.get('name');
  const typed = typeof rawName === 'string' ? rawName : '';
  const config = accessConfig();
  if (config === null) return { error: NOT_CONFIGURED_MESSAGE, name: typed };

  const password = formData.get('password');
  // Compared whether or not the name is fit, so the answer takes as long.
  const rightPassword = await passwordMatches(
    typeof password === 'string' ? password : '',
    config.accessKey,
  );
  if (!rightPassword) return { error: WRONG_PASSWORD, name: typed };
  const name = cleanName(rawName);
  if (name === null) return { error: NAME_REQUIRED, name: typed };

  (await cookies()).set(
    SESSION_COOKIE,
    await signSession(name, config.cookieSecret),
    sessionCookieOptions(!(await onLocalHost())),
  );
  const next = formData.get('next');
  redirect(safeReturnPath(typeof next === 'string' ? next : null));
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect(GATE_PATH);
}
