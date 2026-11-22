'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  settledOnce,
  useStepReady,
} from '@/components/app-shell/runs/run-readiness';
import { ModelLimits } from '@/components/engine/model-limits';
import { ModelSelect } from '@/components/engine/rules/model-select';
import { StaleRules } from '@/components/engine/stale-rules';
import { Lede } from '@/components/engine/trial-parts';
import type { RunProcessId } from '@/components/app-shell/runs/kept-runs';
import { useTRPC } from '@/components/trpc/provider';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { asReviewed as reviewed } from '@/lib/engine/reviewed';
import type { Proposal } from '@/lib/engine/types';
import type { DefinitionSubject } from '@/lib/engine/subject';
import {
  DRAFTING_MODELS,
  GEMINI_FIND,
  modelPlanLabel,
  modelsFor,
  type DraftingModel,
  type ModelPlan,
} from '@/lib/models';

import { ProposalTable } from './proposal-table';
import type {
  Decision,
  DecidedReply,
  DecisionsReply,
  Evaluation,
  CheckReply,
  ProposalReply,
  ProposeProgress,
} from './types';
import { needsPerson } from './verdict';

const POLL_MS = 2000;
const NO_DECISIONS: Record<string, Decision> = {};

// A decision as the server is asked to keep it.
const askedOf = (key: string, decision: Decision) =>
  decision.kind === 'change'
    ? { key, kind: 'change' as const, values: decision.values ?? {} }
    : { key, kind: decision.kind };

