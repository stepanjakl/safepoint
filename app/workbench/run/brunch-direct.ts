import { readFileSync } from 'node:fs';

import type { ModelRunView } from '@/components/app-shell/thread/model-run-thread';
import type { Decision } from '@/components/brunch-orders/propose-step';
import { blockFor, writesOf } from '@/lib/definitions/apply';
import { capturedTabs } from '@/lib/definitions/captured.fixture';
import type { Proposal, ProposalActivity } from '@/lib/definitions/types';
import {
  MODEL_RUN_MAIN_LINE,
  type ModelRunFacts,
  type ModelRunStage,
} from '@/lib/process/model-run';
import {
  BRUNCH_ORDERS_DIRECT_DEFINITIONS as owner,
  brunchOrdersDirectProcess,
} from '@/lib/processes/brunch-orders/process';

/*
  Development only: a Brunch orders run with no rulebook at every stage, from
  the frozen fixtures the browser tests use -- the captured sheet and a kept
  proposal -- so each stage can be designed without a model or the sheet.
  The proposal's checks are dropped: with no rulebook there are none, and a
  record the model is unsure of is one a person decides. What the model did
  while proposing is written here to look like what the engine reports.
*/

const frozen = JSON.parse(
  readFileSync('e2e/fixtures/brunch-orders-proposal.json', 'utf8'),
) as { names: Record<string, string>; proposal: Proposal };

const proposal: Proposal = {
  ...frozen.proposal,
  records: Object.fromEntries(
    Object.entries(frozen.proposal.records).map(([key, record]) => [
      key,
      {
        ...record,
        checks: [],
        verdict: record.unsure ? ('decide' as const) : ('unchecked' as const),
      },
    ]),
  ),
};
const keys = Object.keys(proposal.records);
const AT = '2026-11-06T11:49:00.000Z';
const at = (seconds: number) =>
  new Date(Date.parse(AT) + seconds * 1000).toISOString();

// Part way through the review: the first few approved.
const someDecided: Record<string, Decision> = Object.fromEntries(
  keys.slice(0, 4).map((key) => [key, { kind: 'approve', at: AT }]),
);
// Everything decided, one of each kind, so the approval shows all three.
const allDecided: Record<string, Decision> = Object.fromEntries(
  keys.map((key, index) => [
    key,
    index === 1
      ? {
          kind: 'change',
          values: {
            order: Math.max(0, (proposal.records[key]?.values?.order ?? 0) - 2),
          },
          at: AT,
        }
      : index === 5
        ? { kind: 'reject', at: AT }
        : { kind: 'approve', at: AT },
  ]),
);

const tabs = capturedTabs();
const read = {
  id: 'workbench',
  readAt: AT,
  source: 'Google Sheets · Brunch store (workbench copy)',
  title: 'Brunch store',
  url: 'https://docs.google.com/spreadsheets/d/workbench',
  tabs: tabs.map((tab) => ({ name: tab.name, rows: tab.values.length })),
};
const needYou = Object.values(proposal.records).filter(
  (record) => record.verdict === 'decide' || record.verdict === 'blocked',
).length;
const writes = writesOf(proposal, allDecided);
// Last weekend's orders, as the Orders tab holds them before this run writes.
const lastWeekend = [
  ['sku', 'order'],
  ...keys.map((key, index) => [key, index % 3 === 0 ? '' : 8 + index * 4]),
];
const changes = blockFor(lastWeekend, owner, writes).changes;

/*
  What the engine reported while the model worked, recorded from one real
  proposal (brunch-activity.json): each moment it changed, at the time it did,
  with its clock moved to this run's. Nothing here is written by hand.
*/
const recorded = JSON.parse(
  readFileSync('app/workbench/run/brunch-activity.json', 'utf8'),
) as { frames: { t: number; running: boolean; activity: ProposalActivity }[] };
const recordedFrom =
  Date.parse(
    recorded.frames.flatMap((frame) => frame.activity.events)[0]?.at ?? AT,
  ) - (recorded.frames.find((frame) => frame.activity.events.length)?.t ?? 0);
const moved = (when: string) =>
  at(4 + (Date.parse(when) - recordedFrom) / 1000);
const rebased = (activity: ProposalActivity): ProposalActivity => ({
  ...activity,
  events: activity.events.map((event) => ({ ...event, at: moved(event.at) })),
  stream: activity.stream?.map((kept) => ({ ...kept, at: moved(kept.at) })),
});
const PROPOSING = recorded.frames
  .filter((frame) => frame.running)
  .map((frame) => ({ t: frame.t, activity: rebased(frame.activity) }));
const ANSWERED_ACTIVITY = rebased(recorded.frames.at(-1)!.activity);

