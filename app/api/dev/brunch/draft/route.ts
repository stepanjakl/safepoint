import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import {
  loadSnapshot,
  PROCESS_ID,
} from '@/lib/processes/avocado-toast/snapshot';
import { runChecks } from '@/lib/rulebook/checks';
import { mondayOf } from '@/lib/rulebook/cycle';
import { draftRulebook } from '@/lib/rulebook/draft';
import { draftingModelSchema } from '@/lib/rulebook/models';
import { saveDraftRecord } from '@/lib/rulebook/store';

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
    const draft = await draftRulebook(parsed.data.model, read, runId);
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
