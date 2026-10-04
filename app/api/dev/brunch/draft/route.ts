import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { modelIdSchema } from '@/lib/model-workbench/models';
import { loadSnapshot } from '@/lib/processes/avocado-toast/snapshot';
import { draftRulebook } from '@/lib/rulebook/draft';

export const runtime = 'nodejs';
export const maxDuration = 600;

// Development only: a model drafts the whole rulebook from the sheet.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    return Response.json({ kind: 'not_configured', missing: ['GOOGLE_GENERATIVE_AI_API_KEY'] }, { status: 503 });
  const parsed = z
    .strictObject({ model: modelIdSchema, source: z.enum(['captured', 'live']) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: 'error', message: 'Invalid request.' }, { status: 400 });
  const runId = crypto.randomUUID();
  try {
    const { read, label } = await loadSnapshot(parsed.data.source);
    const draft = await draftRulebook(parsed.data.model, read, runId);
    return Response.json({ kind: 'result', source: label, draft });
  } catch (error) {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
    const message = error instanceof Error ? error.message : 'Drafting failed.';
    return Response.json({ kind: 'error', runId, message: key ? message.replaceAll(key, '[redacted]') : message }, { status: 502 });
  }
}
