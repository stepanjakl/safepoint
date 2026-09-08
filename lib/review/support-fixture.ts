import { reviewDetailSchema } from './contracts';
import { releasePlanSchema, type Disposition } from './plan-contract';

// A contrasting, synthetic presentation fixture with no SKU, currency, margin
// or grocery assumptions. Checks are recorded, not run.
const revision = 'support-handoff-v1';

const reasons = [
  { key: 'identity_missing', label: 'Identity verification is missing' },
  { key: 'customer_facing', label: 'A customer-facing reply needs review' },
  { key: 'above_agent_limit', label: 'Refund is above the agent limit' },
  { key: 'within_policy', label: 'Internal reassignment is within policy' },
];

type Case = {
  id: string;
  title: string;
  subtitle: string;
  disposition: Disposition;
  outcome: string;
  reasonKey: string;
  requiresApproval?: boolean;
  deltas: unknown[];
};

const cases: Case[] = [
  {
    id: 'CASE-105',
    title: 'Account access',
    subtitle: 'Customer support · Identity',
    disposition: 'blocked',
    outcome: 'Held',
    reasonKey: 'identity_missing',
    deltas: [
      {
        label: 'Assigned team',
        kind: 'categorical',
        before: 'Identity',
        after: 'General support',
      },
    ],
  },
  {
    id: 'CASE-104',
    title: 'Missing parcel',
    subtitle: 'Customer support · Delivery',
    disposition: 'needs_decision',
    outcome: 'Individual review',
    reasonKey: 'customer_facing',
    deltas: [
      {
        label: 'Assigned team',
        kind: 'categorical',
        before: 'General support',
        after: 'Delivery specialists',
      },
      {
        label: 'Customer reply',
        kind: 'create',
        after: 'draft-reply-104',
      },
    ],
  },
  {
    id: 'CASE-107',
    title: 'Duplicate charge',
    subtitle: 'Customer support · Billing',
    disposition: 'deferred',
    outcome: 'Awaiting approval',
    reasonKey: 'above_agent_limit',
    requiresApproval: true,
    deltas: [
      {
        label: 'Refund',
        kind: 'scalar',
        before: 0,
        after: 4250,
        display: { prefix: '£', scale: 100, precision: 2 },
      },
      {
        label: 'Stored card',
        kind: 'destroy',
        before: 'card-9931',
      },
      // An unrecognised kind on purpose: the fallback keeps the card legible
      // the first time the engine emits a shape nobody anticipated.
      {
        label: 'Entitlement matrix',
        kind: 'sla_matrix',
        rows: [['priority', 'gold']],
      },
    ],
  },
  {
    id: 'CASE-106',
    title: 'Invoice copy',
    subtitle: 'Customer support · Billing',
    disposition: 'will_apply',
    outcome: 'Will apply',
    reasonKey: 'within_policy',
    deltas: [
      {
        label: 'Assigned team',
        kind: 'categorical',
        before: 'General support',
        after: 'Billing',
      },
      {
        label: 'Case tags',
        kind: 'set',
        added: ['billing', 'invoice-copy'],
        removed: ['triage'],
      },
    ],
  },
];

const reasonLabels = new Map(
  reasons.map((reason) => [reason.key, reason.label]),
);

export const supportPlan = releasePlanSchema.parse({
  id: 'support-handoff',
  revision,
  title: 'Morning support handoff',
  source: 'Support handoff · replay',
  context: 'Synthetic support queue · Europe/London',
  evaluatedAt: 'Mon 7 Sep 09:00',
  mode: 'replay',
  noun: { one: 'case', other: 'cases' },
  reviewLabel: 'Review handoff',
  reasons,
  effects: cases.map((item) => ({
    id: item.id,
    subject: item.title,
    subtitle: item.subtitle,
    deltas: item.deltas,
    reasonKey: item.reasonKey,
    findingIds: [`${item.id}-policy`],
    evidenceIds: [`${item.id}-source`],
    disposition: item.disposition,
    ...(item.requiresApproval ? { requiresApproval: true } : {}),
  })),
  status: { kind: 'preview' },
});

export const supportDetails = cases.map((item, index) => {
  const blocked = item.disposition === 'blocked';
  const attention = item.disposition === 'needs_decision';
  const deferred = item.disposition === 'deferred';
  const reason = reasonLabels.get(item.reasonKey) ?? item.reasonKey;
  return reviewDetailSchema.parse({
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    disposition: item.disposition,
    outcome: item.outcome,
    reason,
    revision,
    conclusion: blocked
      ? 'Keep this case with the identity team'
      : attention
        ? 'Review the reply before handoff'
        : deferred
          ? 'Hold for a billing approver'
          : 'Ready for your review',
    explanation: blocked
      ? 'The required identity-verification record is unavailable. The proposed move to general support cannot proceed.'
      : attention
        ? 'The reassignment is allowed, but the proposed customer reply requires individual review.'
        : deferred
          ? 'The refund is above the amount this agent may issue, so it is held back for a billing approver.'
          : 'The recorded policy permits reassignment to billing. No customer-facing message is proposed.',
    nextAction: blocked
      ? 'Obtain a verified identity record, then evaluate the handoff again.'
      : attention
        ? 'Check the reply and the receiving team before approving the handoff.'
        : deferred
          ? 'Send this case to a billing approver.'
          : 'Review the receiving team and include this case in the approved scope.',
    deltas: supportPlan.effects[index]!.deltas,
    facts: [
      {
        label: 'Customer verification',
        value: blocked ? 'Evidence unavailable' : 'Verified in source record',
        note: 'Recorded synthetic fixture fact',
      },
    ],
    findings: [
      {
        id: `${item.id}-policy`,
        title: reason,
        explanation: blocked
          ? 'A required identity record is missing; hold the reassignment.'
          : attention
            ? 'Customer-facing messages require individual review.'
            : deferred
              ? 'Refunds above the agent limit require a second person.'
              : 'Internal routing is allowed for a verified customer.',
        evidenceIds: [`${item.id}-source`],
      },
    ],
    checks: [
      {
        id: 'identity',
        label: 'Customer identity',
        result: blocked ? 'evidence_unavailable' : 'passed',
        resultLabel: blocked ? 'Evidence unavailable' : 'Passed',
        obligation: 'Required',
        explanation: blocked
          ? 'No verification record was included.'
          : 'The source records a completed identity check.',
        evidenceIds: [`${item.id}-source`],
      },
    ],
    checkSummary: blocked ? '1 evidence unavailable' : '1 passed',
    agent: {
      recommendation: deferred ? 'Refund' : 'Reassign',
      rationale: 'Route the case to the team proposed in the handoff.',
      uncertainties: blocked ? ['Identity evidence was not available.'] : [],
    },
    sources: [
      {
        id: `${item.id}-source`,
        label: 'Synthetic support queue',
        observedAt: 'Mon 7 Sep 09:00',
        facts: [
          `Case: ${item.id}`,
          blocked
            ? 'Identity verification record: unavailable'
            : 'Identity verification record: complete',
          'No assignment or message has been applied.',
        ],
      },
    ],
    narrative: null,
    effects: [
      {
        id: 'reassign',
        destination: 'Support queue',
        mode: 'simulated',
        modeLabel: 'Simulated',
        recovery: 'Simulation only; no external case is changed.',
      },
      ...(attention
        ? [
            {
              id: 'reply',
              destination: 'Customer reply',
              mode: 'preview_only',
              modeLabel: 'Preview only',
              recovery: 'The draft is never sent in this example.',
            },
          ]
        : []),
    ],
  });
});
