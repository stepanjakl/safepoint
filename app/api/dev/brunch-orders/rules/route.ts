import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { namesOf } from '@/lib/processes/brunch-orders/formulas';
import { keptRead } from '@/lib/processes/brunch-orders/reads';
import {
  acceptable,
  findRules,
  ruleSet,
  update,
  writeItem,
  type RuleSet,
} from '@/lib/processes/brunch-orders/rules';

export const runtime = 'nodejs';

const text = z.string().min(1).max(20_000);

/*
  Development only: the rules of one version of the instructions (its text).
  get reads them; find asks the model to list them; intent confirms what it
  understood; write gives one item a formula and examples, run on the read;
  decide accepts an item whose examples all agree, or denies it, with what is
  wrong. Each reply names the products the examples are about.
*/
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .discriminatedUnion('action', [
      z.strictObject({ action: z.literal('get'), text }),
      z.strictObject({
        action: z.literal('find'),
        text,
        version: z.string().max(20),
      }),
      z.strictObject({ action: z.literal('intent'), text }),
      z.strictObject({
        action: z.literal('write'),
        text,
        readId: z.string().max(80),
        id: z.string().max(80),
      }),
      z.strictObject({
        action: z.literal('decide'),
        text,
        id: z.string().max(80),
        decision: z.enum(['accept', 'deny']),
        note: z.string().max(500).optional(),
      }),
    ])
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { kind: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  const body = parsed.data;
  const reply = async (set: RuleSet | null) => {
    if (!set) return Response.json({ kind: 'none' });
    const read = set.readId ? await keptRead(set.readId) : null;
    return Response.json({
      kind: 'rules',
      set,
      names: read ? namesOf(read) : {},
    });
  };
  try {
    switch (body.action) {
      case 'get':
        return reply(await ruleSet(body.text));
      case 'find':
        return reply(await findRules(body.text, body.version));
      case 'intent':
        return reply(
          await update(body.text, (s) => ({
            ...s,
            intentConfirmedAt: new Date().toISOString(),
          })),
        );
      case 'write': {
        const read = await keptRead(body.readId);
        if (!read)
          return Response.json(
            { kind: 'error', message: 'That read is no longer kept.' },
            { status: 404 },
          );
        return reply(await writeItem(body.text, read, body.id));
      }
      case 'decide':
        return reply(
          await update(body.text, (s) => ({
            ...s,
            items: s.items.map((i) =>
              i.id !== body.id
                ? i
                : body.decision === 'accept'
                  ? acceptable(i)
                    ? {
                        ...i,
                        approvedAt: new Date().toISOString(),
                        deniedAt: null,
                        denial: null,
                      }
                    : i
                  : {
                      ...i,
                      approvedAt: null,
                      deniedAt: new Date().toISOString(),
                      denial: body.note?.trim() || null,
                    },
            ),
          })),
        );
    }
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
