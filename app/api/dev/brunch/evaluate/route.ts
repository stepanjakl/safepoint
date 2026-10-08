import { z } from 'zod';

import {
  jsonWithBigInts,
  rejectUnlessLocalDevelopment,
} from '@/lib/dev/dev-route';
import {
  loadSnapshot,
  PROCESS_ID,
} from '@/lib/processes/avocado-toast/snapshot';
import { runChecks } from '@/lib/rulebook/checks';
import { mondayOf } from '@/lib/rulebook/cycle';
import { evaluate, readWhatIf } from '@/lib/rulebook/engine';
import { resolveRunRequest, runRequestSchema } from '@/lib/rulebook/run-time';
import { activeRulebook, readDraftRecord } from '@/lib/rulebook/store';
import { rulebookSchema, type Rulebook } from '@/lib/rulebook/schema';
import { validateRulebook } from '@/lib/rulebook/validate';
import { BRUNCH_MAY_CHANGE } from '@/lib/processes/avocado-toast/process';
import { missingSheetEnv } from '@/lib/sheets/composio';

export const runtime = 'nodejs';

// Development only: runs the approved rulebook for a chosen run time, and the store's checks.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .strictObject({
      source: z.enum(['captured', 'live']),
      run: runRequestSchema,
      period: z.number().int().min(0).max(3).default(0),
      // What-if values typed in the Check step, per item key and value name.
      // They change this evaluation only; the sheet is never written.
      // The approved rulebook, or a saved draft to test before approving it.
      rulebook: z
        .discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('approved') }),
          z.strictObject({
            kind: z.literal('draft'),
            file: z.string().max(120),
          }),
        ])
        .default({ kind: 'approved' }),
      whatIf: z
        .record(
          z.string().max(64),
          z.record(z.string().max(64), z.string().max(40)),
        )
        .default({}),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { kind: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  let rulebook: Rulebook;
  let used:
    | {
        kind: 'approved';
        version: number;
        approved_at: string;
        drafted: { model: string; run_id: string; at: string };
      }
    | { kind: 'draft'; file: string; startedAt: string; model: string };
  if (parsed.data.rulebook.kind === 'draft') {
    // Loaded from its saved record, so what runs is exactly what was saved.
    const { file } = parsed.data.rulebook;
    const record = await readDraftRecord(PROCESS_ID, file);
    const book = rulebookSchema.safeParse(record?.draft.rulebook);
    if (!record || !book.success)
      return Response.json(
        {
          kind: 'error',
          message: record
            ? 'That draft has no rulebook in the current shape to run.'
            : 'No such draft.',
        },
        { status: 404 },
      );
    rulebook = book.data;
    used = {
      kind: 'draft',
      file,
      startedAt: record.draft.startedAt,
      model: record.draft.model,
    };
  } else {
    const active = await activeRulebook(PROCESS_ID);
    if (!active) return Response.json({ kind: 'no_rulebook' }, { status: 409 });
    rulebook = active.rulebook;
    used = {
      kind: 'approved',
      version: active.version,
      approved_at: active.approved_at,
      drafted: active.drafted,
    };
  }
  if (parsed.data.source === 'live' && missingSheetEnv().length)
    return Response.json(
      { kind: 'not_configured', missing: missingSheetEnv() },
      { status: 503 },
    );
  const { read, label } = await loadSnapshot(parsed.data.source);
  const tz = rulebook.timing.time_zone;
  const now = Date.now();
  const { runAt, chosen } = resolveRunRequest(parsed.data.run, tz, now);
  const reference = mondayOf(runAt, tz);
  // A value that cannot be read is left out and reported beside its field.
  const overrides: Record<string, Record<string, bigint | number>> = {};
  const whatIfIssues: { key: string; name: string; issue: string }[] = [];
  for (const [key, values] of Object.entries(parsed.data.whatIf))
    for (const [name, text] of Object.entries(values)) {
      const read = readWhatIf(rulebook, name, text);
      if (read.ok) (overrides[key] ??= {})[name] = read.value;
      else whatIfIssues.push({ key, name, issue: read.issue });
    }
  return jsonWithBigInts({
    kind: 'result',
    source: label,
    chosen,
    rulebook: used,
    evaluation: evaluate(rulebook, read, runAt, {
      explain: true,
      periodIndex: parsed.data.period,
      overrides,
    }),
    checks: { reference, ...runChecks(rulebook, read, reference) },
    whatIfIssues,
    // What the rulebook no longer passes, on this read of the sheet.
    drift: validateRulebook(rulebook, read, BRUNCH_MAY_CHANGE, runAt),
  });
}
