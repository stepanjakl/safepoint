import 'server-only';

import { calculateRouter } from './routers/calculate';
import { modelLimitsRouter } from './routers/model-limits';
import { proposeRouter } from './routers/propose';
import { readRouter } from './routers/read';
import { sourcesRouter } from './routers/sources';
import { router } from './trpc';

/*
  Server-only. Every procedure the client can call, one router per area. The
  client imports only the type, which carries each procedure's input and
  output to it.
*/
export const appRouter = router({
  calculate: calculateRouter,
  modelLimits: modelLimitsRouter,
  propose: proposeRouter,
  read: readRouter,
  sources: sourcesRouter,
});

export type AppRouter = typeof appRouter;
