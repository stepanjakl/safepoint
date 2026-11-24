/*
  What a workflow tells the person when a step's error ends it. The error
  reaches the workflow rebuilt from its step, not always as an Error, and
  the SDK puts its own account of the retries before it; neither is the
  person's concern. Pure, so the workflows (which run in a sandbox) can use it.
*/
export function said(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : '';
  const own = message.replace(/^Step "[^"]*" failed after \d+ retries: /, '');
  return own.split('\n')[0] || 'Failed.';
}
