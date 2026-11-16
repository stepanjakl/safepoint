import type { Page } from '@playwright/test';
import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@/server/api/root';

/*
  Runs for a browser test, kept through the real procedures on the test
  server's own database. That database is shared by every test and cleared
  only when the server starts, so a test selects the runs it started by the id
  the server gave them, never by position in a list that others have added to.
*/
type Outputs = inferRouterOutputs<AppRouter>;

// Calls a procedure as the page would: a POST with the input as its body.
export async function call<T>(
  page: Page,
  path: string,
  input: unknown,
): Promise<T> {
  const response = await page.request.post(`/api/trpc/${path}`, {
    data: input ?? {},
  });
  const body = (await response.json()) as {
    result?: { data: T };
    error?: { message: string };
  };
  if (!body.result) throw new Error(`${path}: ${body.error?.message}`);
  return body.result.data;
}

// Starts a run under the process's current instructions, as the Start run
// control does.
export async function startKeptRun(
  page: Page,
  process: 'brunch-orders' | 'brunch-orders-direct',
  additionalInstructions: string | null = null,
): Promise<Outputs['runs']['start']> {
  const { versions } = await call<Outputs['instructions']['list']>(
    page,
    'instructions.list',
    { process },
  );
  return call(page, 'runs.start', {
    process,
    instructions: versions.at(-1)!.hash,
    additionalInstructions,
  });
}
