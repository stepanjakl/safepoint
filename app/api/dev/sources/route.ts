import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { missingSheetEnv } from '@/lib/sheets/composio';
import {
  isSourceId,
  latestSummary,
  readSource,
  sourceValues,
} from '@/lib/sources/reads';

export const runtime = 'nodejs';

const fail = (message: string, status: number) =>
  Response.json({ kind: 'error', message }, { status });

// Development only: what a source holds (`summary`), reading it now (`read`),
// and one read's values (`values`), for its page and its data drawer.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .discriminatedUnion('action', [
      z.strictObject({ action: z.literal('summary'), source: z.string() }),
      z.strictObject({ action: z.literal('read'), source: z.string() }),
      z.strictObject({
        action: z.literal('values'),
        source: z.string(),
        read: z.string().max(80),
      }),
    ])
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Invalid request.', 400);
  const { action, source } = parsed.data;
  if (!isSourceId(source)) return fail('No such source.', 404);

  if (action === 'summary')
    return Response.json({
      kind: 'summary',
      summary: await latestSummary(source),
    });
  if (action === 'values') {
    const values = await sourceValues(source, parsed.data.read);
    return values
      ? Response.json({ kind: 'values', values })
      : fail('This read is no longer kept on the server.', 404);
  }
  if (missingSheetEnv().length)
    return fail(`Missing ${missingSheetEnv().join(', ')}.`, 503);
  try {
    return Response.json({
      kind: 'summary',
      summary: await readSource(source),
    });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : 'The read failed.',
      502,
    );
  }
}
