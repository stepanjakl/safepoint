import 'server-only';

import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { stillWriting } from '@/lib/engine/apply';
import {
  checkVerdictsSchema,
  type CheckVerdict,
  type DefinitionProcess,
  type Verdict,
} from '@/lib/engine/types';

import { database, type Database } from '@/server/db/client';
import { recordDecisions } from '@/server/db/schema';

import { latestRow } from '@/server/storage/writes/application-rows';
import { recordOf } from '@/server/storage/writes/applications';
import { Refused } from '@/server/storage/refused';
import { lockRunKey, type RunKey } from '@/server/storage/run-key';
import { parseStored } from '@/server/storage/stored';

/*
  Server-only. A person's decisions on the records of a proposal, in
  `record_decisions`: each one an event, appended and never changed (the
  table's trigger), made in one run on one exact proposal row. A record's
  current decision is the latest event for it in that run on that proposal;
  a withdrawal means none. History is never rewritten: a new proposal starts
  with no decisions, and the ones made on the earlier one stay on it.
*/

export type Kind = 'approve' | 'change' | 'reject';

// A record's current decision, with what the person was shown when making
// it: the verdict and every check, as the server worked them out.
export type KeptDecision = {
  kind: Kind;
  // A change's own values; null for an approval or a rejection.
  values: Record<string, number> | null;
  verdict: Verdict | null;
  checks: CheckVerdict[] | null;
  actor: string | null;
  at: string;
};

export type NewEvent = {
  recordKey: string;
  kind: Kind | 'withdraw';
  values: Record<string, number> | null;
  verdict: Verdict | null;
  checks: CheckVerdict[] | null;
};

// Where a decision is made: one run, on one proposal row.
export type DecidedOn = { process: string; runId: string; proposalId: number };

const valuesSchema = z.record(z.string(), z.number());

const ofProposal = ({ process, runId, proposalId }: DecidedOn) =>
  and(
    eq(recordDecisions.process, process),
    eq(recordDecisions.runId, runId),
    eq(recordDecisions.proposalId, proposalId),
  );

/*
  Each record's current decision on the proposal in the run: the latest
  event per record (`distinct on`, which `record_decisions_by_proposal`
  serves), a withdrawal leaving none.
*/
export async function currentDecisions(
  on: DecidedOn,
  db?: Database,
): Promise<Record<string, KeptDecision>> {
  db ??= await database();
  const latest = await db
    .selectDistinctOn([recordDecisions.recordKey], {
      recordKey: recordDecisions.recordKey,
      kind: recordDecisions.kind,
      values: recordDecisions.values,
      verdict: recordDecisions.verdict,
      checks: recordDecisions.checks,
      actor: recordDecisions.actor,
      decidedAt: recordDecisions.decidedAt,
    })
    .from(recordDecisions)
    .where(ofProposal(on))
    .orderBy(recordDecisions.recordKey, desc(recordDecisions.id));
  const where = (key: string) =>
    `The decision on ${key} in run ${on.process}/${on.runId}`;
  return Object.fromEntries(
    latest.flatMap((event) =>
      event.kind === 'withdraw'
        ? []
        : [
            [
              event.recordKey,
              {
                // One of the closed set: the table's check holds it.
                kind: event.kind as Kind,
                values:
                  event.values === null
                    ? null
                    : parseStored(
                        event.values,
                        valuesSchema,
                        where(event.recordKey),
                      ),
                verdict: event.verdict as Verdict | null,
                checks:
                  event.checks === null
                    ? null
                    : parseStored(
                        event.checks,
                        checkVerdictsSchema,
                        where(event.recordKey),
                      ),
                actor: event.actor,
                at: event.decidedAt.toISOString(),
              } satisfies KeptDecision,
            ],
          ],
    ),
  );
}

// Whether the run decided anything on an earlier proposal of its key: what
// a write through it says when it has nothing decided on the current one.
export async function decidedOnEarlier(on: DecidedOn): Promise<boolean> {
  const [row] = await (
    await database()
  )
    .select({ id: recordDecisions.id })
    .from(recordDecisions)
    .where(
      and(
        eq(recordDecisions.process, on.process),
        eq(recordDecisions.runId, on.runId),
        ne(recordDecisions.proposalId, on.proposalId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// An event that would say again what is already current says nothing new.
const already = (current: KeptDecision | undefined, event: NewEvent) =>
  event.kind === 'withdraw'
    ? current === undefined
    : current?.kind === event.kind &&
      JSON.stringify(current.values) === JSON.stringify(event.values);

/*
  Appends decisions, and answers every record's current decision after. In
  one transaction under the run key's lock (lockRunKey), so of two requests
  at once one goes first and the other reads what it did:

  - An event the record's current decision already says (the same kind and
    values, or a withdrawal of nothing) is not appended. A decision sent
    twice, a double press or a retry, leaves one event.
  - A decision is refused while a write of the run key is in flight (its
    lease is live): what it writes was read from the decisions when it
    began, and a decision made under it would be one it did not write. The
    write holds the same lock while it claims, and gives up if the decisions
    moved since it read them (applications.ts), so neither can slip past the
    other.
*/
export async function appendDecisions(
  owner: DefinitionProcess,
  key: RunKey,
  on: DecidedOn,
  events: NewEvent[],
  actor: string | null,
): Promise<Record<string, KeptDecision>> {
  const db = await database();
  return db.transaction(async (tx) => {
    await lockRunKey(tx, key);
    const latest = await latestRow(tx, key);
    if (latest?.status === 'pending' && latest.live)
      throw new Refused(stillWriting(owner, recordOf(key, latest)));
    const current = await currentDecisions(on, tx);
    const fresh = events.filter(
      (event) => !already(current[event.recordKey], event),
    );
    if (!fresh.length) return current;
    await tx.insert(recordDecisions).values(
      fresh.map((event) => ({
        process: on.process,
        runId: on.runId,
        proposalId: on.proposalId,
        recordKey: event.recordKey,
        kind: event.kind,
        values: event.values,
        verdict: event.verdict,
        checks: event.checks,
        actor,
      })),
    );
    return currentDecisions(on, tx);
  });
}
