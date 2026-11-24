import 'server-only';

/*
  The two values a deployment must set for the gate to open anything:
  SAFEPOINT_ACCESS_KEY, the shared password, and SAFEPOINT_COOKIE_SECRET, the
  key the cookie is signed with. Missing or too short, there is no
  configuration, and every caller refuses rather than fall open: a short
  password is guessable, and nothing throttles guesses.
*/
const MIN_ACCESS_KEY_LENGTH = 16;
const MIN_COOKIE_SECRET_LENGTH = 32;

export type AccessConfig = { accessKey: string; cookieSecret: string };

export function accessConfig(
  env: Partial<Record<string, string>> = process.env,
): AccessConfig | null {
  const accessKey = env.SAFEPOINT_ACCESS_KEY ?? '';
  const cookieSecret = env.SAFEPOINT_COOKIE_SECRET ?? '';
  return accessKey.length >= MIN_ACCESS_KEY_LENGTH &&
    cookieSecret.length >= MIN_COOKIE_SECRET_LENGTH
    ? { accessKey, cookieSecret }
    : null;
}

export const NOT_CONFIGURED_MESSAGE = 'This deployment is not configured.';

/*
  A public deployment: SAFEPOINT_ACCESS=public opens every page without the
  password, and asks only for SAFEPOINT_COOKIE_SECRET, which signs the
  visitor cookie every stateful procedure then requires (server/api/trpc.ts).
  What a visitor may spend is counted (usage.ts) and the rules everyone shares
  are not theirs to change (shared-rules.ts). Set to anything else, or unset,
  the password gate applies as above.
*/
export function publicAccess(
  env: Partial<Record<string, string>> = process.env,
): 'public' | 'unconfigured' | null {
  if (env.SAFEPOINT_ACCESS !== 'public') return null;
  return (env.SAFEPOINT_COOKIE_SECRET ?? '').length >= MIN_COOKIE_SECRET_LENGTH
    ? 'public'
    : 'unconfigured';
}
