'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import frozenAccepted from '@/e2e/fixtures/brunch-orders-accepted.json';
import frozenCalculation from '@/e2e/fixtures/brunch-orders-calculation.json';
import frozenProposal from '@/e2e/fixtures/brunch-orders-proposal.json';
import frozenRules from '@/e2e/fixtures/brunch-orders-rules.json';
import frozenProfile from '@/fixtures/brunch-orders/profile/current.json';
import snapshot from '@/fixtures/brunch-orders/sheet-snapshot.json';
import { useRunProgress } from '@/components/app-shell/runs/run-progress';
import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { Thread } from '@/components/app-shell/thread/thread-arrivals';
import type {
  LiveRun,
  RunSelection,
} from '@/components/app-shell/runs/run-selection';
import {
  ThreadPlayerBar,
  usePersistedMockStage,
  useSlowMotion,
  type ThreadPlayerStep,
} from '@/components/app-shell/thread/thread-player';
import { ResponseSection } from '@/components/app-shell/thread/thread-page';
import { ApplyStep, type ApplyProgress } from '@/components/engine/apply-step';
import {
  CalculateStep,
  type CalculateProgress,
} from '@/components/engine/calculate-step';
import { madeNow } from '@/components/engine/propose/made-now';
import { ProposeStep } from '@/components/engine/propose/propose-step';
import type {
  Decision,
  ProposeProgress,
} from '@/components/engine/propose/types';
import { ReadStep, type RunRead } from '@/components/engine/read-step';
import type { RulesReply } from '@/components/engine/rules/rules-queries';
import {
  RulesStep,
  type RulesProgress,
} from '@/components/engine/rules/rules-step';
import {
  InstructionsText,
  RunNote,
  useRunDebug,
} from '@/components/engine/run-parts';
import { useTRPC } from '@/components/trpc/provider';
import { blockFor, writesOf } from '@/lib/engine/apply-block';
import type { Calculation, CrossCheck } from '@/lib/engine/calculate';
import type { DataTab, KeptRead } from '@/lib/engine/records';
import {
  dataProfileSchema,
  definitionSetSchema,
  RULEBOOK_SCHEMA,
  type Application,
  type Definition,
  type DefinitionSet,
  type Proposal,
} from '@/lib/engine/types';
import {
  DATA_TABS,
  SHEET_USE,
  SUBJECT,
} from '@/lib/processes/brunch-orders/data';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { COMING, ORDER_STEPS } from '@/lib/processes/brunch-orders/steps';
import type { ProcessStep } from '@/lib/shell/model';
import { sourceById } from '@/lib/sources/model';
import { motionTime } from '@/lib/ui/motion-time';
import { useWorkingFavicon } from '@/components/app-shell/runs/working-favicon';

import { ordersAnnouncement, ordersRunStatus } from './orders-progress';

const AT = '2026-11-06T11:49:00.000Z';
const MOCK_READ_ID = 'mock-captured-read';

const rulesSet = definitionSetSchema.parse(frozenRules);
const acceptedSet = definitionSetSchema.parse(frozenAccepted);
const calculation = frozenCalculation as unknown as Calculation;
const proposalData = frozenProposal as unknown as {
  names: Record<string, string>;
  calculated: {
    calculations: { id: string; name: string }[];
    rows: Record<string, Record<string, number | null>>;
  };
  proposal: Proposal;
};

const tabs: DataTab[] = DATA_TABS.map((name) => ({
  name,
  values: structuredClone(
    (snapshot.valueRanges.find((range) => range.range.startsWith(name))
      ?.values ?? []) as unknown[][],
  ),
}));

const mockKeptRead: KeptRead = {
  id: MOCK_READ_ID,
  readAt: AT,
  source: 'Google Sheets · Brunch store (mock copy)',
  spreadsheet: {
    title: 'Brunch store',
    url: 'https://docs.google.com/spreadsheets/d/mock',
    tabIds: { Orders: 0 },
  },
  tabs,
};

const mockRunRead: RunRead = {
  id: MOCK_READ_ID,
  readAt: AT,
  source: mockKeptRead.source,
  title: 'Brunch store',
  url: mockKeptRead.spreadsheet.url,
  tabIds: mockKeptRead.spreadsheet.tabIds,
  tabs: tabs.map((tab) => ({ name: tab.name, rows: tab.values.length })),
  problems: [],
};

