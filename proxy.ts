import { NextResponse, type NextRequest } from 'next/server';

import { decideAccess, type AccessDecision } from '@/server/access/decision';
import { visitorToIssue } from '@/server/access/issue-visitor';
import { VISITOR_COOKIE } from '@/server/access/visitor';

/*
  The one gate outside local development: every page and /api/trpc needs the
  signed cookie the gate page sets (server/access/). The decision is in
  server/access/decision.ts; this only answers it. gatedProcedure checks the
  cookie again for itself, on purpose.

  Apart from the gate, a page request without a valid visitor cookie gets one
  (server/access/issue-visitor.ts). It is added to whatever response the gate
  gave and never changes the answer; a page let through also sees it on this
  same request, so the first render already knows the visitor.
*/
function answer(
  request: NextRequest,
  decision: AccessDecision,
  cookie?: string,
) {
  switch (decision.kind) {
    case 'pass': {
      if (cookie === undefined) return NextResponse.next();
      const headers = new Headers(request.headers);
      // Any visitor cookie already carried is an invalid one: drop it, or it
      // would be read first.
      const carried = (headers.get('cookie') ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith(`${VISITOR_COOKIE}=`));
      headers.set('cookie', [...carried, cookie].join('; '));
      return NextResponse.next({ request: { headers } });
    }
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

export async function proxy(request: NextRequest) {
  const decision = await decideAccess(request);
  const issued = await visitorToIssue(request);
  const response = answer(
    request,
    decision,
    issued ? `${issued.name}=${issued.value}` : undefined,
  );
  if (issued) response.cookies.set(issued.name, issued.value, issued.options);
  return response;
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
