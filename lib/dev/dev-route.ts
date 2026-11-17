/*
  The gate every development-only route and procedure passes first:
  development mode, a loopback host, and no foreign origin. Anything else is
  refused before a key is read or a provider is called. The plain routes
  answer the refusal as JSON (below); procedures throw it (server/api/trpc.ts).
*/
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

type Refusal = { status: 404 | 403; message: string };

// Development mode on a loopback host: the first two of the three checks, and
// the one definition of "local development" the shared-password gate
// (server/access/) uses as well.
export function isLocalDevelopment(url: URL): boolean {
  return process.env.NODE_ENV === 'development' && LOOPBACK.has(url.hostname);
}

// The third check, which a signed-in request passes as well. On Vercel Next
// builds request.url from the Host header and x-forwarded-proto (its build
// sets trustHostHeader), so it is the address the browser used and no
// forwarded header needs reading here. A server of one's own behind a proxy
// would see its bind address instead, and would refuse every POST.
export function crossOriginRefusal(request: Request): Refusal | null {
  const origin = request.headers.get('origin');
  return origin !== null && origin !== new URL(request.url).origin
    ? { status: 403, message: 'Cross-origin request rejected.' }
    : null;
}

export function localDevelopmentRefusal(request: Request): Refusal | null {
  if (!isLocalDevelopment(new URL(request.url)))
    return { status: 404, message: 'Not found.' };
  return crossOriginRefusal(request);
}

/*
  Whether the shared password guards a request: always outside local
  development, and inside it only with SAFEPOINT_GATE=1, so the gate can be
  tried on a laptop. The development-only routes above never read this switch;
  they stay local whatever is signed in.
*/
export function gateApplies(url: URL): boolean {
  return process.env.SAFEPOINT_GATE === '1' || !isLocalDevelopment(url);
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
