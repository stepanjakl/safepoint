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
