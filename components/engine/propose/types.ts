import type { inferRouterOutputs } from '@trpc/server';

import type { CheckVerdict, Verdict } from '@/lib/engine/types';
import type { DefinitionSubject } from '@/lib/shell/model';
import type { AppRouter } from '@/server/api/root';

export type Calculated = {
  calculations: { id: string; name: string }[];
  rows: Record<string, Record<string, number | null>>;
};

// What the procedures answer: the proposal kept and its job (`get`, and
// `start` as it begins), and the checks on values being changed (`check`),
// each or `stale` where the rulebook no longer fits the read.
type Replies = inferRouterOutputs<AppRouter>['propose'];
export type ProposalReply = Replies['get'];
export type CheckReply = Replies['check'];

// A person's decision on one record, as the server keeps it. One just made and
// not yet answered carries what the row knew (a change's checks) and none of
// what only the server works out (who, the record's verdict).
export type Decision = {
  kind: 'approve' | 'change' | 'reject';
  // A change's own values; null for an approval or a rejection.
  values: Record<string, number> | null;
  // How the checks found it when it was decided.
  verdict: Verdict | null;
  checks: CheckVerdict[] | null;
  actor: string | null;
  at: string;
};

// What the decisions procedures answer: the current decisions on the proposal
// they are on, or `stale` where the rulebook no longer fits the read.
type Decisions = inferRouterOutputs<AppRouter>['decisions'];
export type DecisionsReply = Decisions['current'];
export type DecidedReply = Decisions['record'];

// How far Propose has got, for the step's mark, and the decisions themselves.
export type ProposeProgress = {
  fingerprint: string;
  proposedAt: string | null;
  running: boolean;
  total: number;
  needYou: number;
  // Decided records that would write values: what Apply has to show.
  writes: number;
  decisions: Record<string, Decision>;
};

// What a proposal sets for each record, as the process declares it.
export type ProposalField = DefinitionSubject['proposal'][number];

export type Evaluation = 'rules' | 'model';