/*
  Propose: for every record, the values the model would set, why, and how the
  accepted checks find them -- and the person's decision on each, in the same
  table. The verdicts are code's. A record passes on approval; one a blocking
  check stops can only be changed to values that pass, or rejected.

  With evaluation `model` there is no rulebook and nothing to set up: the
  model proposes as soon as the step opens, and a record it is unsure of asks
  for a person, since no check can.

  The decisions are the server's (`decisions.*`), kept per record on the run.
  A decision shows at once, so a person deciding record after record is never
  made to wait, and is taken back if the server refuses it: its refusal is said
  where this step speaks, and the record is as the server holds it. Requests
  go one after another, so the server's answers arrive in the order they were
  asked, and what the step reports as decided (which gates the write) is only
  ever what the server holds.
*/
export function ProposeStep({
  subject,
  text,
  readId,
  rulebook,
  evaluation = 'rules',
  run: kept,
  modelPlan,
  onProgress,
  onReadyChange,
  onMoveRules,
  debug = false,
  mock = false,
}: {
  // The process's subject: what each record's proposal sets.
  subject: DefinitionSubject;
  text: string;
  readId: string;
  // The rulebook this run calculated on; with no rulebook, none.
  rulebook?: string;
  evaluation?: Evaluation;
  // The run these decisions are kept on, by the id the server gave it.
  run: { process: RunProcessId; runId: string };
  modelPlan?: ModelPlan | null;
  onProgress: (progress: ProposeProgress) => void;
  onReadyChange?: (ready: boolean) => void;
  // Back to Calculate, on the current rules, when these no longer fit.
  onMoveRules?: () => void;
  debug?: boolean;
  mock?: boolean;
}) {
  const automatic = evaluation === 'model';
  const autoStart = automatic || !debug;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });
  const [model, setModel] = useState<DraftingModel>(DRAFTING_MODELS[0]!);
  const run = { text, readId, rulebook, evaluation };
  const startInput = { ...run, runId: kept.runId };
  const quotaModel = modelPlan
    ? modelsFor({ plan: modelPlan }, [GEMINI_FIND])[0]
    : model;
  const decidedOn = { process: kept.process, runId: kept.runId };
  // Asked once per read and rulebook, and again every POLL_MS while the job
  // runs, even after a failed poll: a failed request says nothing about it.
  // Asked afresh each time the step opens, since the job may have moved on;
  // the last answer is kept and shown meanwhile.
  const proposalQuery = trpc.propose.get.queryOptions(run, {
    enabled: !mock,
    staleTime: mock ? Infinity : 0,
    refetchInterval: ({ state: { data } }) =>
      !mock && data?.kind === 'proposal' && data.progress?.running
        ? POLL_MS
        : false,
    // As a draft is: left in a background tab, it still has to finish there.
    refetchIntervalInBackground: true,
  });
  const asked = useQuery(proposalQuery);
  // Starting a job answers as a poll does, into the same query.
  const start = useMutation(
    trpc.propose.start.mutationOptions({
      onSuccess: (answer) =>
        queryClient.setQueryData(proposalQuery.queryKey, answer),
    }),
  );
  const answer: ProposalReply | null = asked.data ?? null;
  const [last, setLast] = useState<Extract<
    ProposalReply,
    { kind: 'proposal' }
  > | null>(null);
  const current = answer?.kind === 'proposal' ? answer : null;
  if (current && current !== last) setLast(current);
  const shown = current ?? last;
  const proposal = asReviewed(shown?.proposal ?? null, evaluation);
  const running = shown?.progress?.running ?? false;
  // A check answers into the rows, but when it is refused or stale it speaks
  // here, as the latest answer of any kind did: until another answer lands
  // (`since` is the proposal answer it was made beside).
  const [checking, setChecking] = useState(0);
  const [spoken, setSpoken] = useState<{
    since: number;
    stale?: Extract<CheckReply, { kind: 'stale' }>;
    error?: string;
  } | null>(null);
  const speak = (
    what: {
      stale?: Extract<CheckReply, { kind: 'stale' }>;
      error?: string;
    } | null,
  ) =>
    setSpoken(
      what && {
        ...what,
        since:
          queryClient.getQueryState(proposalQuery.queryKey)?.dataUpdatedAt ?? 0,
      },
    );
  const notice = spoken?.since === asked.dataUpdatedAt ? spoken : null;
  const stale = notice?.stale ?? (answer?.kind === 'stale' ? answer : null);
  // Nothing is proposed on values a check has not yet answered for.
  const busy = start.isPending || asked.isFetching || checking > 0;

  // What the server holds of the decisions, asked afresh each time the step
  // opens. A decision answers into it, as a proposal answers into its own.
  const decidedQuery = trpc.decisions.current.queryOptions(decidedOn, {
    enabled: !mock,
    staleTime: mock ? Infinity : 0,
  });
  const decidedAsked = useQuery(decidedQuery);
  // An answer just given shows from the moment it lands, ahead of the query's
  // own notice of it, so a row is never drawn undecided in between.
  const [landed, setLanded] = useState<{
    at: number;
    answer: DecisionsReply;
  } | null>(null);
  const held: DecisionsReply | null =
    landed && landed.at > decidedAsked.dataUpdatedAt
      ? landed.answer
      : (decidedAsked.data ?? null);
  // Decisions belong to the proposal they were made on.
  const heldOn = (at: string | undefined | null) =>
    at && held?.proposal?.at === at ? held.decisions : NO_DECISIONS;
  const heldNow = heldOn(proposal?.at);
  // A proposal the decisions are not on yet (a new one was made): asked again,
  // once for each, which is what says there are none on it.
  const refreshed = useRef(new Set<string>());
  useEffect(() => {
    const at = proposal?.at;
    if (!at || !decidedAsked.data || decidedAsked.isFetching) return;
    if (decidedAsked.data.proposal?.at === at || refreshed.current.has(at))
      return;
    refreshed.current.add(at);
    void queryClient.invalidateQueries({ queryKey: decidedQuery.queryKey });
  }, [proposal?.at, decidedAsked, decidedQuery.queryKey, queryClient]);

  // Decisions made and not yet answered, over what the server holds: a
  // decision, or null for one taken back. Each is its request's, so a later
  // press on the same record is not undone by an earlier answer.
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
  // One after another: each answer says what the server holds after it.
  const scope = { scope: { id: `decisions:${kept.runId}` } };
  const record = useMutation(trpc.decisions.record.mutationOptions(scope));
  const recordMany = useMutation(
    trpc.decisions.recordMany.mutationOptions(scope),
  );
  const withdraw = useMutation(trpc.decisions.withdraw.mutationOptions(scope));

  const progressOf = (
    next: Record<string, Decision>,
    from = proposal,
    isRunning = running,
    failed = false,
  ): ProposeProgress => {
    const records = from ? Object.entries(from.records) : [];
    return {
      fingerprint: from?.fingerprint ?? rulebook ?? '',
      proposedAt: from?.at ?? null,
      running: isRunning,
      failed,
      total: records.length,
      needYou: records.filter(
        ([key, record]) => !next[key] && needsPerson(record.verdict),
      ).length,
      writes: records.filter(([key, record]) => {
        const decision = next[key];
        return (
          decision &&
          decision.kind !== 'reject' &&
          (decision.values ?? record.values) !== null
        );
      }).length,
      decisions: next,
    };
  };
  // Each answer is reported, held to the decisions the server holds: never a
  // decision still being asked, so "all decided" is what is kept.
  const proposalFailed =
    !proposal &&
    !running &&
    !start.isPending &&
    Boolean(start.error || asked.error || shown?.progress?.error);
  useEffect(() => {
    if (answer?.kind !== 'proposal' && !proposalFailed) return;
    const current = answer?.kind === 'proposal' ? answer : null;
    report.current(
      progressOf(
        heldOn(current?.proposal?.at),
        asReviewed(current?.proposal ?? null, evaluation),
        current?.progress?.running ?? false,
        proposalFailed,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, held, proposalFailed]);
  useStepReady(settledOnce(asked) && settledOnce(decidedAsked), onReadyChange);

  // Automatic: proposes once, when nothing is kept, running or failed.
  const proposed = useRef(false);
  useEffect(() => {
    if (
      !autoStart ||
      mock ||
      proposed.current ||
      answer?.kind !== 'proposal' ||
      answer.proposal ||
      answer.progress
    )
      return;
    proposed.current = true;
    start.mutate(startInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, mock, answer]);

  const [announced, setAnnounced] = useState('');
  // Several at once where a person decides several (approve all ready). They
  // show at once; the server's answer lands in the query, or the refusal is
  // said and they are taken back.
  const decide = (changes: Record<string, Decision | null>, words: string) => {
    if (!proposal) return;
    if (mock) {
      const next = { ...decisions };
      for (const [key, decision] of Object.entries(changes))
        if (decision) next[key] = decision;
        else delete next[key];
      const reply: DecisionsReply = {
        kind: 'decisions',
        proposal: { id: 1, at: proposal.at },
        decisions: next,
      };
      setLanded({ at: Date.now(), answer: reply });
      queryClient.setQueryData(decidedQuery.queryKey, reply);
      setAnnounced(words);
      return;
    }
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
    let refused: Parameters<typeof speak>[0] = null;
    void Promise.allSettled(
      asking.map((request) =>
        request.then((reply) => {
          if (reply.kind === 'stale') refused ??= { stale: reply };
          else {
            setLanded({ at: Date.now(), answer: reply });
            queryClient.setQueryData(decidedQuery.queryKey, reply);
          }
        }),
      ),
    ).then((results) => {
      const failed = results.find((result) => result.status === 'rejected');
      if (failed)
        refused ??= {
          error:
            failed.reason instanceof Error
              ? failed.reason.message
              : 'The request failed.',
        };
      // Whatever was not kept goes back to how the server holds it.
      setPending((now) =>
        Object.fromEntries(
          Object.entries(now).filter(([, one]) => one.request !== mine),
        ),
      );
      if (refused) {
        speak(refused);
        void queryClient.invalidateQueries({ queryKey: decidedQuery.queryKey });
      }
    });
  };
  const [confirming, setConfirming] = useState(false);
  const hasDecisions = Object.keys(decisions).length > 0;
  const table =
    proposal && shown ? (
      <ProposalTable
        fields={subject.proposal}
        source={subject.data.source}
        proposal={proposal}
        names={shown.names}
        calculated={shown.calculated}
        decisions={decisions}
        readId={readId}
        announced={announced}
        onDecide={decide}
        onCheck={(key, values) => {
          if (mock)
            return Promise.resolve({
              kind: 'check',
              verdict: 'ready',
              checks: [],
            });
          setChecking((count) => count + 1);
          return queryClient
            .fetchQuery(
              trpc.propose.check.queryOptions({ ...run, key, values }),
            )
            .then(
              (reply) => {
                speak(reply.kind === 'stale' ? { stale: reply } : null);
                return reply;
              },
              (error: Error) => {
                speak({ error: error.message });
                return null;
              },
            )
            .finally(() => setChecking((count) => count - 1));
        }}
      />
    ) : null;

  const failure =
    notice?.error ??
    start.error?.message ??
    asked.error?.message ??
    decidedAsked.error?.message ??
    (!running ? (shown?.progress?.error ?? null) : null);

  if (automatic) {
    return (
      <div className="grid gap-4">
        {failure ? (
          <AlertBox
            title="Could not finish the proposal"
            action={
              <Button
                size="small"
                isDisabled={running || busy}
                onPress={() => start.mutate(startInput)}
              >
                Try again
              </Button>
            }
          >
            {failure}
          </AlertBox>
        ) : null}
        <p
          role="status"
          className={proposal && !running ? 'sr-only' : 'text-dense text-muted'}
        >
          {running
            ? `Working out the ${subject.proposal
                .map((field) => `${field.label}s`)
                .join(' and ')} from the instructions…`
            : !proposal && !failure
              ? 'Getting the proposal…'
              : ''}
        </p>
        {table}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Lede>
        The model proposes, for every record, what to set and why, trying its
        values against the accepted checks first. The app checks each again; you
        approve, change or reject each one.
      </Lede>
      {stale && onMoveRules ? (
        <StaleRules stale={stale} onMove={onMoveRules} />
      ) : debug ? (
        (notice?.error ?? start.error ?? asked.error ?? decidedAsked.error) ? (
          <AlertBox>
            {notice?.error ??
              (start.error ?? asked.error ?? decidedAsked.error)?.message}
          </AlertBox>
        ) : null
      ) : failure ? (
        <AlertBox
          title="Could not finish the proposal"
          action={
            <Button
              size="small"
              isDisabled={running || busy}
              onPress={() => !mock && start.mutate(startInput)}
            >
              Try again
            </Button>
          }
        >
          {failure}
        </AlertBox>
      ) : null}
      {debug ? (
        /* Scaffolding for trying the step, as the other steps' setups are. */
        <section
          aria-label="Propose setup"
          className="trial-setup rounded-shell grid gap-3 p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            {modelPlan ? (
              <p className="text-meta text-muted">
                Using {modelPlanLabel(modelPlan)}
              </p>
            ) : (
              <ModelSelect model={model} busy={running} onChange={setModel} />
            )}
            {confirming ? (
              <>
                <Button
                  variant="primary"
                  autoFocus
                  onPress={() => {
                    setConfirming(false);
                    start.mutate({
                      ...startInput,
                      model: modelPlan ? undefined : model,
                    });
                  }}
                >
                  Propose again
                </Button>
                <Button onPress={() => setConfirming(false)}>Cancel</Button>
              </>
            ) : (
              <Button
                variant={proposal ? 'secondary' : 'primary'}
                isDisabled={running || busy}
                onPress={() =>
                  hasDecisions
                    ? setConfirming(true)
                    : start.mutate({
                        ...startInput,
                        model: modelPlan ? undefined : model,
                      })
                }
              >
                {proposal ? 'Propose again' : 'Propose'}
              </Button>
            )}
          </div>
          {quotaModel ? (
            <ModelLimits model={quotaModel} enabled={!mock} />
          ) : null}
          <p
            role="status"
            className={
              running || shown?.progress?.error
                ? 'text-meta text-muted'
                : 'sr-only'
            }
          >
            {running
              ? (shown?.progress?.step ?? 'Proposing…')
              : (shown?.progress?.error ?? '')}
          </p>
          {confirming ? (
            <p className="text-meta text-muted max-w-prose">
              A new proposal starts afresh: the decisions made on this one go.
            </p>
          ) : null}
        </section>
      ) : (
        <p
          role="status"
          className={
            running || (!proposal && !failure && !stale)
              ? 'text-dense text-muted'
              : 'sr-only'
          }
        >
          {running
            ? (shown?.progress?.step ?? 'Proposing…')
            : !proposal && !failure && !stale
              ? 'Getting the proposal…'
              : ''}
        </p>
      )}
      {table}
    </div>
  );
}

// With no rulebook, a record the model is unsure of is one a person decides:
// no check can say so instead (the server judges a decision by the same rule).
function asReviewed(
  proposal: Proposal | null,
  evaluation: Evaluation,
): Proposal | null {
  if (!proposal || evaluation === 'rules') return proposal;
  return {
    ...proposal,
    records: Object.fromEntries(
      Object.entries(proposal.records).map(([key, record]) => [
        key,
        reviewed(record, evaluation),
      ]),
    ),
  };
}
