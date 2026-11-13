import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from '@/server/api/root';
import { createContext } from '@/server/api/trpc';

export const runtime = 'nodejs';

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
