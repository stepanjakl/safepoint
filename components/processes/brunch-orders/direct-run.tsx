'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  useRunSelection,
  type LiveRun,
  type RunSelection,
} from '@/components/app-shell/runs/run-selection';
import { useWorkingFavicon } from '@/components/app-shell/runs/working-favicon';
import {
  ModelRunThread,
  type ModelRunActions,
  type ModelRunView,
} from '@/components/app-shell/thread/model-run-thread';
import {
  runReadOf,
  useRunRead,
  type RunRead,
} from '@/components/engine/read-step';
import { saidBy } from '@/components/engine/trial-parts';
import type {
  CheckReply,
  DecidedReply,
  Decision,
  DecisionsReply,
  ProposalReply,
} from '@/components/engine/propose/types';
import { needsPerson } from '@/components/engine/propose/verdict';
import { useTRPC } from '@/components/trpc/provider';
import { AlertBox } from '@/components/ui/alert-box';
import { asReviewed as reviewed } from '@/lib/engine/reviewed';
import type { Application, Proposal } from '@/lib/engine/types';
import { SHEET_USE, SUBJECT } from '@/lib/processes/brunch-orders/data';
import type { ProcessSummary, RunTrigger } from '@/lib/shell/model';
import {
  subjectFromTab,
  type ModelRunFacts,
  type ModelRunStage,
} from '@/lib/shell/model-run';
import { runDay, runTime } from '@/lib/shell/run-time';
import { SOURCE_KINDS, sourceById } from '@/lib/sources/model';
import { motionTime } from '@/lib/ui/motion-time';
import type { AppRouter } from '@/server/api/root';

const POLL_MS = 2000;
const NO_DECISIONS: Record<string, Decision> = {};

const STAGE_PROGRESS_STATUS: Record<
  ModelRunStage,
  'running' | 'awaiting_review' | 'approved' | 'completed' | 'held' | 'failed'
> = {
  starting: 'running',
  reading: 'running',
  evaluating: 'running',
  stopped: 'failed',
  awaiting_review: 'awaiting_review',
  reviewing: 'awaiting_review',
  ready_to_commit: 'approved',
  committing: 'approved',
  intervention: 'held',
  committed: 'completed',
};

const askedOf = (key: string, decision: Decision) =>
  decision.kind === 'change'
    ? { key, kind: 'change' as const, values: decision.values ?? {} }
    : { key, kind: decision.kind };

type ApplyReplies = inferRouterOutputs<AppRouter>['application'];
type ApplyReply =
  ApplyReplies['preview'] | ApplyReplies['write'] | ApplyReplies['undo'];
type Preview = Extract<ApplyReply, { kind: 'preview' }>;

function asReviewed(proposal: Proposal | null): Proposal | null {
  if (!proposal) return null;
  return {
    ...proposal,
    records: Object.fromEntries(
      Object.entries(proposal.records).map(([key, record]) => [
        key,
        reviewed(record, 'model'),
      ]),
    ),
  };
}

import { DirectMockRun } from './direct-mock-run';

/*
  A Brunch orders run with no rulebook, as a person meets it: it reads the live
  sheet as it starts and the model proposes from the instructions straight
  after, drawn with the shared `ModelRunThread` that `/workbench/run` renders.
  Nothing is written until a person decides every record and approves the write.
*/
export function DirectOrdersRun({ process }: { process: ProcessSummary }) {
  const selection = useRunSelection();
  const live = selection?.live;
  if (!live || !selection) return null;
  if (live.mock)
    return (
      <DirectMockRun
        key={live.run.id}
        runId={live.run.id}
        selection={selection}
      />
    );
  return (
    <DirectThread
      key={live.run.id}
      process={process}
      live={live}
      selection={selection}
    />
  );
}

