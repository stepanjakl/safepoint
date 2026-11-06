import { z } from 'zod';

import { advise } from '@/lib/definitions/advise';
import { accept, choose, confirmIntent, deny } from '@/lib/definitions/decide';
import { debugDefinition, debugDraft } from '@/lib/definitions/debug';
import {
  draftProgress,
  startDraft,
  startRewrite,
} from '@/lib/definitions/draft';
import { namesOf } from '@/lib/definitions/records';
import { revisionChanges } from '@/lib/definitions/revision-changes';
import { listRevisions, loadRevision, loadSet } from '@/lib/definitions/store';
import type { DefinitionSet } from '@/lib/definitions/types';
import { sentencesOf } from '@/lib/definitions/shapes';
import { workingOf } from '@/lib/definitions/working';
import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { keptRead, READ_GONE } from '@/lib/processes/brunch-orders/reads';
import { draftingModelSchema } from '@/lib/models';

export const runtime = 'nodejs';

const text = z.string().min(1).max(20_000);
const id = z.string().max(80);
// The model to ask, falling back within its family; the default otherwise.
const model = draftingModelSchema.optional();

// The revisions, each with what it changed from its parent.
async function historyOf(text: string) {
  const history = await listRevisions(owner, text);
  const revisions = await Promise.all(
    history.revisions.map(async (revision) => {
      const set = await loadRevision(owner, text, revision.id);
      const parent = revision.parent
        ? await loadRevision(owner, text, revision.parent)
        : null;
      return {
        ...revision,
        changes: set ? revisionChanges(parent, set) : null,
      };
    }),
  );
  return { ...history, revisions };
}

/*
  Development only: the definitions of one version of the instructions (its
  text), through lib/definitions. get reads them, with any draft running;
  draft finds them again and writes each on the server; write gives one a
  formula and examples on the read, on the server too; intent confirms what the model
  understood; decide accepts one (rechecked in full) or denies it, with what
  is wrong; choose takes a version where writes disagreed, and advise
  says which the instructions support, for a person to weigh. Each reply names the records the examples are about, and the
  rulebook's revisions. debug and debugDraft say what code finds of one
  definition, or of the draft, on the read: they ask no model.
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
        action: z.literal('choose'),
        text,
        id,
        index: z.number().int().min(0).max(5),
      }),
      z.strictObject({ action: z.literal('advise'), text, id }),
      z.strictObject({
        action: z.literal('debug'),
        text,
        readId: id.nullable(),
        id,
        inputs: z.record(z.string().max(80), z.number().int().min(0)),
      }),
      z.strictObject({
        action: z.literal('debugDraft'),
        text,
        readId: id.nullable(),
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
  const reply = async (
    set: DefinitionSet | null,
    drafting: Awaited<ReturnType<typeof draftProgress>>,
  ) => {
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
      // Each check's sentence, and each version's where writes disagreed.
      sentences: read ? sentencesOf(owner.subject, set, read) : {},
      drafting,
      // Every accepted revision, newest first, and the one in use.
      history: await historyOf(body.text),
    });
  };
  // Progress first: rules read after it are at least as new as it says, so
  // "finished" never arrives beside rules from before the end.
  const replyWith = async (load: () => Promise<DefinitionSet | null>) => {
    const drafting = await draftProgress(owner, body.text);
    return reply(await load(), drafting);
  };
  const readOf = async (readId: string) => {
    const read = await keptRead(readId);
    if (!read) throw new Error(READ_GONE);
    return read;
  };
  try {
    switch (body.action) {
      case 'get':
        return replyWith(() => loadSet(owner, body.text));
      case 'draft':
        startDraft(owner, body.text, body.version, await readOf(body.readId), {
          model: body.model,
        });
        return replyWith(() => loadSet(owner, body.text));
      case 'intent':
        return replyWith(() => confirmIntent(owner, body.text));
      case 'write':
        startRewrite(owner, body.text, await readOf(body.readId), body.id, {
          model: body.model,
        });
        return replyWith(() => loadSet(owner, body.text));
      case 'choose':
        return replyWith(() => choose(owner, body.text, body.id, body.index));
      case 'advise': {
        const set = await loadSet(owner, body.text);
        if (!set) throw new Error('No rules are kept for these instructions.');
        const read = set.readId ? await keptRead(set.readId) : null;
        if (!read) throw new Error(READ_GONE);
        return Response.json({
          kind: 'advice',
          advice: await advise(owner, body.text, set, read, body.id),
        });
      }
      case 'debug': {
        const set = await loadSet(owner, body.text);
        if (!set) throw new Error('No rules are kept for these instructions.');
        const readId = body.readId ?? set.readId;
        const read = readId ? await keptRead(readId) : null;
        if (!read) throw new Error(READ_GONE);
        const debug = debugDefinition(
          owner,
          body.text,
          set,
          read,
          body.id,
          body.inputs,
        );
        if (!debug) throw new Error('No such definition.');
        return Response.json({ kind: 'debug', debug });
      }
      case 'debugDraft': {
        const set = await loadSet(owner, body.text);
        if (!set) throw new Error('No rules are kept for these instructions.');
        return Response.json({
          kind: 'debugDraft',
          debug: debugDraft(
            owner,
            body.text,
            set,
            await keptRead(body.readId ?? set.readId ?? ''),
          ),
        });
      }
      case 'decide':
        return replyWith(() =>
          body.decision === 'accept'
            ? accept(owner, body.text, body.id, keptRead)
            : deny(owner, body.text, body.id, body.note),
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
