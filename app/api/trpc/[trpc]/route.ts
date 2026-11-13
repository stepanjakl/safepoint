import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from '@/server/api/root';
import { createContext } from '@/server/api/trpc';

export const runtime = 'nodejs';

// Every procedure, at /api/trpc/<router>.<procedure>: a query by GET, a
// mutation by POST. Each procedure gates itself (gatedProcedure).
const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