function DirectThread({
  live,
  selection,
}: {
  process: ProcessSummary;
  live: LiveRun;
  selection: RunSelection;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { kept, text } = live;
  const sourceKind = sourceById(SHEET_USE.source)?.kind ?? 'google-sheets';

  // A run opened with a saved read already has server state to hydrate: load
  // its read, proposal and decisions in parallel and wait for them before
  // mounting ModelRunThread so it opens straight at its real stage instead of
  // starting at 'reading' and replaying arrivals.
  const [startedWithRead] = useState(kept.readId !== null);
  const [hydrated, setHydrated] = useState(!startedWithRead);
  // A freshly started run opens on 'starting' so Instructions plays its
  // entrance sequence before Reading inputs arrives (while the live read
  // already runs in the background).
  const [startingBeat, setStartingBeat] = useState(
    () =>
      !startedWithRead &&
      (typeof matchMedia === 'undefined' ||
        !matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  useEffect(() => {
    if (!startingBeat) return;
    const timer = setTimeout(() => setStartingBeat(false), motionTime(1600));
    return () => clearTimeout(timer);
  }, [startingBeat]);

  // 1. Reading the sheet.
  const [taken, setTaken] = useState<RunRead | null>(null);
  const [readFailure, setReadFailure] = useState<string | null>(null);
  const saved = useRunRead(kept.readId);
  const read = taken && taken.id !== kept.readId ? taken : saved.read;
  const readId = read?.id ?? kept.readId;
  const keepRead = useMutation(trpc.read.keep.mutationOptions());
  const readFromLive = () => {
    setReadFailure(null);
    void keepRead
      .mutateAsync({ source: 'live' })
      .then((response) => {
        queryClient.setQueryData(
          trpc.read.summary.queryKey({ id: response.id }),
          response,
        );
        const next = runReadOf(response);
        setTaken(next);
        selection.record(kept.id, { readId: next.id }).catch(() => {
          setTaken(null);
        });
      })
      .catch((error: unknown) => {
        setReadFailure(saidBy(error) ?? 'The read failed.');
      });
  };
  const askedRead = useRef(false);
  useEffect(() => {
    if (readId || saved.error || askedRead.current) return;
    askedRead.current = true;
    readFromLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readId, saved.error]);

  const unfit = read?.problems ?? [];
  const readError = readFailure ?? saved.error;
  const canPropose =
    read !== undefined && unfit.length === 0 && kept.readId === read.id;

  // 2. Proposing from the instructions.
  const hasSavedRead = kept.readId !== null;
  const runInput = {
    text,
    readId: readId ?? '',
    evaluation: 'model' as const,
  };
  const proposalQuery = trpc.propose.get.queryOptions(runInput, {
    enabled: canPropose || hasSavedRead,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: ({ state: { data } }) =>
      data?.kind === 'proposal' && data.progress?.running ? POLL_MS : false,
    refetchIntervalInBackground: true,
  });
  const proposalAsked = useQuery(proposalQuery);
  const startProposal = useMutation(
    trpc.propose.start.mutationOptions({
      onSuccess: (answer) =>
        queryClient.setQueryData(proposalQuery.queryKey, answer),
    }),
  );
  const answer: ProposalReply | null = proposalAsked.data ?? null;
  const [lastProposal, setLastProposal] = useState<Extract<
    ProposalReply,
    { kind: 'proposal' }
  > | null>(null);
  const currentProposal = answer?.kind === 'proposal' ? answer : null;
  if (currentProposal && currentProposal !== lastProposal)
    setLastProposal(currentProposal);
  const shown = currentProposal ?? lastProposal;
  const proposal = asReviewed(shown?.proposal ?? null);
  const proposing = shown?.progress?.running ?? false;

  const autoProposed = useRef(false);
  useEffect(() => {
    if (
      !canPropose ||
      autoProposed.current ||
      answer?.kind !== 'proposal' ||
      answer.proposal ||
      answer.progress
    )
      return;
    autoProposed.current = true;
    startProposal.mutate({ ...runInput, runId: kept.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPropose, answer]);

  // 3. Decisions on the proposal.
  const decidedOn = {
    process: 'brunch-orders-direct' as const,
    runId: kept.id,
  };
  const decidedQuery = trpc.decisions.current.queryOptions(decidedOn, {
    enabled: canPropose || hasSavedRead,
    staleTime: 0,
  });
  const decidedAsked = useQuery(decidedQuery);
  const [landed, setLanded] = useState<{
    at: number;
    answer: DecisionsReply;
  } | null>(null);
  const held: DecisionsReply | null =
    landed && landed.at > decidedAsked.dataUpdatedAt
      ? landed.answer
      : (decidedAsked.data ?? null);
  const heldOn = (at: string | undefined | null) =>
    at && held?.proposal?.at === at ? held.decisions : NO_DECISIONS;
  const heldNow = heldOn(proposal?.at);

  const refreshed = useRef(new Set<string>());
  useEffect(() => {
    const at = proposal?.at;
    if (!at || !decidedAsked.data || decidedAsked.isFetching) return;
    if (decidedAsked.data.proposal?.at === at || refreshed.current.has(at))
      return;
    refreshed.current.add(at);
    void queryClient.invalidateQueries({ queryKey: decidedQuery.queryKey });
  }, [proposal?.at, decidedAsked, decidedQuery.queryKey, queryClient]);

  const [pending, setPending] = useState<
    Record<string, { decision: Decision | null; request: number }>
  >({});
  const requests = useRef(0);
  const decisions = useMemo(() => {
    const next = { ...heldNow };
    for (const [key, { decision }] of Object.entries(pending))
      if (decision) next[key] = decision;
      else delete next[key];
    return next;
  }, [heldNow, pending]);
  const scope = { scope: { id: `decisions:${kept.id}` } };
  const record = useMutation(trpc.decisions.record.mutationOptions(scope));
  const recordMany = useMutation(
    trpc.decisions.recordMany.mutationOptions(scope),
  );
  const withdraw = useMutation(trpc.decisions.withdraw.mutationOptions(scope));
  const [announced, setAnnounced] = useState('');
  const [decideError, setDecideError] = useState<string | null>(null);

  const decide = (changes: Record<string, Decision | null>, words: string) => {
    if (!proposal) return;
    setDecideError(null);
    const mine = ++requests.current;
    const entries = Object.entries(changes);
    setPending((now) => ({
      ...now,
      ...Object.fromEntries(
        entries.map(([key, decision]) => [key, { decision, request: mine }]),
      ),
    }));
    setAnnounced(words);
    const on = { ...decidedOn, proposedAt: proposal.at };
    const sets = entries.flatMap(([key, decision]) =>
      decision ? [askedOf(key, decision)] : [],
    );
    const asking: Promise<DecidedReply>[] = [
      ...(sets.length > 1
        ? [recordMany.mutateAsync({ ...on, decisions: sets })]
        : sets.length === 1
          ? [record.mutateAsync({ ...on, decision: sets[0]! })]
          : []),
      ...entries.flatMap(([key, decision]) =>
        decision ? [] : [withdraw.mutateAsync({ ...on, key })],
      ),
    ];
    let error: string | null = null;
    void Promise.allSettled(
      asking.map((request) =>
        request.then((reply) => {
          if (reply.kind !== 'stale') {
            setLanded({ at: Date.now(), answer: reply });
            queryClient.setQueryData(decidedQuery.queryKey, reply);
          }
        }),
      ),
    ).then((results) => {
      const failed = results.find((result) => result.status === 'rejected');
      if (failed)
        error =
          failed.reason instanceof Error
            ? failed.reason.message
            : 'The request failed.';
      setPending((now) =>
        Object.fromEntries(
          Object.entries(now).filter(([, one]) => one.request !== mine),
        ),
      );
      if (error) {
        setDecideError(error);
        void queryClient.invalidateQueries({ queryKey: decidedQuery.queryKey });
      }
    });
  };

  const records = proposal ? Object.entries(proposal.records) : [];
  const totalRecords = records.length;
  const needYou = records.filter(
    ([key, one]) => !decisions[key] && needsPerson(one.verdict),
  ).length;
  const decidedCount = Object.keys(decisions).length;
  const heldDecidedCount = Object.keys(heldNow).length;
  const allDecided = totalRecords > 0 && heldDecidedCount === totalRecords;

  // 4. Previewing, writing and undoing the approved decisions.
  const previewing = useMutation(trpc.application.preview.mutationOptions());
  const writing = useMutation(
    trpc.application.write.mutationOptions({ retry: false }),
  );
  const undoing = useMutation(
    trpc.application.undo.mutationOptions({ retry: false }),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [applyFailure, setApplyFailure] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const handleApplyReply = (reply: ApplyReply) => {
    setApplyFailure(null);
    if (reply.kind === 'stale') return;
    if (reply.kind === 'preview') setPreview(reply);
    setApplication(reply.application);
  };
  const askPreview = () => {
    void previewing
      .mutateAsync(decidedOn)
      .then(handleApplyReply)
      .catch((error: unknown) => {
        setApplyFailure(saidBy(error) ?? 'The request failed.');
      });
  };
  const decidedKey = JSON.stringify(
    Object.entries(heldNow).map(([key, one]) => [key, one.at]),
  );
  useEffect(() => {
    if (!allDecided) return;
    askPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDecided, decidedKey]);

  const onWrite = () => {
    setActing(true);
    void writing
      .mutateAsync({ ...decidedOn, acknowledged: [] })
      .then((reply) => {
        handleApplyReply(reply);
        setActing(false);
      })
      .catch((error: unknown) => {
        setApplyFailure(saidBy(error) ?? 'The write failed.');
        setActing(false);
      });
  };
  const onUndo = () => {
    setActing(true);
    void undoing
      .mutateAsync(decidedOn)
      .then((reply) => {
        handleApplyReply(reply);
        setActing(false);
        if (reply.kind === 'applied') askPreview();
      })
      .catch((error: unknown) => {
        setApplyFailure(saidBy(error) ?? 'The undo failed.');
        setActing(false);
      });
  };

  const proposalFailure =
    startProposal.error?.message ??
    proposalAsked.error?.message ??
    (!proposing ? (shown?.progress?.error ?? null) : null);

  const standing =
    application &&
    (application.status === 'verified' || application.status === 'mismatch');
  const unconfirmed = application?.status === 'pending';
  const changes =
    standing || unconfirmed ? application.changes : (preview?.changes ?? []);
  const writeProblems = [
    ...(preview?.notWritable ? [preview.notWritable] : []),
    ...(preview?.problems ?? []),
    ...(applyFailure ? [applyFailure] : []),
  ];

  // Derive the ModelRunStage from the live state.
  const stage: ModelRunStage = startingBeat
    ? 'starting'
    : !read && readError && !keepRead.isPending
      ? 'stopped'
      : !read || !canPropose
        ? unfit.length > 0
          ? 'evaluating'
          : 'reading'
        : !proposal && proposalFailure && !proposing && !startProposal.isPending
          ? 'stopped'
          : !proposal || proposing || startProposal.isPending
            ? 'evaluating'
            : !allDecided
              ? decidedCount > 0
                ? 'reviewing'
                : 'awaiting_review'
              : writing.isPending
                ? 'committing'
                : application?.status === 'mismatch'
                  ? 'intervention'
                  : application?.status === 'verified'
                    ? 'committed'
                    : 'ready_to_commit';

  if (!hydrated) {
    const readDone = read !== undefined || saved.error !== null;
    const proposalDone =
      !readDone ||
      unfit.length > 0 ||
      saved.error !== null ||
      proposalAsked.isFetched;
    const decisionsDone = !proposalDone || !proposal || decidedAsked.isFetched;
    const applicationDone =
      !decisionsDone ||
      !allDecided ||
      preview !== null ||
      application !== null ||
      applyFailure !== null;
    if (readDone && proposalDone && decisionsDone && applicationDone)
      setHydrated(true);
  }

  useWorkingFavicon(
    hydrated &&
      (stage === 'reading' || stage === 'evaluating' || stage === 'committing'),
  );

  // Keep the server's run status (and the runs rail) in sync with the live stage.
  const progressStatus = STAGE_PROGRESS_STATUS[stage];
  const recordedStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (kept.status === progressStatus) return;
    if (recordedStatus.current === progressStatus) return;
    recordedStatus.current = progressStatus;
    void selection
      .record(kept.id, { status: progressStatus })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, kept.id, kept.status, progressStatus]);

  const stopped: ModelRunFacts['stopped'] =
    stage !== 'stopped'
      ? null
      : !read
        ? { at: 'sources', reason: readError ?? 'The read failed.' }
        : {
            at: 'evaluation',
            reason: proposalFailure ?? 'No proposal came back.',
          };

  const sourceNoun = SOURCE_KINDS[sourceKind].noun;
  const recordNoun = subjectFromTab(read?.tabs[0]?.name);
  const view: ModelRunView = {
    stage,
    facts: {
      requestLabel: `${runDay(live.run.startedAt)} · ${runTime(live.run.startedAt)}`,
      trigger: (kept.trigger as RunTrigger) ?? 'manual',
      subject: {
        ...recordNoun,
        field: SUBJECT.proposal[0]?.label ?? 'value',
      },
      sources: 1,
      tabs: read?.tabs.length ?? 0,
      unfit,
      records: totalRecords,
      needYou,
      decided: decidedCount,
      writes: changes.length,
      output: SUBJECT.data.output?.tab ?? `the ${sourceNoun}`,
      stopped,
      mismatch:
        application?.status === 'mismatch'
          ? (application.error ??
            `The ${sourceNoun} reads back differently from what was written.`)
          : null,
    },
    fields: SUBJECT.proposal,
    instructions: {
      version: kept.instructions.version,
      text,
      note: kept.additionalInstructions,
      modelPlan: kept.modelPlan,
    },
    sourceKind,
    read: read ?? null,
    activity: shown?.progress?.activity ?? null,
    review:
      proposal && shown
        ? {
            proposal,
            names: shown.names,
            decisions,
          }
        : null,
    write: allDecided
      ? {
          outputs: read
            ? [
                {
                  id: 'orders',
                  kind: sourceKind,
                  title: read.title ?? 'Source',
                  key: SUBJECT.data.output?.key ?? 'Record',
                  url: read.url,
                  resourceIds: read.tabIds,
                  changes,
                },
              ]
            : [],
          problems: writeProblems,
          writtenAt: application?.status === 'verified' ? application.at : null,
        }
      : null,
  };

  const onCheck = async (
    key: string,
    values: Record<string, number>,
  ): Promise<CheckReply | null> => {
    try {
      return await queryClient.fetchQuery(
        trpc.propose.check.queryOptions({ ...runInput, key, values }),
      );
    } catch {
      return null;
    }
  };

  const actions: ModelRunActions = {
    onDecide: decide,
    onCheck,
    onRetry:
      stopped?.at === 'sources'
        ? readFromLive
        : stopped?.at === 'evaluation'
          ? () => startProposal.mutate({ ...runInput, runId: kept.id })
          : undefined,
    onStartMock: selection.startMock
      ? () => void selection.startMock?.()
      : undefined,
    onWrite,
    onUndo,
    busy:
      acting ||
      keepRead.isPending ||
      startProposal.isPending ||
      proposalAsked.isFetching,
    announced,
  };

  if (!hydrated) return null;

  return (
    <>
      <ModelRunThread
        run={view}
        actions={actions}
        look="proposed"
        enterFirst={!startedWithRead}
      />
      {decideError || selection.recordError ? (
        <AlertBox className="mt-6">
          {decideError ?? selection.recordError}
        </AlertBox>
      ) : null}
    </>
  );
}
