import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';
import type { inferRouterOutputs } from '@trpc/server';

import { hashOf } from '@/lib/definitions/fingerprint';
import {
  BRUNCH_ORDERS_ID,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
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

/*
  The revision the server keeps for the Brunch orders instructions a run starts
  under (seeding keeps what is in fixtures/): the one a run may pin, since the
  pin is a key into the revisions kept for the run's own instructions. The
  frozen copies in e2e/fixtures/ were accepted under an earlier version, so a
  test that lets the screen pin the rulebook it calculated on serves them
  under this fingerprint instead (`asKeptRulebook`); nothing else about them
  changes. A test that mocks every `rules` procedure must also ask the server
  once for the rulebook (`seedKeptRulebooks`), since seeding is done by the
  first of them to be answered for real.
*/
function keptRulebook(): string {
  const hash = hashOf(brunchOrdersProcess.instructions.text);
  const folder = path.join('fixtures', BRUNCH_ORDERS_ID, 'rulebooks');
  const version = readdirSync(folder).find((entry) =>
    entry.endsWith(`-${hash}`),
  );
  if (!version)
    throw new Error(`No rulebook is kept for instructions ${hash}.`);
  const { head } = JSON.parse(
    readFileSync(path.join(folder, version, 'revisions.json'), 'utf8'),
  ) as { head: string };
  return head;
}

// A frozen reply with the fingerprint it was frozen under replaced.
export function asKeptRulebook<T>(frozen: T, fingerprint: string): T {
  return JSON.parse(
    JSON.stringify(frozen).replaceAll(fingerprint, keptRulebook()),
  ) as T;
}

// Has the server keep what fixtures/ holds for the process: its first
// answer from the rulebooks does.
export async function seedKeptRulebooks(page: Page): Promise<void> {
  await call(page, 'rules.get', {
    text: brunchOrdersProcess.instructions.text,
  });
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