const confirmedProfile = dataProfileSchema.parse(frozenProfile);

const asFound = (item: Definition): Definition => ({
  ...item,
  constants: [],
  groups: [],
  uses: [],
  formula: null,
  examples: [],
  problem: null,
  model: null,
  approvedAt: null,
  deniedAt: null,
});

function setWithWritten(set: DefinitionSet, written: number): DefinitionSet {
  return {
    ...set,
    intentConfirmedAt: null,
    definitions: set.definitions.map((item, index) =>
      index < written ? { ...item, approvedAt: null } : asFound(item),
    ),
  };
}

const crossCheckAgreed: CrossCheck = {
  fingerprint: calculation.fingerprint,
  readId: MOCK_READ_ID,
  model: 'gemini-3.6-flash',
  at: AT,
  cells: Object.fromEntries(
    calculation.rows.map((row) => [
      row.key,
      Object.fromEntries(
        calculation.calculations.map((c) => [
          c.id,
          {
            model: row.values[c.id]!.value!,
            working: 'Worked out from the instructions and the data.',
            agrees: true,
          },
        ]),
      ),
    ]),
  ),
  agreed: calculation.rows.length * calculation.calculations.length,
  total: calculation.rows.length * calculation.calculations.length,
};

const crossCheckDiffer: CrossCheck = {
  ...crossCheckAgreed,
  cells: {
    ...crossCheckAgreed.cells,
    'AV-RR': {
      ...crossCheckAgreed.cells['AV-RR'],
      expected_sales: {
        model: 64.2,
        working: 'Did not round up to whole units.',
        agrees: false,
      },
    },
  },
  agreed: crossCheckAgreed.total - 1,
};

const keys = Object.keys(proposalData.proposal.records);
const someDecisions: Record<string, Decision> = Object.fromEntries(
  keys.slice(0, 8).map((key) => [key, madeNow('approve', AT)]),
);
const allDecisions: Record<string, Decision> = Object.fromEntries(
  keys.map((key) => [
    key,
    key === 'CF-40'
      ? madeNow('change', AT, {
          values: { order: 6 },
          checked: { verdict: 'ready', checks: [] },
        })
      : key === 'SD-01'
        ? madeNow('reject', AT)
        : madeNow('approve', AT),
  ]),
);

const writes = writesOf(
  proposalData.proposal,
  Object.fromEntries(
    Object.entries(allDecisions).map(([key, { kind, values, at }]) => [
      key,
      { kind, ...(values ? { values } : {}), at },
    ]),
  ),
);
const lastWeekend = [
  ['sku', 'order'],
  ...keys.map((key, index) => [key, index % 3 === 0 ? '' : 8 + index * 4]),
];
const previewChanges = blockFor(lastWeekend, owner, writes).changes;

const QUOTA =
  'Out of quota: gemini-3.5-flash-lite until 14:20, gemini-3.1-flash-lite until 14:20. Choose a model of another family, or try again later.';

type OrdersStageKey =
  | 'read-waiting'
  | 'read-done'
  | 'rules-finding'
  | 'rules-writing-1'
  | 'rules-writing-3'
  | 'rules-waiting-slot'
  | 'rules-fixing'
  | 'rules-ready'
  | 'rules-accepted'
  | 'calculate-worked'
  | 'calculate-checked'
  | 'propose-running'
  | 'propose-review'
  | 'propose-some'
  | 'apply-preview'
  | 'apply-written'
  | 'branch-rules-quota'
  | 'branch-calc-differ'
  | 'branch-propose-quota'
  | 'branch-apply-mismatch';

