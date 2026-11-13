import 'server-only';

import { sourcesRouter } from './routers/sources';
import { router } from './trpc';

/*
  Server-only. Every procedure the client can call, one router per area. The
  client imports only the type, which carries each procedure's input and
  output to it.
*/
export const appRouter = router({
  sources: sourcesRouter,
});

export type AppRouter = typeof appRouter;
