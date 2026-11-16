import type { ProposalRecord } from './types';

/*
  How a record stands for the person reviewing it. With no rulebook to check
  it (evaluation `model`), a record the model is unsure of asks for a person,
  since no check can. The verdict a decision on it is kept with. Its own file,
  so the screen and the server (server/operations/record-decisions.ts) read
  one rule without the screen loading the engine's model calls.
*/
export const asReviewed = (
  record: ProposalRecord,
  evaluation: 'rules' | 'model',
): ProposalRecord =>
  evaluation === 'model' &&
  record.unsure &&
  record.verdict !== 'decide' &&
  record.verdict !== 'blocked'
    ? { ...record, verdict: 'decide' }
    : record;
