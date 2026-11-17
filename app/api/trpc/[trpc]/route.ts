import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from '@/server/api/root';
import { createContext } from '@/server/api/trpc';

export const runtime = 'nodejs';

/*
  One function serves every procedure, so its limit has to fit the longest.
  The default is 300 s (Fluid compute). Two procedures ask a model inside the
  request: `calculate.crossCheck` works every record out again, 25 to a call
  and one call after another, each allowed 180 s (lib/engine/calls.ts),
  and `rules.advise` makes a call that may wait for a model's quota first;
  either can need longer than 300 s, which is the most a Hobby plan allows (a
  build asking for more is refused there); on Pro, raise it towards 800 s.
  The sheet's reads and writes (`read.keep`, `sources.read`, `apply.*`) take
  seconds, and drafts, rewrites and proposals are Workflow
  runs (server/workflows/), not part of this request.
*/
export const maxDuration = 300;

// Every procedure, at /api/trpc/<router>.<procedure>, called by POST with its
// input as the body. Each procedure gates itself (gatedProcedure).
const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext,
    // The client sends queries as POST too (components/trpc/provider.tsx):
    // an input can be as long as a process's instructions.
    allowMethodOverride: true,
  });

export { handler as GET, handler as POST };
