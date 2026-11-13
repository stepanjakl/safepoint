import type { inferRouterOutputs } from '@trpc/server';

import type { CheckVerdict, Verdict } from '@/lib/definitions/types';
import type { DefinitionSubject } from '@/lib/process/model';
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

// A person's decision on one record, kept with the run in this browser.
export type Decision = {
  kind: 'approve' | 'change' | 'reject';
  // A change's own values, and how the checks found them when it was saved.
  values?: Record<string, number>;
  verdict?: Verdict;
  checks?: CheckVerdict[];
  at: string;
};

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
