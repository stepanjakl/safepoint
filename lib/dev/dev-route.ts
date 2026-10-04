/*
  The gate every development-only route passes first: development mode, a
  loopback host, and no foreign origin. Anything else gets a 404 or 403 before
  a key is read or a provider is called.
*/
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function rejectUnlessLocalDevelopment(
  request: Request,
): Response | null {
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== 'development' || !LOOPBACK.has(url.hostname))
    return Response.json(
      { kind: 'error', message: 'Not found.' },
      { status: 404 },
    );
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin)
    return Response.json(
      { kind: 'error', message: 'Cross-origin request rejected.' },
      { status: 403 },
    );
  return null;
}

// Whole numbers travel as bigint inside the engine; JSON has no bigint.
export function jsonWithBigInts(body: unknown, init?: ResponseInit): Response {
  return new Response(
    JSON.stringify(body, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
    {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    },
  );
}

// A provider error can echo the request back; never let the key out with it.
export function redactKey(text: string, key: string | undefined): string {
  return key ? text.replaceAll(key, '[redacted]') : text;
}
