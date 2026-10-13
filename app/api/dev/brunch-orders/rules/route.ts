import { z } from 'zod';

import { accept, confirmIntent, deny } from '@/lib/definitions/decide';
import { draftProgress, startDraft } from '@/lib/definitions/draft';
import { namesOf } from '@/lib/definitions/records';
import { listRevisions, loadSet } from '@/lib/definitions/store';
import type { DefinitionSet } from '@/lib/definitions/types';
import { workingOf } from '@/lib/definitions/working';
import { writeDefinition } from '@/lib/definitions/write';
import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { keptRead, READ_GONE } from '@/lib/processes/brunch-orders/reads';
import { draftingModelSchema } from '@/lib/models';

export const runtime = 'nodejs';

const text = z.string().min(1).max(20_000);
const id = z.string().max(80);
// The model to ask, falling back within its family; the default otherwise.
const model = draftingModelSchema.optional();

/*
  Development only: the definitions of one version of the instructions (its
  text), through lib/definitions. get reads them, with any draft running;
  draft finds them again and writes each on the server; write gives one a
  formula and examples on the read; intent confirms what the model
  understood; decide accepts one (rechecked in full) or denies it, with what
  is wrong. Each reply names the records the examples are about, and the
  rulebook's revisions.
*/
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .discriminatedUnion('action', [
      z.strictObject({ action: z.literal('get'), text }),
      z.strictObject({
        action: z.literal('draft'),
        text,
        version: z.string().max(20),
        readId: id,
        model,
      }),
      z.strictObject({ action: z.literal('intent'), text }),
      z.strictObject({
        action: z.literal('write'),
        text,
        readId: id,
        id,
        model,
      }),
      z.strictObject({
        action: z.literal('decide'),
        text,
        id,
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
  const reply = async (set: DefinitionSet | null) => {
    const drafting = await draftProgress(owner, body.text);
    if (!set) return Response.json({ kind: 'none', drafting });
    const read = set.readId ? await keptRead(set.readId) : null;
    return Response.json({
      kind: 'rules',
      set,
      names: read ? namesOf(read, owner.subject.data) : {},
      // The app's own working of each example, by definition.
      working: read
        ? Object.fromEntries(
            set.definitions.map((d) => [d.id, workingOf(owner, set, read, d)]),
          )
        : {},
      drafting,
      // Every accepted revision, newest first, and the one in use.
      history: await listRevisions(owner, body.text),
    });
  };
  const readOf = async (readId: string) => {
    const read = await keptRead(readId);
    if (!read) throw new Error(READ_GONE);
    return read;
  };
  try {
    switch (body.action) {
      case 'get':
        return reply(await loadSet(owner, body.text));
      case 'draft':
        startDraft(owner, body.text, body.version, await readOf(body.readId), {
          model: body.model,
        });
        return reply(await loadSet(owner, body.text));
      case 'intent':
        return reply(await confirmIntent(owner, body.text));
      case 'write':
        return reply(
          await writeDefinition(
            owner,
            body.text,
            await readOf(body.readId),
            body.id,
            { model: body.model },
          ),
        );
      case 'decide':
        return reply(
          body.decision === 'accept'
            ? await accept(owner, body.text, body.id, keptRead)
            : await deny(owner, body.text, body.id, body.note),
        );
    }
  } catch (error) {
    return Response.json(
      {
        kind: 'error',
        message:
          error instanceof Error ? error.message.split('\n')[0] : 'Failed.',
        drafting: await draftProgress(owner, body.text),
      },
      { status: 502 },
    );
  }
}
