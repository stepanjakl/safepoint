import 'server-only';

import type { DraftFind, DraftRun, Found, Outcome } from './types';

/*
  Server-only. The steps of a draft (draft.ts), each a unit whose result the
  run keeps. Each loads its work (draft-work.ts) when it runs: the workflow's
  bundle keeps a step's module but not its body, and the work reaches the
  database and the models, which the workflow's sandbox cannot load.
*/

export async function findStep(run: DraftFind): Promise<Outcome<Found[]>> {
  'use step';
  return (await import('./draft-work')).find(run);
}

export async function writeStep(
  run: DraftRun,
  found: Found,
  at: { index: number; of: number } | null,
  before: string | null,
): Promise<Outcome<null>> {
  'use step';
  return (await import('./draft-work')).write(run, found, at, before);
}

export async function settleDraft(
  run: DraftRun,
  end: { step: string | null; error: string | null },
): Promise<void> {
  'use step';
  await (await import('./draft-work')).end(run, end);
}
