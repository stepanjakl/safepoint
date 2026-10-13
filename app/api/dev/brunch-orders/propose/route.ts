import { z } from 'zod';

import { calculate } from '@/lib/definitions/calculate';
import {
  checkProposal,
  keptProposal,
  proposalProgress,
  startProposal,
} from '@/lib/definitions/propose';
import { namesOf } from '@/lib/definitions/records';
import { fingerprintOf, loadRevision, loadSet } from '@/lib/definitions/store';
import { staleness } from '@/lib/definitions/fits';
import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { keptRead, READ_GONE } from '@/lib/processes/brunch-orders/reads';
import { draftingModelSchema } from '@/lib/models';

export const runtime = 'nodejs';

const text = z.string().min(1).max(20_000);
const readId = z.string().regex(/^[\w-]{1,80}$/);
// The accepted rulebook the run calculated on, which it keeps using.
const rulebook = z
  .string()
  .regex(/^[0-9a-f]{12}$/)
  .optional();
const values = z.record(z.string().max(80), z.number().int());

/*
  Development only: Propose, through lib/definitions/propose. get returns the
  kept proposal for the run's read and rulebook, with any job's progress;
  propose starts the job; check runs the accepted checks on values a person
  is changing, for one record.
*/
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .discriminatedUnion('action', [
      z.strictObject({ action: z.literal('get'), text, readId, rulebook }),
      z.strictObject({
        action: z.literal('propose'),
        text,
        readId,
        rulebook,
        model: draftingModelSchema.optional(),
      }),
      z.strictObject({
        action: z.literal('check'),
        text,
        readId,
        rulebook,
        key: z.string().max(80),
        values,
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
    const set =
      (body.rulebook
        ? await loadRevision(owner, body.text, body.rulebook)
        : null) ?? current;
    // A rulebook kept as it was accepted may no longer fit the data.
    const stale = staleness(owner, body.text, set, current, read);
    if (stale)
      return Response.json({ kind: 'stale', ...stale }, { status: 409 });
    const fingerprint = fingerprintOf(set);
    if (body.action === 'check')
      return Response.json({
        kind: 'check',
        ...checkProposal(owner, set, read, body.key, body.values),
      });
    if (body.action === 'propose')
      startProposal(owner, set, read, body.readId, body.text, {
        model: body.model,
      });
    // What the table shows beside each record: its name, and the values
    // Calculate worked out, which the proposal relied on.
    const calculation = calculate(owner, set, read);
    return Response.json({
      kind: 'proposal',
      fingerprint,
      names: namesOf(read, owner.subject.data),
      calculated: {
        calculations: calculation.calculations.map(({ id, name }) => ({
          id,
          name,
        })),
        rows: Object.fromEntries(
          calculation.rows.map((row) => [
            row.key,
            Object.fromEntries(
              Object.entries(row.values).map(([id, cell]) => [id, cell.value]),
            ),
          ]),
        ),
      },
      proposal: await keptProposal(owner, body.readId, fingerprint),
      progress: await proposalProgress(owner, body.readId, fingerprint),
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