export const ORDERS_MOCK_STAGES: readonly (ThreadPlayerStep & {
  key: OrdersStageKey;
})[] = [
  { key: 'read-waiting', label: 'Read the sheet · waiting', group: 'main' },
  { key: 'read-done', label: 'Read the sheet · 5 tabs read', group: 'main' },
  {
    key: 'rules-finding',
    label: 'Rules · finding the definitions',
    group: 'main',
  },
  {
    key: 'rules-writing-1',
    label: 'Rules · first rule writing, rest queued',
    group: 'main',
  },
  {
    key: 'rules-writing-3',
    label: 'Rules · 2 written, 3rd writing',
    group: 'main',
  },
  {
    key: 'rules-waiting-slot',
    label: 'Rules · waiting for a request slot',
    group: 'main',
  },
  {
    key: 'rules-fixing',
    label: 'Rules · 3 written, 4th fixing 1 problem',
    group: 'main',
  },
  {
    key: 'rules-ready',
    label: 'Rules · all 5 drafted, waiting for you',
    group: 'main',
  },
  {
    key: 'rules-accepted',
    label: 'Rules · all rules accepted',
    group: 'main',
  },
  {
    key: 'calculate-worked',
    label: 'Calculate · values worked out',
    group: 'main',
  },
  {
    key: 'calculate-checked',
    label: 'Calculate · all match the model',
    group: 'main',
  },
  { key: 'propose-running', label: 'Propose · proposing…', group: 'main' },
  {
    key: 'propose-review',
    label: 'Propose · 11 proposed, 3 need you',
    group: 'main',
  },
  { key: 'propose-some', label: 'Propose · 8 of 11 decided', group: 'main' },
  { key: 'apply-preview', label: 'Apply · ready to write', group: 'main' },
  {
    key: 'apply-written',
    label: 'Apply · written and read back',
    group: 'main',
  },
  {
    key: 'branch-rules-quota',
    label: 'Stopped · Rules draft out of quota',
    group: 'branch',
  },
  {
    key: 'branch-calc-differ',
    label: 'Disagreement · Calculate cross-check differs',
    group: 'branch',
  },
  {
    key: 'branch-propose-quota',
    label: 'Stopped · Propose out of quota',
    group: 'branch',
  },
  {
    key: 'branch-apply-mismatch',
    label: 'Needs intervention · Apply read back differently',
    group: 'branch',
  },
];

const STEP_MS = 3800;

function rulesReplyForStage(stage: OrdersStageKey): RulesReply {
  const baseProfile = {
    state: 'confirmed' as const,
    profile: confirmedProfile,
  };
  const baseHistory = {
    head: calculation.fingerprint,
    revisions: [
      {
        id: calculation.fingerprint,
        parent: null,
        reason: 'accepted' as const,
        at: AT,
        schemaVersion: RULEBOOK_SCHEMA,
        note: null,
        changes: null,
      },
    ],
  };
  switch (stage) {
    case 'read-waiting':
    case 'read-done':
      return {
        kind: 'none',
        drafting: null,
        profile: baseProfile,
      };
    case 'rules-finding':
      return {
        kind: 'none',
        drafting: {
          step: 'Finding the definitions in the instructions…',
          error: null,
          running: true,
          writing: null,
        },
        profile: baseProfile,
      };
    case 'rules-writing-1':
      return {
        kind: 'rules',
        set: setWithWritten(rulesSet, 0),
        names: proposalData.names,
        working: {},
        sentences: {},
        drafting: {
          step: 'Asking the model for a formula',
          error: null,
          running: true,
          writing: rulesSet.definitions[0]!.id,
        },
        profile: baseProfile,
        history: baseHistory,
      };
    case 'rules-writing-3':
      return {
        kind: 'rules',
        set: setWithWritten(rulesSet, 2),
        names: proposalData.names,
        working: {},
        sentences: {},
        drafting: {
          step: 'Trying a formula on real data · attempt 2',
          error: null,
          running: true,
          writing: rulesSet.definitions[2]!.id,
        },
        profile: baseProfile,
        history: baseHistory,
      };
    case 'rules-waiting-slot':
      return {
        kind: 'rules',
        set: setWithWritten(rulesSet, 2),
        names: proposalData.names,
        working: {},
        sentences: {},
        drafting: {
          step: 'Waiting 40 s for a request slot',
          error: null,
          running: true,
          writing: rulesSet.definitions[2]!.id,
        },
        profile: baseProfile,
        history: baseHistory,
      };
    case 'rules-fixing':
      return {
        kind: 'rules',
        set: setWithWritten(rulesSet, 3),
        names: proposalData.names,
        working: {},
        sentences: {},
        drafting: {
          step: 'Fixing 1 problem',
          error: null,
          running: true,
          writing: rulesSet.definitions[3]!.id,
        },
        profile: baseProfile,
        history: baseHistory,
      };
    case 'rules-ready':
      return {
        kind: 'rules',
        set: setWithWritten(rulesSet, 5),
        names: proposalData.names,
        working: {},
        sentences: {},
        drafting: {
          step: 'Drafted 5 definitions.',
          error: null,
          running: false,
          writing: null,
        },
        profile: baseProfile,
        history: baseHistory,
      };
    case 'branch-rules-quota':
      return {
        kind: 'rules',
        set: setWithWritten(rulesSet, 3),
        names: proposalData.names,
        working: {},
        sentences: {},
        drafting: {
          step: '',
          error: QUOTA,
          running: false,
          writing: null,
        },
        profile: baseProfile,
        history: baseHistory,
      };
    default:
      return {
        kind: 'rules',
        set: acceptedSet,
        names: proposalData.names,
        working: {},
        sentences: {},
        drafting: null,
        profile: baseProfile,
        history: baseHistory,
      };
  }
}

