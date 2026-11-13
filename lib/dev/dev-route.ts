/*
  The gate every development-only route and procedure passes first:
  development mode, a loopback host, and no foreign origin. Anything else is
  refused before a key is read or a provider is called. The plain routes
  answer the refusal as JSON (below); procedures throw it (server/api/trpc.ts).
*/
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

type Refusal = { status: 404 | 403; message: string };

export function localDevelopmentRefusal(request: Request): Refusal | null {
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== 'development' || !LOOPBACK.has(url.hostname))
    return { status: 404, message: 'Not found.' };
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin)
    return { status: 403, message: 'Cross-origin request rejected.' };
  return null;
}

export function rejectUnlessLocalDevelopment(
  request: Request,
): Response | null {
  const refusal = localDevelopmentRefusal(request);
  return (
    refusal &&
    Response.json(
      { kind: 'error', message: refusal.message },
      { status: refusal.status },
    )
  );
}

// A provider error can echo the request back; never let the key out with it.
export function redactKey(text: string, key: string | undefined): string {
  return key ? text.replaceAll(key, '[redacted]') : text;
}
