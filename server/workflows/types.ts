import 'server-only';

import type { DraftingModel } from '@/lib/models';
import type { JobKey } from '@/server/jobs/run-job';

/*
  What a job's workflow and its steps are handed: the job's key, the claim
  that started it (server/jobs/run-job.ts), and the ids of what it works on,
  never what they name, which each step reads where it is kept. Types only,
  so the workflows (which run in a sandbox) can name them.
*/

export type JobRun = { job: JobKey; holder: string };

// What a step's work came to: its result, or what stopped it.
export type Outcome<T> = { done: T } | { stopped: string };

export type DraftRun = JobRun & {
  readId: string;
  model: DraftingModel | null;
};

export type DraftFind = DraftRun & {
  version: string;
  // When the draft was started, by the clock a find is dated by.
  since: number;
};

// A definition being written again, and what it was when the job began.
export type Rewrite = DraftRun & { found: Found; before: string };

export type Found = { id: string; name: string };

export type ProposalRun = JobRun & {
  // The instructions, by their hash; the rules, by their fingerprint, or
  // none when the model proposes from the instructions alone.
  instructions: string;
  readId: string;
  fingerprint: string;
  rules: boolean;
  model: DraftingModel | null;
};
