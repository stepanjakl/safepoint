import 'server-only';

import { findStep, settleDraft, writeStep } from './draft-steps';
import type { DraftFind, Rewrite } from './types';
import { said } from './said';

/*
  Server-only. A draft as a Vercel Workflow run (server/jobs/draft.ts starts
  it): find the definitions, write each in order, one step each, then say how
  it ended. Each step's result is kept by the run, so a draft a restart or a
  redeploy interrupted carries on from the last step that finished. Only
  orchestration is here: the workflow runs in a sandbox, and every read and
  write is a step's (draft-steps.ts). What a step reports as stopping it ends
  the draft with that, as a failure did before.
*/

const drafted = (count: number) =>
  `Drafted ${count} definition${count === 1 ? '' : 's'}.`;

export async function draftWorkflow(run: DraftFind) {
  'use workflow';
  try {
    const found = await findStep(run);
    if ('stopped' in found)
      return await settleDraft(run, { step: null, error: found.stopped });
    for (const [index, definition] of found.done.entries()) {
      const wrote = await writeStep(
        run,
        definition,
        { index, of: found.done.length },
        null,
      );
      if ('stopped' in wrote)
        return await settleDraft(run, { step: null, error: wrote.stopped });
    }
    await settleDraft(run, { step: drafted(found.done.length), error: null });
  } catch (error) {
    await settleDraft(run, { step: null, error: said(error) });
  }
}

// One definition written again, as a job of its own kind of draft.
export async function rewriteWorkflow(run: Rewrite) {
  'use workflow';
  try {
    const wrote = await writeStep(run, run.found, null, run.before);
    await settleDraft(
      run,
      'stopped' in wrote
        ? { step: null, error: wrote.stopped }
        : { step: 'Written again.', error: null },
    );
  } catch (error) {
    await settleDraft(run, { step: null, error: said(error) });
  }
}
