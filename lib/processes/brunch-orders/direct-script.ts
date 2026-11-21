import frozenProposal from '@/e2e/fixtures/brunch-orders-proposal.json';
import snapshot from '@/fixtures/brunch-orders/sheet-snapshot.json';
import type {
  ModelRunView,
  OutputWrite,
} from '@/components/app-shell/thread/model-run-thread';
import { madeNow } from '@/components/engine/propose/made-now';
import type { Decision } from '@/components/engine/propose/types';
import { blockFor, writesOf } from '@/lib/engine/apply-block';
import type { DataTab } from '@/lib/engine/records';
import type { Proposal, ProposalActivity } from '@/lib/engine/types';
import { DATA_TABS } from '@/lib/processes/brunch-orders/data';
import {
  MODEL_RUN_MAIN_LINE,
  type ModelRunFacts,
  type ModelRunStage,
} from '@/lib/shell/model-run';
import {
  BRUNCH_ORDERS_DIRECT_DEFINITIONS as owner,
  brunchOrdersDirectProcess,
} from '@/lib/processes/brunch-orders/process';

import recordedActivity from './brunch-activity.json';

/*
  A Brunch orders run with no rulebook at every stage, from
  the frozen fixtures the browser tests use -- the captured sheet and a kept
  proposal -- so each stage can be designed or played as a mock run without a
  model or the sheet. The proposal's checks are dropped: with no rulebook there
  are none, and a record the model is unsure of is one a person decides. What
  the model did while proposing is recorded from one real proposal.
*/

const frozen = frozenProposal as unknown as {
  names: Record<string, string>;
  proposal: Proposal;
};

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
  keys.slice(0, 4).map((key) => [key, madeNow('approve', AT)]),
);
// Everything decided, one of each kind, so the approval shows all three.
const allDecided: Record<string, Decision> = Object.fromEntries(
  keys.map((key, index) => [
    key,
    index === 1
      ? madeNow('change', AT, {
          values: {
            order: Math.max(0, (proposal.records[key]?.values?.order ?? 0) - 2),
          },
          checked: { verdict: 'ready', checks: [] },
        })
      : index === 5
        ? madeNow('reject', AT)
        : madeNow('approve', AT),
  ]),
);

// The captured read's tabs, each on its own copy: a stage changes some.
const tabs: DataTab[] = DATA_TABS.map((name) => ({
  name,
  values: structuredClone(
    (snapshot.valueRanges.find((range) => range.range.startsWith(name))
      ?.values ?? []) as unknown[][],
  ),
}));
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
// Last weekend's orders, as the Orders tab holds them before this run writes.
const lastWeekend = [
  ['sku', 'order'],
  ...keys.map((key, index) => [key, index % 3 === 0 ? '' : 8 + index * 4]),
];

// Computes the exact output tables and cell changes for any set of decisions,
// matching what the live run's preview produces.
export function mockWriteOutputs(
  decisions: Record<string, Decision>,
): OutputWrite[] {
  const writes = writesOf(
    proposal,
    Object.fromEntries(
      Object.entries(decisions).map(([key, { kind, values, at: when }]) => [
        key,
        { kind, ...(values ? { values } : {}), at: when },
      ]),
    ),
  );
  const nextChanges = blockFor(lastWeekend, owner, writes).changes;
  return [
    {
      id: 'orders',
      kind: 'google-sheets',
      title: read.title,
      key: owner.subject.data.output?.key ?? 'Record',
      url: read.url,
      resourceIds: { Orders: 0, 'Standing orders': 1834920517 },
      changes: nextChanges,
    },
  ];
}

const defaultOutputs = mockWriteOutputs(allDecided);
const defaultWritesCount = defaultOutputs.reduce(
  (total, output) => total + output.changes.length,
  0,
);

/*
  What the engine reported while the model worked, recorded from one real
  proposal (brunch-activity.json): each moment it changed, at the time it did,
  with its clock moved to this run's. Realistic thinking summaries are attached
  to the active frames so the mock exercises the Thinking section too.
*/
const recorded = recordedActivity as unknown as {
  frames: { t: number; running: boolean; activity: ProposalActivity }[];
};
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
const FRAME_THOUGHTS: (string | null)[] = [
  null,
  null,
  '**Reading stock levels and weekend targets**\nChecking current on-hand counts against the standing orders and weekend cover rules for each item before calculating order quantities.',
  '**Re-checking flagged items**\nTwo items fell outside the expected pack multiples; recalculating their order quantities against the minimum batch sizes and perishable lead times.',
  '**Verifying final order quantities**\nAll 12 items now satisfy stock cover and pack-size rules; flagging uncertain estimates for human review before finalising the proposal.',
];
const FRAME_THINKING_TOKENS = [0, 0, 0, 612, 1240];
const PROPOSING = recorded.frames
  .filter((frame) => frame.running)
  .map((frame, index) => {
    const base = rebased(frame.activity);
    const thinking = FRAME_THINKING_TOKENS[index] ?? 0;
    return {
      t: frame.t,
      activity: {
        ...base,
        thought: base.thought ?? FRAME_THOUGHTS[index] ?? null,
        tokens: base.tokens
          ? {
              ...base.tokens,
              thinking: base.tokens.thinking || thinking,
            }
          : base.tokens,
      },
    };
  });
const answeredBase = rebased(recorded.frames.at(-1)!.activity);
const mockReasoningText = FRAME_THOUGHTS.filter((t): t is string =>
  Boolean(t),
).join('\n');
const ANSWERED_ACTIVITY: ProposalActivity = {
  ...answeredBase,
  thought: null,
  stream: [
    ...(answeredBase.stream ?? []),
    {
      at: answeredBase.events.at(-1)?.at ?? AT,
      from: 'model',
      part: { type: 'reasoning-start', text: mockReasoningText },
    },
  ],
  tokens: answeredBase.tokens
    ? {
        ...answeredBase.tokens,
        thinking: answeredBase.tokens.thinking || 1240,
      }
    : answeredBase.tokens,
};

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
  writes: defaultWritesCount,
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
          outputs: defaultOutputs,
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
  const evaluatingFrom = PROPOSING[0]?.t ?? 0;

  return {
    mainLine: MODEL_RUN_MAIN_LINE.map((stage): ScriptedStage => ({
      key: stage,
      label: stage,
      view: viewAt(stage),
      frames:
        stage === 'evaluating'
          ? PROPOSING.map((frame) => ({
              t: frame.t - evaluatingFrom,
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
