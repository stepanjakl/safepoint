import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import {
  loadSnapshot,
  PROCESS_ID,
} from '@/lib/processes/avocado-toast/snapshot';
import { isStale } from '@/lib/rulebook/decisions';
import {
  addDecision,
  listDecisions,
  removeDecision,
} from '@/lib/rulebook/store';

export const runtime = 'nodejs';

const requestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('list') }),
  z.strictObject({
    action: z.literal('add'),
    statement: z.string().min(1).max(40),
    quote: z.string().min(1).max(600),
    question: z.string().min(1).max(300),
    answer: z.string().trim().min(1).max(600),
  }),
  z.strictObject({ action: z.literal('remove'), id: z.string().min(1) }),
]);

// Development only: the owner's answers to assumptions. Kept in the
// repository beside the rulebooks; never written to the sheet.
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { kind: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  const body = parsed.data;
  if (body.action === 'add') {
    const { action: _, ...input } = body;
    await addDecision(PROCESS_ID, input);
  }
  if (body.action === 'remove') await removeDecision(PROCESS_ID, body.id);
  const { read } = await loadSnapshot('captured');
  return Response.json({
    kind: 'list',
    decisions: (await listDecisions(PROCESS_ID)).map((decision) => ({
      ...decision,
      stale: isStale(decision, read),
    })),
  });
}
