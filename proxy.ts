import { NextResponse, type NextRequest } from 'next/server';

import { decideAccess } from '@/server/access/decision';

/*
  The one gate outside local development: every page and /api/trpc needs the
  signed cookie the gate page sets (server/access/). The decision is in
  server/access/decision.ts; this only answers it. gatedProcedure checks the
  cookie again for itself, on purpose.
*/
export async function proxy(request: NextRequest) {
  const decision = await decideAccess(request);
  switch (decision.kind) {
    case 'pass':
      return NextResponse.next();
    case 'sign-in':
      return NextResponse.redirect(new URL(decision.location, request.url));
    case 'unauthorized':
      return NextResponse.json(
        { kind: 'error', message: 'Sign in required.' },
        { status: 401 },
      );
    case 'unconfigured':
      return new NextResponse(decision.message, {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
  }
}

/*
  Everything but what holds no data and is needed before anyone has signed in:
  /_next/ (scripts, styles, fonts), /icon.svg (the tab icon) and
  /.well-known/workflow/ (Vercel Workflow's internal queue routes, which carry
  their own authentication and break if a proxy intercepts their POST bodies).
  The gate page is not excluded here: the decision lets it through once the
  deployment is configured, and refuses it until then. A literal, because
  Next reads the matcher at build time.
*/
export const config = {
  matcher: ['/((?!_next/|icon\\.svg$|\\.well-known/workflow/).*)'],
};
