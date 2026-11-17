import 'server-only';

import type { Resolve } from '@/lib/definitions/calls';

/*
  Server-only. A test's stand-in models for a job (lib/definitions/
  models.fixture.ts), kept in this process by the claim that started it: a
  function cannot travel in a run's input, and only the steps of the start
  that holds the key may use them. The app never sets one, so its steps ask
  the real models.
*/

const server = globalThis as { safepointStandIns?: Map<string, Resolve> };

export function holdStandIns(holder: string, resolve: Resolve) {
  if (!process.env.VITEST)
    throw new Error('Only a test hands a job its models.');
  (server.safepointStandIns ??= new Map()).set(holder, resolve);
}

export const standInsFor = (holder: string): Resolve | undefined =>
  server.safepointStandIns?.get(holder);
