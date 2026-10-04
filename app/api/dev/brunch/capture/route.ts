import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { saveSnapshot } from '@/lib/processes/avocado-toast/snapshot';
import { missingSheetEnv, readWholeSheet } from '@/lib/sheets/composio';

export const runtime = 'nodejs';

// Development only: saves a live read as the captured snapshot in the repository.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  if (missingSheetEnv().length)
    return Response.json({ kind: 'not_configured', missing: missingSheetEnv() }, { status: 503 });
  const read = await readWholeSheet();
  if (!read.requests.every((r) => r.successful))
    return Response.json({ kind: 'error', message: 'The read failed; nothing was saved.', read }, { status: 502 });
  const file = await saveSnapshot(read);
  return Response.json({ kind: 'result', file, readAt: read.readAt, tabs: read.tabs });
}
