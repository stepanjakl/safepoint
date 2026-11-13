import type { StaleReply } from '@/components/brunch-orders/stale-rules';
import type {
  CheckVerdict,
  DraftProgress,
  Proposal,
  Verdict,
} from '@/lib/definitions/types';
import type { DefinitionSubject } from '@/lib/process/model';

export type Calculated = {
  calculations: { id: string; name: string }[];
  rows: Record<string, Record<string, number | null>>;
};

export type ProposeResponse =
  | {
      kind: 'proposal';
      fingerprint: string;
      names: Record<string, string>;
      calculated: Calculated;
      proposal: Proposal | null;
      progress: DraftProgress | null;
    }
  | {
      kind: 'check';
      verdict: Verdict;
      checks: CheckVerdict[];
    }
  | StaleReply
  | { kind: 'error'; message: string };

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
