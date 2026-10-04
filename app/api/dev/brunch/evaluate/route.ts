import { z } from 'zod';

import { jsonWithBigInts, rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { loadSnapshot, PROCESS_ID } from '@/lib/processes/avocado-toast/snapshot';
import { runChecks } from '@/lib/rulebook/checks';
import { mondayOf } from '@/lib/rulebook/cycle';
import { evaluate } from '@/lib/rulebook/engine';
import { resolveRunRequest, runRequestSchema } from '@/lib/rulebook/run-time';
import { activeRulebook } from '@/lib/rulebook/store';
import { missingSheetEnv } from '@/lib/sheets/composio';

export const runtime = 'nodejs';

// Development only: runs the approved rulebook for a chosen run time, and the store's checks.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .strictObject({ source: z.enum(['captured', 'live']), run: runRequestSchema, period: z.number().int().min(0).max(3).default(0) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: 'error', message: 'Invalid request.' }, { status: 400 });
  const active = await activeRulebook(PROCESS_ID);
  if (!active) return Response.json({ kind: 'no_rulebook' }, { status: 409 });
  if (parsed.data.source === 'live' && missingSheetEnv().length)
    return Response.json({ kind: 'not_configured', missing: missingSheetEnv() }, { status: 503 });
  const { read, label } = await loadSnapshot(parsed.data.source);
  const tz = active.rulebook.timing.time_zone;
  const now = Date.now();
  const { runAt, chosen } = resolveRunRequest(parsed.data.run, tz, now);
  const reference = mondayOf(runAt, tz);
  return jsonWithBigInts({
    kind: 'result',
    source: label,
    chosen,
    rulebook: { version: active.version, approved_at: active.approved_at, drafted: active.drafted },
    evaluation: evaluate(active.rulebook, read, runAt, { periodIndex: parsed.data.period }),
    checks: { reference, ...runChecks(active.rulebook, read, reference) },
  });
}