export function OrdersMockRun({
  live,
  selection,
}: {
  live: LiveRun;
  selection: RunSelection;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sheet = useContext(ProcessSheetActions);
  const debug = useRunDebug();
  const { kept, text } = live;
  const mockText = `${text}\n<!-- mock -->`;
  const version = kept.instructions.version;

  const [index, setIndex] = usePersistedMockStage(kept.id, ORDERS_MOCK_STAGES);
  const [runKey, setRunKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  useSlowMotion(container, rate);

  const stage = ORDERS_MOCK_STAGES[index] ?? ORDERS_MOCK_STAGES[0]!;
  const mainStages = ORDERS_MOCK_STAGES.filter((s) => s.group !== 'branch');
  const lastMainIndex = mainStages.length - 1;
  const isBranch = stage.group === 'branch';
  const atLastMain = !isBranch && index >= lastMainIndex;
  const running = playing && !isBranch && !atLastMain;

  const hasRead = stage.key !== 'read-waiting';
  const read = hasRead ? mockRunRead : undefined;
  const readId = hasRead ? MOCK_READ_ID : null;

  const [revealingRead, setRevealingRead] = useState(false);
  const [prevHasRead, setPrevHasRead] = useState(hasRead);
  if (prevHasRead !== hasRead) {
    setPrevHasRead(hasRead);
    setRevealingRead(
      hasRead && !matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }

  const totalProposals = Object.keys(proposalData.proposal.records).length;
  const [proposedShown, setProposedShown] = useState(totalProposals);
  const [prevProposeKey, setPrevProposeKey] = useState(stage.key);
  if (prevProposeKey !== stage.key) {
    setPrevProposeKey(stage.key);
    if (stage.key === 'propose-review') {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      setProposedShown(reduced ? totalProposals : 1);
    } else {
      setProposedShown(totalProposals);
    }
  }
  useEffect(() => {
    if (stage.key !== 'propose-review' || proposedShown >= totalProposals) {
      return;
    }
    const timer = setTimeout(
      () => setProposedShown((count) => Math.min(totalProposals, count + 1)),
      motionTime(260) / rate,
    );
    return () => clearTimeout(timer);
  }, [stage.key, proposedShown, totalProposals, rate]);

  const reachedCalculate = [
    'calculate-worked',
    'calculate-checked',
    'propose-running',
    'propose-review',
    'propose-some',
    'apply-preview',
    'apply-written',
    'branch-calc-differ',
    'branch-propose-quota',
    'branch-apply-mismatch',
  ].includes(stage.key);

  const reachedPropose = [
    'propose-running',
    'propose-review',
    'propose-some',
    'apply-preview',
    'apply-written',
    'branch-propose-quota',
    'branch-apply-mismatch',
  ].includes(stage.key);

  const pinned = reachedPropose ? calculation.fingerprint : null;

  // Seed QueryClient cache synchronously before child steps render or re-render.
  useLayoutEffect(() => {
    queryClient.setQueryData(trpc.read.summary.queryKey({ id: MOCK_READ_ID }), {
      id: MOCK_READ_ID,
      readAt: AT,
      source: mockKeptRead.source,
      spreadsheet: mockKeptRead.spreadsheet,
      tabs: mockRunRead.tabs,
      problems: [],
    });
    queryClient.setQueryData(
      trpc.read.get.queryKey({ id: MOCK_READ_ID }),
      mockKeptRead,
    );

    const rulesReply = rulesReplyForStage(stage.key);
    queryClient.setQueryData(
      trpc.rules.get.queryKey({ text: mockText, readId }),
      rulesReply,
    );
    queryClient.setQueryData(
      trpc.rules.get.queryKey({ text: mockText }),
      rulesReply,
    );

    if (reachedCalculate) {
      const check =
        stage.key === 'branch-calc-differ'
          ? crossCheckDiffer
          : stage.key === 'calculate-worked'
            ? null
            : crossCheckAgreed;
      const calcReply = {
        kind: 'calculation' as const,
        calculation,
        check,
        current: calculation.fingerprint,
      };
      queryClient.setQueryData(
        trpc.calculate.get.queryKey({
          text: mockText,
          readId: MOCK_READ_ID,
          rulebook: undefined,
        }),
        calcReply,
      );
      queryClient.setQueryData(
        trpc.calculate.get.queryKey({
          text: mockText,
          readId: MOCK_READ_ID,
          rulebook: calculation.fingerprint,
        }),
        calcReply,
      );
    }

    if (reachedPropose && pinned) {
      const isProposing = stage.key === 'propose-running';
      const isQuotaError = stage.key === 'branch-propose-quota';
      const visibleRecords =
        stage.key === 'propose-review' && proposedShown < totalProposals
          ? Object.fromEntries(
              Object.entries(proposalData.proposal.records).slice(
                0,
                proposedShown,
              ),
            )
          : proposalData.proposal.records;
      const propReply = {
        kind: 'proposal' as const,
        fingerprint: pinned,
        names: proposalData.names,
        calculated: proposalData.calculated,
        proposal:
          isProposing || isQuotaError
            ? null
            : {
                ...proposalData.proposal,
                records: visibleRecords,
                fingerprint: pinned,
              },
        progress: isProposing
          ? {
              step: 'Proposing for 11 products…',
              error: null,
              running: true,
            }
          : isQuotaError
            ? {
                step: '',
                error: QUOTA,
                running: false,
              }
            : null,
      };
      queryClient.setQueryData(
        trpc.propose.get.queryKey({
          text: mockText,
          readId: MOCK_READ_ID,
          rulebook: pinned,
          evaluation: 'rules',
        }),
        propReply,
      );

      const stageDecisions =
        stage.key === 'apply-preview' ||
        stage.key === 'apply-written' ||
        stage.key === 'branch-apply-mismatch'
          ? allDecisions
          : stage.key === 'propose-some'
            ? someDecisions
            : {};
      queryClient.setQueryData(
        trpc.decisions.current.queryKey({
          process: 'brunch-orders',
          runId: kept.id,
        }),
        {
          kind: 'decisions' as const,
          proposal: { id: 1, at: proposalData.proposal.at },
          decisions: stageDecisions,
        },
      );
    }
  }, [
    stage.key,
    queryClient,
    trpc,
    mockText,
    readId,
    reachedCalculate,
    reachedPropose,
    proposedShown,
    totalProposals,
    pinned,
    kept.id,
  ]);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => {
        setIndex((current) => {
          const next = current + 1;
          if (next >= lastMainIndex) setPlaying(false);
          return Math.min(next, lastMainIndex);
        });
      },
      motionTime(STEP_MS) / rate,
    );
    return () => clearTimeout(timer);
  }, [running, index, lastMainIndex, rate, setIndex]);

  const [rules, setRules] = useState<RulesProgress>();
  const [calculated, setCalculated] = useState<CalculateProgress>();
  const [proposed, setProposed] = useState<ProposeProgress>();
  const [applied, setApplied] = useState<ApplyProgress>();
  useWorkingFavicon(
    running || Boolean(rules?.running) || Boolean(proposed?.running),
  );

  // Sync step progress with the selected mock stage.
  const rulesDone =
    reachedCalculate ||
    (rules !== undefined &&
      rules.intent &&
      rules.total > 0 &&
      rules.approved === rules.total);
  const canPropose = reachedPropose && read !== undefined && pinned !== null;
  const allDecided =
    stage.key === 'apply-preview' ||
    stage.key === 'apply-written' ||
    stage.key === 'branch-apply-mismatch' ||
    (proposed?.proposedAt != null &&
      proposed.total > 0 &&
      Object.keys(proposed.decisions).length === proposed.total);

  const mockApplication: Application | null =
    stage.key === 'apply-written'
      ? {
          proposedAt: proposalData.proposal.at,
          tab: 'Orders',
          at: AT,
          status: 'verified',
          error: null,
          undoneAt: null,
          range: 'A1:B12',
          before: [],
          after: [],
          changes: previewChanges,
          decisions: {},
        }
      : stage.key === 'branch-apply-mismatch'
        ? {
            proposedAt: proposalData.proposal.at,
            tab: 'Orders',
            at: AT,
            status: 'mismatch',
            error:
              'Orders!B3 reads back 40, not 46: someone changed it as it was written.',
            undoneAt: null,
            range: 'A1:B12',
            before: [],
            after: [],
            changes: previewChanges,
            decisions: {},
          }
        : null;

  const effectiveApplied: ApplyProgress | undefined = mockApplication
    ? { status: mockApplication.status }
    : applied;

  const status = (step: ProcessStep): ProcessStep['status'] =>
    step.id === 'instructions'
      ? 'complete'
      : step.id === 'read'
        ? readId
          ? 'complete'
          : 'attention'
        : step.id === 'rules'
          ? rules?.running
            ? 'running'
            : rulesDone
              ? 'complete'
              : readId
                ? 'attention'
                : 'pending'
          : step.id === 'calculate'
            ? !rulesDone
              ? 'pending'
              : calculated?.checked
                ? calculated.agreed === calculated.total
                  ? 'complete'
                  : 'attention'
                : !debug && calculated
                  ? 'complete'
                  : 'attention'
            : step.id === 'propose'
              ? !canPropose
                ? 'pending'
                : proposed?.running
                  ? 'running'
                  : allDecided
                    ? 'complete'
                    : 'attention'
              : step.id === 'apply'
                ? !allDecided
                  ? 'pending'
                  : effectiveApplied?.status === 'verified'
                    ? 'complete'
                    : effectiveApplied?.status === 'mismatch'
                      ? 'blocked'
                      : 'attention'
                : 'pending';

  const latest = !readId
    ? 'read'
    : !rulesDone
      ? 'rules'
      : !canPropose || stage.key === 'branch-calc-differ'
        ? 'calculate'
        : !allDecided
          ? 'propose'
          : 'apply';

  const runStatus = ordersRunStatus({
    latest,
    proposalReady: Boolean(proposed?.proposedAt),
    noWrites: previewChanges.length === 0,
    application: effectiveApplied?.status,
    stopped:
      stage.key === 'branch-rules-quota' ||
      stage.key === 'branch-propose-quota',
    held: stage.key === 'branch-calc-differ',
  });
  useRunProgress(selection, kept.id, kept.status, runStatus);

  const label = (step: ProcessStep) =>
    step.id === 'rules' && (rules?.running || rules?.total)
      ? rules.running
        ? rules.found
          ? `${rules.written} of ${rules.total} written`
          : 'Finding the rules'
        : rules.error && rules.written < rules.total
          ? `${rules.written} of ${rules.total} written`
          : rulesDone || rules.approved === rules.total
            ? 'All rules accepted'
            : `${rules.approved} of ${rules.total} accepted`
      : step.id === 'calculate' && rulesDone
        ? !calculated?.checked
          ? debug
            ? 'Not cross-checked'
            : calculated
              ? `${calculated.total} ${calculated.total === 1 ? 'value' : 'values'} worked out`
              : step.label
          : calculated.agreed === calculated.total
            ? `All ${calculated.total} match the model`
            : `${calculated.total - calculated.agreed} don’t match the model`
        : step.id === 'propose' && canPropose
          ? proposed?.running
            ? 'Proposing…'
            : !proposed?.proposedAt
              ? 'Not proposed'
              : `${proposed.total} ${proposed.total === 1 ? 'item' : 'items'}`
          : step.id === 'apply' && allDecided
            ? effectiveApplied?.status === 'verified'
              ? 'Written and read back'
              : effectiveApplied?.status === 'mismatch'
                ? 'Check the sheet'
                : `${previewChanges.length} to write`
            : step.label;

  const flag = (step: ProcessStep) =>
    step.id === 'rules' && !rules?.running && rules?.error
      ? `Stopped: ${rules.error.split(/[.:]/)[0]!.toLowerCase()}`
      : step.id === 'propose' &&
          canPropose &&
          !proposed?.running &&
          proposed?.proposedAt &&
          proposed.needYou > 0
        ? `${proposed.needYou} need you`
        : undefined;

  const progress = (step: ProcessStep) =>
    step.id === 'rules' && rules?.running && rules.found
      ? { at: rules.written, of: rules.total }
      : undefined;

  const steps = ORDER_STEPS.map((step) => ({
    ...step,
    status: status(step),
    label: label(step),
    flag: flag(step),
    flagWhenClosed: step.id === 'propose',
    progress: progress(step),
  }));

  return (
    <div ref={container}>
      <ThreadPlayerBar
        steps={ORDERS_MOCK_STAGES}
        index={index}
        playing={running}
        rate={rate}
        onSelect={(next) => {
          setPlaying(false);
          if (next === 0) setRunKey((key) => key + 1);
          setIndex(next);
        }}
        onTogglePlay={() => {
          if (isBranch || atLastMain) {
            setRunKey((key) => key + 1);
            setIndex(0);
            setPlaying(true);
          } else {
            setPlaying(!playing);
          }
        }}
        onRateChange={setRate}
      />
      <Thread
        steps={steps}
        look="proposed"
        latestId={latest}
        resetKey={runKey}
        announcement={ordersAnnouncement(
          latest,
          runStatus,
          previewChanges.length === 0,
        )}
        headingActions={{
          instructions: sheet
            ? {
                label: version,
                onPress:
                  version === sheet.currentVersion
                    ? sheet.showInstructions
                    : () => sheet.showVersion(version),
              }
            : undefined,
        }}
        boxes={Object.fromEntries(
          steps.map((step) => [
            step.id,
            step.id === 'instructions' ? (
              live.kept.additionalInstructions ? (
                <div className="grid gap-3">
                  <RunNote text={live.kept.additionalInstructions} />
                  <InstructionsText text={text} />
                </div>
              ) : (
                <InstructionsText text={text} />
              )
            ) : step.id === 'read' ? (
              <ResponseSection>
                <ReadStep
                  kind={sourceById(SHEET_USE.source)?.kind ?? 'google-sheets'}
                  read={read}
                  revealing={revealingRead}
                  onRevealed={() => setRevealingRead(false)}
                  automatic={!debug}
                  mock
                  onRead={() => {
                    if (stage.key === 'read-waiting') setIndex(1);
                  }}
                />
              </ResponseSection>
            ) : step.id === 'rules' ? (
              <ResponseSection>
                <RulesStep
                  subject={SUBJECT}
                  text={mockText}
                  version={version}
                  readId={readId}
                  onProgress={setRules}
                  debug={debug}
                  mock
                />
              </ResponseSection>
            ) : step.id === 'calculate' && rulesDone && readId ? (
              <ResponseSection>
                <CalculateStep
                  key={stage.key}
                  text={mockText}
                  readId={readId}
                  calculatedOn={pinned}
                  onProgress={setCalculated}
                  debug={debug}
                  mock
                />
              </ResponseSection>
            ) : step.id === 'propose' && canPropose && read && pinned ? (
              <ResponseSection>
                <ProposeStep
                  subject={SUBJECT}
                  text={mockText}
                  readId={read.id}
                  rulebook={pinned}
                  run={{ process: 'brunch-orders', runId: kept.id }}
                  onProgress={setProposed}
                  debug={debug}
                  mock
                />
              </ResponseSection>
            ) : step.id === 'apply' && allDecided && read && pinned ? (
              <ResponseSection>
                <ApplyStep
                  subject={SUBJECT}
                  run={{ process: 'brunch-orders', runId: kept.id }}
                  decisions={proposed?.decisions ?? allDecisions}
                  onProgress={setApplied}
                  mock={{
                    preview: {
                      kind: 'preview',
                      tab: 'Orders',
                      names: proposalData.names,
                      notWritable: null,
                      tabExists: true,
                      changes: previewChanges,
                      problems: [],
                      newlyFailing: [],
                      application: mockApplication,
                    },
                    onWrite: () => {
                      const writtenIdx = ORDERS_MOCK_STAGES.findIndex(
                        (s) => s.key === 'apply-written',
                      );
                      if (writtenIdx >= 0) setIndex(writtenIdx);
                    },
                    onUndo: () => {
                      const previewIdx = ORDERS_MOCK_STAGES.findIndex(
                        (s) => s.key === 'apply-preview',
                      );
                      if (previewIdx >= 0) setIndex(previewIdx);
                    },
                  }}
                />
              </ResponseSection>
            ) : (
              <p className="text-dense text-muted">{COMING[step.id]}</p>
            ),
          ]),
        )}
      />
    </div>
  );
}
