import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { BRUNCH_MAY_CHANGE } from '@/lib/processes/avocado-toast/process';
import {
  loadSnapshot,
  PROCESS_ID,
} from '@/lib/processes/avocado-toast/snapshot';
import { runChecks } from '@/lib/rulebook/checks';
import { mondayOf } from '@/lib/rulebook/cycle';
import { currentDecisions } from '@/lib/rulebook/decisions';
import { carryOver, draftRulebook } from '@/lib/rulebook/draft';
import { draftingModelSchema } from '@/lib/rulebook/models';
import {
  listDecisions,
  readDraftRecord,
  saveDraftRecord,
} from '@/lib/rulebook/store';

export const runtime = 'nodejs';
export const maxDuration = 600;

// Development only: a model drafts the whole rulebook from the sheet.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    return Response.json(
      { kind: 'not_configured', missing: ['GOOGLE_GENERATIVE_AI_API_KEY'] },
      { status: 503 },
    );
  const parsed = z
    .strictObject({
      model: draftingModelSchema,
      source: z.enum(['captured', 'live']),
      // A saved draft to continue: the stages it passed are carried over.
      resume: z
        .string()
        .regex(/^[\w.-]+\.json$/)
        .optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { kind: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  const runId = crypto.randomUUID();
  try {
    const { read, label } = await loadSnapshot(parsed.data.source);
    let resume;
    if (parsed.data.resume) {
      const earlier = await readDraftRecord(PROCESS_ID, parsed.data.resume);
      if (!earlier)
        return Response.json(
          { kind: 'error', message: 'No such draft to continue.' },
          { status: 404 },
        );
      resume = { file: parsed.data.resume, ...carryOver(earlier.draft) };
    }
    // Stale decisions (their statement's text changed) wait for the owner.
    const decisions = currentDecisions(await listDecisions(PROCESS_ID), read);
    const draft = await draftRulebook(parsed.data.model, read, runId, {
      resume,
      decisions,
      mayChange: BRUNCH_MAY_CHANGE,
    });
    // Scored against the store's checks for the reader only; the model
    // never sees them.
    let checks = null;
    if (draft.rulebook)
      try {
        const reference = mondayOf(Date.now(), draft.rulebook.timing.time_zone);
        checks = { reference, ...runChecks(draft.rulebook, read, reference) };
      } catch {
        checks = null;
      }
    const record = { source: label, draft, checks };
    const saved = await saveDraftRecord(PROCESS_ID, runId, record).catch(
      () => null,
    );
    return Response.json({ kind: 'result', ...record, saved });
  } catch (error) {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
    const message = error instanceof Error ? error.message : 'Drafting failed.';
    return Response.json(
      {
        kind: 'error',
        runId,
        message: key ? message.replaceAll(key, '[redacted]') : message,
      },
      { status: 502 },
    );
  }
}
