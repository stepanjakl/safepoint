import { z } from 'zod';

import { recordsOf } from '@/lib/definitions/records';
import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';
import { missingSheetEnv } from '@/lib/sheets/composio';
import {
  captureRead,
  keptRead,
  READ_GONE,
  readAndKeep,
} from '@/server/storage/brunch-orders-reads';

export const runtime = 'nodejs';

// Development only: a run reads the sheet's data tabs once (`read`), and
// later asks for that same read by its id (`get`).
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .discriminatedUnion('action', [
      z.strictObject({
        action: z.literal('read'),
        source: z.enum(['captured', 'live']),
      }),
      z.strictObject({ action: z.literal('get'), id: z.string().max(80) }),
      z.strictObject({ action: z.literal('capture') }),
    ])
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { kind: 'error', message: 'Invalid request.' },
      { status: 400 },
    );

  if (parsed.data.action === 'get') {
    try {
      const kept = await keptRead(parsed.data.id);
      return kept
        ? Response.json({ kind: 'read', ...kept })
        : Response.json({ kind: 'error', message: READ_GONE }, { status: 404 });
    } catch (error) {
      // A kept read that cannot be read is named, not hidden as gone.
      return Response.json(
        {
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'The read cannot be read.',
        },
        { status: 500 },
      );
    }
  }

  if (
    (parsed.data.action === 'capture' || parsed.data.source === 'live') &&
    missingSheetEnv().length
  )
    return Response.json(
      { kind: 'error', message: `Missing ${missingSheetEnv().join(', ')}.` },
      { status: 503 },
    );
  try {
    if (parsed.data.action === 'capture')
      return Response.json({ kind: 'captured', ...(await captureRead()) });
    const kept = await readAndKeep(parsed.data.source);
    return Response.json({
      kind: 'kept',
      id: kept.id,
      readAt: kept.readAt,
      source: kept.source,
      spreadsheet: kept.spreadsheet,
      tabs: kept.tabs.map((t) => ({ name: t.name, rows: t.values.length })),
      // Where the sheet does not fit what this process reads.
      problems: recordsOf(kept, SUBJECT.data).problems,
    });
  } catch (error) {
    return Response.json(
      {
        kind: 'error',
        message: error instanceof Error ? error.message : 'The read failed.',
      },
      { status: 502 },
    );
  }
}
