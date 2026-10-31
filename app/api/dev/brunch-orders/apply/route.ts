import { z } from 'zod';

import {
  applyDecisions,
  blockFor,
  keptApplication,
  prepareWrite,
  undoApplication,
  writesOf,
} from '@/lib/definitions/apply';
import { keptProposal } from '@/lib/definitions/propose';
import { namesOf } from '@/lib/definitions/records';
import { fingerprintOf, loadRevision, loadSet } from '@/lib/definitions/store';
import { staleness } from '@/lib/definitions/fits';
import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import {
  keptRead,
  liveSheet,
  READ_GONE,
  whyNotWritable,
} from '@/lib/processes/brunch-orders/reads';

export const runtime = 'nodejs';

const run = {
  text: z.string().min(1).max(20_000),
  readId: z.string().regex(/^[\w-]{1,80}$/),
  rulebook: z.string().regex(/^[0-9a-f]{12}$/),
};
const decided = {
  // The proposal the decisions were made on, which may have been replaced.
  proposedAt: z.string().max(40),
  decisions: z.record(
    z.string().max(80),
    z.object({
      kind: z.enum(['approve', 'change', 'reject']),
      values: z.record(z.string().max(80), z.number()).optional(),
      at: z.string().max(40),
    }),
  ),
};

/*
  Development only: Apply, through lib/definitions/apply. preview says what the
  decisions would write, from the sheet as it is now; write writes them and
  reads them back; undo puts the cells back while they still hold what was
  written. get returns the kept record alone, without touching the sheet.
*/
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .discriminatedUnion('action', [
      z.strictObject({ action: z.literal('preview'), ...run, ...decided }),
      z.strictObject({
        action: z.literal('write'),
        ...run,
        ...decided,
        // The checks that newly fail, by id, which a person has seen.
        acknowledged: z.array(z.string().max(200)).max(1000),
      }),
      z.strictObject({ action: z.literal('undo'), ...run }),
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
      (await loadRevision(owner, body.text, body.rulebook)) ?? current;
    const fingerprint = fingerprintOf(set);
    const stale = staleness(owner, body.text, set, current, read);
    if (stale)
      return Response.json({ kind: 'stale', ...stale }, { status: 409 });
    const notWritable = whyNotWritable(read);

    if (body.action === 'undo') {
      if (notWritable) throw new Error(notWritable);
      const outcome = await undoApplication(
        owner,
        read.id,
        fingerprint,
        liveSheet,
      );
      return outcome.kind === 'undone'
        ? Response.json({ kind: 'applied', application: outcome.application })
        : Response.json(
            { kind: 'error', message: outcome.problem },
            { status: 409 },
          );
    }

    const proposal = await keptProposal(owner, read.id, fingerprint);
    if (!proposal) throw new Error('This run has no proposal kept.');
    if (proposal.at !== body.proposedAt)
      throw new Error(
        'These decisions were made on an earlier proposal. Decide on the current one.',
      );
    const application = await keptApplication(owner, read.id, fingerprint);
    const shared = {
      tab: owner.subject.data.output?.tab,
      names: namesOf(read, owner.subject.data),
      application,
    };

    if (body.action === 'preview') {
      if (notWritable)
        return Response.json({
          kind: 'preview',
          ...shared,
          // Nothing was asked of the sheet, so every cell reads as new.
          notWritable,
          tabExists: false,
          changes: blockFor([], owner, writesOf(proposal, body.decisions))
            .changes,
          problems: [],
          newlyFailing: [],
        });
      const prepared = await prepareWrite(
        owner,
        set,
        read,
        proposal,
        body.decisions,
        liveSheet,
      );
      return Response.json({
        kind: 'preview',
        ...shared,
        notWritable: null,
        tabExists: prepared.tabExists,
        changes: prepared.changes,
        problems: prepared.problems,
        newlyFailing: prepared.newlyFailing,
      });
    }

    if (notWritable) throw new Error(notWritable);
    const outcome = await applyDecisions(
      owner,
      set,
      read,
      fingerprint,
      proposal,
      body.decisions,
      body.acknowledged,
      liveSheet,
    );
    return outcome.kind === 'written'
      ? Response.json({ kind: 'applied', application: outcome.application })
      : Response.json(
          {
            kind: 'preview',
            ...shared,
            notWritable: null,
            tabExists: outcome.prepared.tabExists,
            changes: outcome.prepared.changes,
            problems: outcome.prepared.problems,
            newlyFailing: outcome.prepared.newlyFailing,
          },
          { status: 409 },
        );
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
