import { fingerprintOf, hashOf, noRules } from '@/lib/definitions/fingerprint';
import type {
  CheckVerdict,
  DefinitionSet,
  Proposal,
  ProposalRecord,
} from '@/lib/definitions/types';
import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  BRUNCH_ORDERS_DIRECT_DEFINITIONS as direct,
  brunchOrdersDirectProcess,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import type { Database } from '@/server/db/client';
import { keepProposal } from '@/server/storage/proposals';
import { keepStandInRead } from '@/server/storage/reads.fixture';
import { putRevision } from '@/server/storage/rulebooks';

import { accepted, caller, keepAsCurrent } from './run.fixture';

/*
  What the tests of kept runs share: a run started through the procedures,
  on a read kept as a stand-in, with a proposal kept for it. The rulebook
  process calculates on the accepted rulebook the browser tests serve, kept
  as current for its declared instructions; the direct one proposes under no
  rules. A test file mocks keptRead itself (vi.mock is per file).
*/

// The declared current instructions of each: the ones a run can write under.
export const PUBLISHED = brunchOrdersProcess.instructions.text;
export const DIRECT = brunchOrdersDirectProcess.instructions.text;

export const AT = '2026-10-29T09:00:00.000Z';
export const LATER = '2026-10-29T10:00:00.000Z';

const blockedCheck: CheckVerdict = {
  id: 'whole_cases',
  name: 'Whole cases',
  consequence: 'block',
  holds: false,
  steps: ['7 is not a multiple of 6'],
  error: null,
};

// One record of a proposal, ready unless said otherwise.
export const record = (
  order: number,
  {
    verdict = 'ready',
    unsure = null,
  }: { verdict?: ProposalRecord['verdict']; unsure?: string | null } = {},
): ProposalRecord => ({
  action: 'set',
  values: { order },
  reason: 'Worked out.',
  cited: [],
  unsure,
  verdict,
  checks: verdict === 'blocked' ? [blockedCheck] : [],
});

// The records a rulebook run's proposal holds: two ready, one blocked.
const RECORDS = {
  'EG-06': record(12),
  'CT-250': record(10),
  'SD-01': record(7, { verdict: 'blocked' }),
};

export const rulesSet: DefinitionSet = { ...accepted, hash: hashOf(PUBLISHED) };
export const rulesFingerprint = fingerprintOf(rulesSet);
const directFingerprint = fingerprintOf(noRules(DIRECT));

// Keeps the rulebook as current, the read as a stand-in, and a proposal on
// them made at `at`.
export async function keepRulesProposal(
  db: Database,
  readId: string,
  {
    at = AT,
    records = RECORDS,
  }: { at?: string; records?: Proposal['records'] } = {},
) {
  await keepAsCurrent(rulesSet);
  await keepStandInRead(db, readId);
  const proposal: Proposal = {
    fingerprint: rulesFingerprint,
    readId,
    model: 'test',
    at,
    records,
  };
  await keepProposal(owner, proposal);
  return proposal;
}

export async function keepDirectProposal(
  db: Database,
  readId: string,
  records: Proposal['records'],
  at = AT,
) {
  await keepStandInRead(db, readId);
  const proposal: Proposal = {
    fingerprint: directFingerprint,
    readId,
    model: 'test',
    at,
    records,
  };
  await keepProposal(direct, proposal);
  return proposal;
}

// A run pins a kept revision, as Calculate keeps the one it used.
export const keepRulesRevision = () =>
  putRevision(owner, rulesSet, { reason: 'used' });

// A run started and moved on to its read and, for the rulebook process, its
// pinned rulebook, through the procedures as the screens will.
export async function startedRun(
  process: 'brunch-orders' | 'brunch-orders-direct',
  readId: string,
) {
  const text = process === 'brunch-orders' ? PUBLISHED : DIRECT;
  const run = await caller().runs.start({
    process,
    instructions: hashOf(text),
  });
  if (process === 'brunch-orders') await keepRulesRevision();
  await caller().runs.record({
    process,
    runId: run.id,
    readId,
    ...(process === 'brunch-orders' ? { rulebook: rulesFingerprint } : {}),
  });
  return { process, runId: run.id };
}
