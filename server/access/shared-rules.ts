import 'server-only';

/*
  Server-only. Whether the rules every run shares -- the instructions, the
  rulebook kept for them and the data profile under it -- are closed to
  change. Where a deployment is open to anyone (config.ts `publicAccess`) they
  are, so one visitor cannot redraft or deny what the next one runs on;
  SAFEPOINT_PUBLIC_RULES=open opens them again. Behind the password, and in
  local development, they are open as before.
*/
export function sharedRulesLocked(
  open: boolean,
  env: Partial<Record<string, string>> = process.env,
): boolean {
  return open && env.SAFEPOINT_PUBLIC_RULES !== 'open';
}

export const SHARED_INSTRUCTIONS_LOCKED =
  'In this public demo the instructions are fixed. A run can add a note of its own when it starts.';
