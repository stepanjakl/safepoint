import 'server-only';

import { valueProblems } from '@/lib/definitions/apply';
import { fingerprintOf, noRules } from '@/lib/definitions/fingerprint';
import { checkProposal } from '@/lib/definitions/propose';
import { asReviewed } from '@/lib/definitions/reviewed';
import type { KeptRead } from '@/lib/definitions/records';
import type {
  DefinitionProcess,
  DefinitionSet,
  Proposal,
} from '@/lib/definitions/types';

import {
  appendDecisions,
  currentDecisions,
  type KeptDecision,
  type Kind,
  type NewEvent,
} from '@/server/storage/decisions';
import { versionByHash } from '@/server/storage/instructions';
import { currentProposalOf } from '@/server/storage/proposals';
import { Refused } from '@/server/storage/refused';
import type { RunKey } from '@/server/storage/run-key';
import type { KeptRun } from '@/server/storage/runs';

import type { RunProcess } from './kept-processes';

/*
  Server-only. A person's decisions on the records of a run's proposal, made
  through the server: checked here as the screens and the write check them,
  then kept as events (server/storage/decisions.ts).
*/

// What a decision is refused with when it was made on an earlier proposal,
// in the words the write uses (server/api/routers/apply.ts).
export const EARLIER_PROPOSAL =
  'These decisions were made on an earlier proposal. Decide on the current one.';

/*
  The run key a kept run's proposal and write are kept under, or null while
  it has none: before it has read its data, or, for a process with a
  rulebook, before it pinned one. A process with no rulebook proposes under
  the empty rulebook of its instructions (noRules).
*/
export async function runKeyOfKept(
  kept: RunProcess,
  run: KeptRun,
): Promise<RunKey | null> {
  if (!run.readId) return null;
  const process = kept.runs.definitions.id;
  if (kept.runs.evaluation === 'rules')
    return run.rulebook
      ? { process, readId: run.readId, fingerprint: run.rulebook }
      : null;
  const version = await versionByHash(kept, run.instructions.hash);
  if (!version) throw new Error('This run’s instructions are not kept.');
  return {
    process,
    readId: run.readId,
    fingerprint: fingerprintOf(noRules(version.text)),
  };
}

export type CurrentDecisions = {
  kind: 'decisions';
  // The proposal they are on: the current one for the run's key.
  proposal: { id: number; at: string } | null;
  // In the proposal's own record order.
  decisions: Record<string, KeptDecision>;
};

const inRecordOrder = (
  proposal: Proposal,
  decisions: Record<string, KeptDecision>,
) =>
  Object.fromEntries(
    Object.keys(proposal.records).flatMap((key) =>
      decisions[key] ? [[key, decisions[key]]] : [],
    ),
  );

// A kept run's current decisions on its current proposal; none while it
// has no proposal.
export async function decisionsOfRun(
  kept: RunProcess,
  run: KeptRun,
): Promise<CurrentDecisions> {
  const key = await runKeyOfKept(kept, run);
  const current = key && (await currentProposalOf(key));
  if (!current) return { kind: 'decisions', proposal: null, decisions: {} };
  return {
    kind: 'decisions',
    proposal: { id: current.id, at: current.proposal.at },
    decisions: inRecordOrder(
      current.proposal,
      await currentDecisions({
        process: run.process,
        runId: run.id,
        proposalId: current.id,
      }),
    ),
  };
}

export type Asked = {
  key: string;
  kind: Kind | 'withdraw';
  values?: Record<string, number> | undefined;
};

// What a run is decided under, as a run procedure opens it.
type Opened = {
  owner: DefinitionProcess;
  set: DefinitionSet;
  read: KeptRead;
};