const facts = (
  decisions: Record<string, Decision>,
  more: Partial<ModelRunFacts> = {},
): ModelRunFacts => ({
  requestLabel: 'Fri 6 Nov · 11:49',
  trigger: 'manual',
  subject: {
    one: owner.subject.record.singular,
    other: owner.subject.record.plural,
    field: owner.subject.proposal[0]?.label ?? 'value',
  },
  sources: 1,
  tabs: tabs.length,
  unfit: [],
  records: keys.length,
  needYou,
  decided: Object.keys(decisions).length,
  // Every cell written, in both outputs below.
  writes: changes.length * 2,
  output: owner.subject.data.output?.tab ?? 'the sheet',
  stopped: null,
  mismatch: null,
  ...more,
});

const DECIDED: ModelRunStage[] = [
  'ready_to_commit',
  'committing',
  'committed',
  'intervention',
];

function viewAt(
  stage: ModelRunStage,
  more: Partial<ModelRunFacts> = {},
  proposing: ProposalActivity = PROPOSING.at(-1)!.activity,
): ModelRunView {
  const decisions = DECIDED.includes(stage)
    ? allDecided
    : stage === 'reviewing'
      ? someDecided
      : {};
  const hasRead = stage !== 'starting' && stage !== 'reading';
  const proposed = hasRead && stage !== 'evaluating' && stage !== 'stopped';
  return {
    stage,
    facts: facts(decisions, more),
    fields: owner.subject.proposal,
    instructions: brunchOrdersDirectProcess.instructions,
    sourceKind: 'google-sheets',
    read: hasRead ? read : null,
    data: tabs,
    activity:
      stage === 'evaluating' || stage === 'stopped'
        ? proposing
        : proposed
          ? ANSWERED_ACTIVITY
          : null,
    review: proposed ? { proposal, names: frozen.names, decisions } : null,
    write: DECIDED.includes(stage)
      ? {
          outputs: [
            {
              id: 'orders',
              kind: 'google-sheets',
              title: read.title,
              key: owner.subject.data.output?.key ?? 'Record',
              url: read.url,
              resourceIds: { Orders: 0, 'Standing orders': 1834920517 },
              changes,
            },
            // A second source whose changes span two tabs, to design for
            // a run that writes to more than one place.
            {
              id: 'orders-copy',
              kind: 'google-sheets',
              title: 'Brunch store · supplier copy',
              key: owner.subject.data.output?.key ?? 'Record',
              url: read.url,
              resourceIds: { Orders: 0, 'Standing orders': 1834920517 },
              changes: changes.map((change, index) =>
                index % 2
                  ? {
                      ...change,
                      cell: change.cell.replace(/^[^!]*!/, 'Standing orders!'),
                    }
                  : change,
              ),
            },
          ],
          problems: [],
          writtenAt: stage === 'committed' ? at(372) : null,
        }
      : null,
  };
}

export type ScriptedStage = {
  key: string;
  label: string;
  view: ModelRunView;
  // Moments within the stage, each from `t` ms after the stage began.
  frames?: { t: number; view: ModelRunView }[];
};

export function brunchDirectScript(): {
  mainLine: ScriptedStage[];
  branches: ScriptedStage[];
} {
  return {
    mainLine: MODEL_RUN_MAIN_LINE.map((stage) => ({
      key: stage,
      label: stage,
      view: viewAt(stage),
      frames:
        stage === 'evaluating'
          ? PROPOSING.map((frame) => ({
              t: frame.t,
              view: viewAt(stage, {}, frame.activity),
            }))
          : undefined,
    })),
    branches: [
      {
        key: 'stopped-read',
        label: 'Stopped · the read failed',
        view: viewAt('stopped', {
          stopped: {
            at: 'sources',
            reason:
              'The sheet could not be reached: Composio answered 503. Nothing was read.',
          },
        }),
      },
      {
        key: 'unfit',
        label: 'Stopped · the sheet does not fit',
        view: viewAt('evaluating', {
          unfit: ['Stock has no on_hand column.'],
        }),
      },
      {
        key: 'stopped-proposal',
        label: 'Stopped · no proposal came back',
        view: viewAt(
          'stopped',
          {
            stopped: {
              at: 'evaluation',
              reason:
                'Out of quota: gemini-3.6-flash until 12:00, gemini-3.5-flash until 12:00. Try again later.',
            },
          },
          {
            model: 'gemini-3.5-flash',
            thought: null,
            writing: 0,
            tokens: { input: 0, output: 0, thinking: 0 },
            // As the engine reports it (withModels), two models out of quota.
            events: [
              { at: at(4), kind: 'asked', model: 'gemini-3.6-flash' },
              {
                at: at(5),
                kind: 'busy',
                model: 'gemini-3.6-flash',
                why: 'quota',
                until: '2026-11-06T12:00:00.000Z',
              },
              { at: at(5), kind: 'asked', model: 'gemini-3.5-flash' },
              {
                at: at(6),
                kind: 'busy',
                model: 'gemini-3.5-flash',
                why: 'quota',
                until: '2026-11-06T12:00:00.000Z',
              },
            ],
          },
        ),
      },
      {
        key: 'intervention',
        label: 'Needs intervention · read back differently',
        view: viewAt('intervention', {
          mismatch:
            'Orders!B3 reads back 40, not 46: someone changed it as it was written.',
        }),
      },
    ],
  };
}
