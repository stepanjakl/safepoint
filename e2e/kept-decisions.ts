import type { Page } from '@playwright/test';

import type { CheckVerdict, Proposal, Verdict } from '@/lib/engine/types';
import type { KeptDecision } from '@/server/storage/decisions';

import { mockProcedure } from './trpc';

/*
  The decisions procedures for a browser test that serves a proposal itself:
  a small stand-in that answers as the server does. It keeps each record's
  current decision, answers in the proposal's record order, refuses what the
  server refuses (a decision on an earlier proposal, an approval of a blocked
  record, a change to values a blocking check stops) in its words, and takes
  a withdrawal as none. Every answer is the whole of what is decided, which is
  what the screen writes into its query.
*/
type Checked = { verdict: Verdict; checks: CheckVerdict[] };
type Decisions = Record<string, KeptDecision>;
type Refusal = { error: { code: 'CONFLICT'; message: string } };

const EARLIER_PROPOSAL =
  'These decisions were made on an earlier proposal. Decide on the current one.';

export async function mockDecisions(
  page: Page,
  proposal: Proposal,
  // How the checks find values a person is changing a record to.
  check: (key: string, values: Record<string, number>) => Checked | undefined,
) {
  const kept: Decisions = {};
  let refusing: string | null = null;
  let holding: Promise<void> | null = null;
  let at = 0;
  const answer = () => ({
    data: {
      kind: 'decisions' as const,
      proposal: { id: 1, at: proposal.at },
      decisions: Object.fromEntries(
        Object.keys(proposal.records).flatMap((key) =>
          kept[key] ? [[key, kept[key]]] : [],
        ),
      ),
    },
  });
  const refuse = (message: string): Refusal => ({
    error: { code: 'CONFLICT', message },
  });

  type Asked =
    | { key: string; kind: 'approve' | 'reject' }
    | { key: string; kind: 'change'; values: Record<string, number> };
  // Every one is checked before any is kept, as the server does.
  const decide = (
    proposedAt: string,
    asked: ({ key: string; kind: 'withdraw' } | Asked)[],
  ) => {
    if (refusing) return refuse(refusing);
    if (proposedAt !== proposal.at) return refuse(EARLIER_PROPOSAL);
    const events: [string, KeptDecision | null][] = [];
    for (const one of asked) {
      const record = proposal.records[one.key];
      if (!record) return refuse(`${one.key} is not in this proposal.`);
      if (one.kind === 'withdraw') {
        events.push([one.key, null]);
        continue;
      }
      const base = {
        actor: null,
        at: new Date(Date.now() + at++).toISOString(),
      };
      if (one.kind === 'change') {
        const checked = check(one.key, one.values);
        if (!checked || checked.verdict === 'blocked')
          return refuse(
            `${one.key} cannot be changed to these values: a check fails.`,
          );
        events.push([
          one.key,
          { ...base, kind: 'change', values: one.values, ...checked },
        ]);
      } else if (one.kind === 'approve' && record.verdict === 'blocked') {
        return refuse(
          `${one.key} cannot be approved: a check fails. Change it to values that pass, or reject it.`,
        );
      } else
        events.push([
          one.key,
          {
            ...base,
            kind: one.kind,
            values: null,
            verdict: record.verdict,
            checks: record.checks,
          },
        ]);
    }
    for (const [key, decision] of events)
      if (decision) kept[key] = decision;
      else delete kept[key];
    return answer();
  };

  const requests: { path: string; input: unknown }[] = [];
  await mockProcedure(page, 'decisions.current', () => answer());
  await mockProcedure(page, 'decisions.record', async (input) => {
    requests.push({ path: 'record', input });
    await holding;
    return decide(input.proposedAt, [input.decision]);
  });
  await mockProcedure(page, 'decisions.recordMany', async (input) => {
    requests.push({ path: 'recordMany', input });
    await holding;
    return decide(input.proposedAt, input.decisions);
  });
  await mockProcedure(page, 'decisions.withdraw', async (input) => {
    requests.push({ path: 'withdraw', input });
    await holding;
    return decide(input.proposedAt, [{ key: input.key, kind: 'withdraw' }]);
  });

  return {
    // What the server would hold now.
    kept,
    requests,
    // Answers nothing until the returned function is called: a slow server.
    hold: () => {
      let release = () => {};
      holding = new Promise<void>((resolve) => (release = resolve));
      return release;
    },
    // Refuses every decision from now on, in these words; null stops it.
    refuseWith: (message: string | null) => {
      refusing = message;
    },
  };
}
