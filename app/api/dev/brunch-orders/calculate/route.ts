import { z } from 'zod';

import {
  calculate,
  crossCheck,
  keepCrossCheck,
  keptCrossCheck,
} from '@/lib/definitions/calculate';
import { loadSet } from '@/lib/definitions/store';
import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { keptRead } from '@/lib/processes/brunch-orders/reads';
import { draftingModelSchema } from '@/lib/rulebook/models';

export const runtime = 'nodejs';

const text = z.string().min(1).max(20_000);
const readId = z.string().regex(/^[\w-]{1,80}$/);

/*
  Development only: Calculate, through lib/definitions/calculate. get works
  every accepted calculation out for every record of a read, with any
  cross-check kept for that read and rulebook; crossCheck asks the model to
  work the same values out on its own, keeps its answer and returns both.
*/
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .discriminatedUnion('action', [
      z.strictObject({ action: z.literal('get'), text, readId }),
      z.strictObject({
        action: z.literal('crossCheck'),
        text,
        readId,
        model: draftingModelSchema.optional(),
      }),
    ])
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { kind: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  const body = parsed.data;
  try {
    const set = await loadSet(owner, body.text);
    if (!set) throw new Error('No rules are kept for these instructions.');
    const read = await keptRead(body.readId);
    if (!read) throw new Error('That read is no longer kept.');
    const calculation = calculate(owner, set, read);
    let check = await keptCrossCheck(
      owner,
      body.readId,
      calculation.fingerprint,
    );
    if (body.action === 'crossCheck') {
      check = await crossCheck(owner, set, read, body.readId, body.text, {
        model: body.model,
      });
      await keepCrossCheck(owner, check);
    }
    return Response.json({ kind: 'calculation', calculation, check });
  } catch (error) {
    return Response.json(
      {
        kind: 'error',
        message:
          error instanceof Error ? error.message.split('\n')[0] : 'Failed.',
      },
      { status: 502 },
    );
  }
}
