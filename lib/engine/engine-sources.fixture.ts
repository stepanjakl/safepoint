/*
  Engine logic that sits under server/ because it keeps files as it goes
  (decisions, drafts, proposals, writes), or runs as a job's workflow and its
  steps. It is the engine's still: the tests that hold the engine to no
  process and no source kind read these too.
*/
export const KEPT_ENGINE_SOURCES = [
  'server/jobs/draft.ts',
  'server/jobs/proposal.ts',
  'server/operations/decide.ts',
  'server/operations/find.ts',
  'server/operations/write.ts',
  'server/storage/applications.ts',
  'server/storage/cross-checks.ts',
  'server/storage/proposals.ts',
  'server/storage/rulebook-files.ts',
  'server/storage/rulebooks.ts',
  'server/workflows/draft-steps.ts',
  'server/workflows/draft-work.ts',
  'server/workflows/draft.ts',
  'server/workflows/in-step.ts',
  'server/workflows/proposal-steps.ts',
  'server/workflows/proposal-work.ts',
  'server/workflows/proposal.ts',
];
