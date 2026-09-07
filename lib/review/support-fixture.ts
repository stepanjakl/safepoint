import { reviewBatchSchema, reviewDetailSchema } from './contracts';

// A contrasting, synthetic presentation fixture. Checks are recorded, not run.
const revision = 'support-handoff-v1';
const summaries = [
  {
    id: 'CASE-104',
    title: 'Missing parcel',
    subtitle: 'Customer support · Delivery',
    group: 'attention',
    outcome: 'Individual review',
    reason: 'A customer-facing reply needs review',
  },
  {
    id: 'CASE-105',
    title: 'Account access',
    subtitle: 'Customer support · Identity',
    group: 'blocked',
    outcome: 'Held',
    reason: 'Identity verification is missing',
  },
  {
    id: 'CASE-106',
    title: 'Invoice copy',
    subtitle: 'Customer support · Billing',
    group: 'ready',
    outcome: 'Ready',
    reason: 'Internal reassignment is within policy',
  },
];

export const supportBatch = reviewBatchSchema.parse({
  id: 'support-handoff',
  revision,
  title: 'Morning support handoff',
  processLabel: 'Support handoff',
  mode: 'replay',
  evaluatedAt: 'Mon 7 Sep 09:00',
  context: 'Synthetic support queue · Europe/London',
  reviewLabel: 'Review handoff',
  initialItemId: 'CASE-105',
  items: summaries,
});

export const supportDetails = supportBatch.items.map((item) => {
  const blocked = item.group === 'blocked';
  const attention = item.group === 'attention';
  return reviewDetailSchema.parse({
    ...item,
    revision,
    conclusion: blocked
      ? 'Keep this case with the identity team'
      : attention
        ? 'Review the reply before handoff'
        : 'Ready for your review',
    explanation: blocked
      ? 'The required identity-verification record is unavailable. The proposed move to general support cannot proceed.'
      : attention
        ? 'The reassignment is allowed, but the proposed customer reply requires individual review.'
        : 'The recorded policy permits reassignment to billing. No customer-facing message is proposed.',
    nextAction: blocked
      ? 'Obtain a verified identity record, then evaluate the handoff again.'
      : attention
        ? 'Check the reply and the receiving team before approving the handoff.'
        : 'Review the receiving team and include this case in the approved scope.',
    changes: [
      {
        label: 'Assigned team',
        before: blocked ? 'Identity' : 'General support',
        after: blocked
          ? 'General support'
          : attention
            ? 'Delivery specialists'
            : 'Billing',
        note: 'Proposed reassignment; no case has moved.',
      },
      ...(attention
        ? [
            {
              label: 'Customer reply',
              before: null,
              after:
                'Our delivery team is checking the missing parcel and will follow up with an update.',
              note: 'Draft message · preview only',
            },
          ]
        : []),
    ],
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
        title: item.reason,
        explanation: blocked
          ? 'A required identity record is missing; hold the reassignment.'
          : attention
            ? 'Customer-facing messages require individual review.'
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
      recommendation: 'Reassign',
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
