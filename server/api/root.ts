import 'server-only';

import { applyRouter } from './routers/apply';
import { calculateRouter } from './routers/calculate';
import { decisionsRouter } from './routers/decisions';
import { instructionsRouter } from './routers/instructions';
import { modelLimitsRouter } from './routers/model-limits';
import { proposeRouter } from './routers/propose';
import { readRouter } from './routers/read';
import { rulesRouter } from './routers/rules';
import { runsRouter } from './routers/runs';
import { sourcesRouter } from './routers/sources';
import { router } from './trpc';

/*
  Server-only. Every procedure the client can call, one router per area. The
  client imports only the type, which carries each procedure's input and
  output to it.
*/
export const appRouter = router({
  application: applyRouter,
  calculate: calculateRouter,
  decisions: decisionsRouter,
  instructions: instructionsRouter,
  modelLimits: modelLimitsRouter,
  propose: proposeRouter,
  read: readRouter,
  rules: rulesRouter,
  runs: runsRouter,
  sources: sourcesRouter,
});

export type AppRouter = typeof appRouter;