/*
  The event a decision is kept as, with what the person was shown, worked
  out here rather than taken from the browser: the record's verdict and
  checks as the proposal has them (as a person reviews it, asReviewed), or,
  for a change, the checks on the values set now. Refused as the screens
  refuse it: a record not in the proposal; an approval of a blocked record;
  a change to values that are not whole numbers at or above each field's
  least (valueProblems, the rule the write applies) or that a blocking
  check stops.
*/
function eventOf(
  { owner, set, read }: Opened,
  evaluation: 'rules' | 'model',
  proposal: Proposal,
  asked: Asked,
): NewEvent {
  const found = proposal.records[asked.key];
  if (!found)
    throw new Refused(`${asked.key} is not in this proposal.`, 'BAD_REQUEST');
  if (asked.kind !== 'change' && asked.values !== undefined)
    throw new Refused(
      `Only a change sets values; ${asked.key} was given some.`,
      'BAD_REQUEST',
    );
  const record = asReviewed(found, evaluation);
  const blocking = (checks: typeof record.checks) =>
    checks
      .filter((check) => !check.holds && check.consequence === 'block')
      .map((check) => check.name)
      .join(', ');
  switch (asked.kind) {
    case 'withdraw':
      return {
        recordKey: asked.key,
        kind: 'withdraw',
        values: null,
        verdict: null,
        checks: null,
      };
    // An approval or a rejection is kept with how the proposal stood.
    case 'approve':
    case 'reject':
      if (asked.kind === 'approve' && record.verdict === 'blocked')
        throw new Refused(
          `${asked.key} cannot be approved: ${blocking(record.checks)} fails. Change it to values that pass, or reject it.`,
        );
      return {
        recordKey: asked.key,
        kind: asked.kind,
        values: null,
        verdict: record.verdict,
        checks: record.checks,
      };
    case 'change': {
      const values = asked.values;
      if (!values)
        throw new Refused(
          `A change to ${asked.key} needs its values.`,
          'BAD_REQUEST',
        );
      const fields = owner.subject.proposal.map((field) => field.id);
      const extra = Object.keys(values).filter((id) => !fields.includes(id));
      if (extra.length)
        throw new Refused(
          `${asked.key} cannot set ${extra.join(', ')}: this proposal sets ${fields.join(', ')}.`,
          'BAD_REQUEST',
        );
      const problems = valueProblems(owner.subject, asked.key, values);
      if (problems.length) throw new Refused(problems.join(' '), 'BAD_REQUEST');
      const checked = checkProposal(owner, set, read, asked.key, values);
      if (checked.verdict === 'blocked')
        throw new Refused(
          `${asked.key} cannot be changed to these values: ${blocking(checked.checks)} fails.`,
        );
      // Ordered as the process lists its fields, as the screen sends them.
      const ordered = Object.fromEntries(fields.map((id) => [id, values[id]!]));
      return {
        recordKey: asked.key,
        kind: 'change',
        values: ordered,
        verdict: checked.verdict,
        checks: checked.checks,
      };
    }
  }
}

/*
  Records decisions on a kept run's current proposal, which the person names
  by its time (`proposedAt`, the proposal's own `at`), as the write names
  the one it was decided on: a decision made on an earlier one is refused in
  the write's words. Every one is checked before any is kept, so several at
  once (approving every ready record) are kept all or none.
*/
export async function decide(
  opened: Opened,
  kept: RunProcess,
  run: KeptRun,
  proposedAt: string,
  asked: Asked[],
  actor: string | null,
): Promise<CurrentDecisions> {
  const key = await runKeyOfKept(kept, run);
  const current = key && (await currentProposalOf(key));
  if (!key || !current) throw new Refused('This run has no proposal kept.');
  if (current.proposal.at !== proposedAt) throw new Refused(EARLIER_PROPOSAL);
  const keys = asked.map((one) => one.key);
  const twice = keys.filter((one, at) => keys.indexOf(one) !== at);
  if (twice.length)
    throw new Refused(
      `Each record is decided once at a time: ${[...new Set(twice)].join(', ')} twice.`,
      'BAD_REQUEST',
    );
  const events = asked.map((one) =>
    eventOf(opened, kept.runs.evaluation, current.proposal, one),
  );
  const decisions = await appendDecisions(
    opened.owner,
    key,
    { process: run.process, runId: run.id, proposalId: current.id },
    events,
    actor,
  );
  return {
    kind: 'decisions',
    proposal: { id: current.id, at: current.proposal.at },
    decisions: inRecordOrder(current.proposal, decisions),
  };
}
