import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { loadSnapshot, PROCESS_ID } from '@/lib/processes/avocado-toast/snapshot';
import { bindTables } from '@/lib/rulebook/engine';
import { activeRulebook } from '@/lib/rulebook/store';
import { missingSheetEnv } from '@/lib/sheets/composio';

export const runtime = 'nodejs';

// Development only: the sheet as read, and how the approved rulebook binds it.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z.strictObject({ source: z.enum(['captured', 'live']) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: 'error', message: 'Invalid request.' }, { status: 400 });
  if (parsed.data.source === 'live' && missingSheetEnv().length)
    return Response.json({ kind: 'not_configured', missing: missingSheetEnv() }, { status: 503 });
  try {
    const { read, label } = await loadSnapshot(parsed.data.source);
    const active = await activeRulebook(PROCESS_ID);
    const bound = active
      ? bindTables(active.rulebook, read).map(({ table, bound }) => ({
          name: table.name,
          tab: table.tab,
          shape: table.shape,
          role: active.rulebook.sources.find((s) => s.tab === table.tab)?.role ?? null,
          columns: table.columns,
          headers: bound.headers,
          issues: bound.issues,
          rows: bound.rows,
        }))
      : null;
    return Response.json({
      kind: 'result',
      source: label,
      read,
      rulebook: active ? { version: active.version, sources: active.rulebook.sources } : null,
      bound,
    });
  } catch (error) {
    return Response.json({ kind: 'error', message: error instanceof Error ? error.message : 'Read failed.' }, { status: 502 });
  }
}
