import { z } from 'zod';

import {
  calculate,
  crossCheck,
  keepCrossCheck,
  keptCrossCheck,
} from '@/lib/definitions/calculate';
import {
  fingerprintOf,
  loadRevision,
  loadSet,
  putRevision,
} from '@/lib/definitions/store';
import { staleness } from '@/lib/definitions/fits';
import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { keptRead, READ_GONE } from '@/lib/processes/brunch-orders/reads';
import { draftingModelSchema } from '@/lib/rulebook/models';

export const runtime = 'nodejs';

const text = z.string().min(1).max(20_000);
const readId = z.string().regex(/^[\w-]{1,80}$/);
// The accepted rulebook a run calculated on, which it keeps using.
const rulebook = z
  .string()
  .regex(/^[0-9a-f]{12}$/)
  .optional();

/*
  Development only: Calculate, through lib/definitions/calculate. get works
  every accepted calculation out for every record of a read, with any
  cross-check kept for that read and rulebook; crossCheck asks the model to
  work the same values out on its own, keeps its answer and returns both.
  A run names the rulebook it calculated on, and keeps getting that one; the
  reply says which rulebook is current, so the run can move to it.
*/
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .discriminatedUnion('action', [
      z.strictObject({ action: z.literal('get'), text, readId, rulebook }),
      z.strictObject({
        action: z.literal('crossCheck'),
        text,
        readId,
        rulebook,
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
    const current = await loadSet(owner, body.text);
    if (!current) throw new Error('No rules are kept for these instructions.');
    const read = await keptRead(body.readId);
    if (!read) throw new Error(READ_GONE);
    const pinned = body.rulebook
      ? await loadRevision(owner, body.text, body.rulebook)
      : null;
    const set = pinned ?? current;
    // A rulebook kept as it was accepted may no longer fit the data.
    const stale = staleness(owner, body.text, set, current, read);
    if (stale)
      return Response.json({ kind: 'stale', ...stale }, { status: 409 });
    const calculation = calculate(owner, set, read);
    // What a run calculates on is kept as it is, so the run can come back to
    // it; one accepted in full was kept then, and this adds nothing.
    if (!pinned) await putRevision(owner, set, { reason: 'used' });
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
    return Response.json({
      kind: 'calculation',
      calculation,
      check,
      current: fingerprintOf(current),
    });
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
