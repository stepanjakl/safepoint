import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { BRUNCH_MAY_CHANGE } from '@/lib/processes/avocado-toast/process';
import {
  loadSnapshot,
  PROCESS_ID,
} from '@/lib/processes/avocado-toast/snapshot';
import { decisionSchema, rulebookSchema } from '@/lib/rulebook/schema';
import { approveRulebook } from '@/lib/rulebook/store';
import { validateRulebook } from '@/lib/rulebook/validate';

export const runtime = 'nodejs';

// Development only: a person approves a draft; it is checked again and saved as the next version.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .strictObject({
      rulebook: rulebookSchema,
      drafted: z.strictObject({
        model: z.string(),
        run_id: z.string(),
        at: z.string(),
      }),
      source: z.enum(['captured', 'live']),
      decisions: z.array(decisionSchema).default([]),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        kind: 'error',
        message: 'Not a valid rulebook.',
        issues: parsed.error.issues
          .slice(0, 10)
          .map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400 },
    );
  const { read } = await loadSnapshot(parsed.data.source);
  const book = parsed.data.rulebook;
  const issues = validateRulebook(book, read, BRUNCH_MAY_CHANGE);
  if (issues.length)
    return Response.json(
      {
        kind: 'error',
        message: 'The draft no longer passes its checks.',
        issues,
      },
      { status: 422 },
    );
  const { record, file } = await approveRulebook(
    PROCESS_ID,
    parsed.data.rulebook,
    parsed.data.drafted,
    parsed.data.decisions,
  );
  return Response.json({ kind: 'result', version: record.version, file });
}
