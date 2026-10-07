import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { PROCESS_ID } from '@/lib/processes/avocado-toast/snapshot';
import { listDraftRecords, readDraftRecord } from '@/lib/rulebook/store';

export const runtime = 'nodejs';

// Development only: earlier drafts, listed or opened in full. Read-only.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .strictObject({ file: z.string().optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return Response.json(
      { kind: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  if (!parsed.data.file)
    return Response.json({
      kind: 'list',
      drafts: await listDraftRecords(PROCESS_ID),
    });
  const record = await readDraftRecord(PROCESS_ID, parsed.data.file);
  return record
    ? Response.json({ kind: 'record', file: parsed.data.file, ...record })
    : Response.json(
        { kind: 'error', message: 'No such draft.' },
        { status: 404 },
      );
}
