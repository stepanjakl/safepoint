'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useStepReady } from '@/components/app-shell/runs/run-readiness';
import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { useWorkingFavicon } from '@/components/app-shell/runs/working-favicon';
// Deep import: Blode's barrel is the whole icon library.
import Bug from 'blode-icons-react/icons/bug';

import { DecisionButton } from '@/components/engine/decision-button';
import { RulesDebug, type Debugging } from '@/components/engine/rules-debug';
import { HeadIconButton } from '@/components/app-shell/head-icon-button';
import { PendingDots } from '@/components/engine/pending-dots';
import { anchorOf } from '@/components/engine/rules/card-anchor';
import {
  ASKS,
  AcceptDecision,
  DefinitionCard,
  statusOf,
  words,
  type Sentences,
} from '@/components/engine/rules/definition-card';
import type { ModelPlan } from '@/lib/models';
import { DraftControl } from '@/components/engine/rules/draft-control';
import {
  AwaitedExamples,
  AwaitedFormula,
  Crossfade,
  DraftSegments,
  activityOfDraft,
  chipOfStage,
  stageOfDefinition,
  useDraftBeatClock,
  useLeavingState,
} from '@/components/engine/rules/draft-progress';
import { useEasedCards } from '@/components/engine/rules/eased-cards';
import {
  DRAFT_POLL_MS,
  type RulesReply,
} from '@/components/engine/rules/rules-queries';
import { Lede, plural, saidBy } from '@/components/engine/trial-parts';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { Fold } from '@/components/ui/fold';
import { Pill, SEVERITY } from '@/components/ui/pill';
import { useTRPC } from '@/components/trpc/provider';
import { cx } from '@/lib/ui/cx';
import { FromModel } from '@/components/engine/rules-parts';
import {
  DataProfilePanel,
  type ProfileChange,
} from '@/components/engine/data-profile';
import type { DefinitionSubject } from '@/lib/engine/subject';
import {
  CONFIRM_FIRST,
  quotedFrom,
  type DefinitionSet,
  type DraftProgress,
} from '@/lib/engine/types';

// How far the rules have got, for the step's mark.
export type RulesProgress = {
  approved: number;
  written: number;
  total: number;
  intent: boolean;
  running: boolean;
  found: boolean;
  error: string | null;
};

const progressOf = (
  set: DefinitionSet | null,
  drafting: DraftProgress | null,
): RulesProgress => ({
  approved: set ? set.definitions.filter((d) => d.approvedAt).length : 0,
  written: set ? set.definitions.filter((d) => d.formula).length : 0,
  total: set?.definitions.length ?? 0,
  intent: set !== null && set.intentConfirmedAt !== null,
  running: drafting?.running ?? false,
  found: set !== null && set.definitions.length > 0,
  error: drafting?.error ?? null,
});

/*
  The rules of the instructions this run answers to, and the values they need:
  found by the model, then each given a formula and examples on real records.
  The person confirms the intent and accepts or denies each item as its
  examples show it; every run under the same instructions uses what is
  accepted.
*/
export function RulesStep({
  subject,
  text,
  version,
  readId,
  runId,
  modelPlan,
  onProgress,
  onReadyChange,
  debug = false,
  mock = false,
}: {
  // What the process's rules are about: its records and what is proposed.
  subject: DefinitionSubject;
  text: string;
  version: string;
  readId: string | null;
  runId?: string;
  modelPlan?: ModelPlan | null;
  onProgress: (progress: RulesProgress) => void;
  onReadyChange?: (ready: boolean) => void;
  debug?: boolean;
  mock?: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sheet = useContext(ProcessSheetActions);
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });
  // What is already found and accepted for these instructions, on arrival:
  // a new run under them starts as far as they have got. Asked again every
  // DRAFT_POLL_MS while a draft runs, even after a failed poll: a failed
  // request says nothing about the job.
  const rulesQuery = trpc.rules.get.queryOptions(
    { text, readId },
    {
      enabled: !mock,
      staleTime: mock ? Infinity : 0,
      refetchInterval: ({ state: { data } }) =>
        !mock && data?.drafting?.running ? DRAFT_POLL_MS : false,
      // A draft takes minutes and is left in a background tab: the tab's
      // working mark and the finished rules must not wait for a return.
      refetchIntervalInBackground: true,
    },
  );
  const asked = useQuery(rulesQuery);
  // Each answer lands in the query, a decision's reply as a poll's does.
  const keep = (answer: RulesReply) =>
    queryClient.setQueryData(rulesQuery.queryKey, answer);
  const [failure, setFailure] = useState<string | null>(null);
  const kept = {
    onMutate: () => setFailure(null),
    onSuccess: keep,
    onError: (error: unknown) => setFailure(saidBy(error)),
  };
  const proposeProfile = useMutation(trpc.rules.profile.mutationOptions(kept));
  const changeProfile = useMutation(
    trpc.rules.profileColumn.mutationOptions(kept),
  );
  const confirmProfile = useMutation(
    trpc.rules.confirmProfile.mutationOptions(kept),
  );
  const draft = useMutation(trpc.rules.draft.mutationOptions(kept));
  const confirmIntent = useMutation(trpc.rules.intent.mutationOptions(kept));
  const rewrite = useMutation(trpc.rules.write.mutationOptions(kept));
  const choose = useMutation(trpc.rules.choose.mutationOptions(kept));
  const setAppliesTo = useMutation(trpc.rules.appliesTo.mutationOptions(kept));
  const decide = useMutation(trpc.rules.decide.mutationOptions(kept));
  const advise = useMutation(trpc.rules.advise.mutationOptions());
  // Every answer, the panel's entry for these instructions included.
  const body = asked.data ?? null;
  useEffect(() => {
    if (body && !mock)
      queryClient.setQueriesData(trpc.rules.get.queryFilter({ text }), body);
  }, [body, mock, queryClient, trpc, text]);
  // Each answer reaches the step's mark once, where it holds rules or a draft.
  useEffect(() => {
    if (body)
      report.current(
        progressOf(
          body.kind === 'rules' ? body.set : null,
          body.drafting ?? null,
        ),
      );
  }, [body]);
  useStepReady(asked.isFetched && !asked.isFetching, onReadyChange);
  // The last rules seen stay while an action runs, so the list, and focus in
  // it, are kept.
  const [last, setLast] = useState<{
    set: DefinitionSet;
    names: Record<string, string>;
    working: Record<string, string[][]>;
    sentences: Record<string, Sentences>;
  } | null>(null);
  const current = body?.kind === 'rules' ? body : null;
  if (current && current.set !== last?.set)
    setLast({
      set: current.set,
      names: current.names,
      working: current.working,
      sentences: current.sentences,
    });
  const shown = current ?? last;
  // A draft runs on the server; its progress is the latest answer's.
  const latestDrafting = body?.drafting ?? null;
  const list = useRef<HTMLOListElement>(null);
  const leavingState = useMemo(
    () => ({ shown, drafting: latestDrafting }),
    [shown, latestDrafting],
  );
  const {
    shown: { shown: displayed, drafting },
    leaving,
  } = useLeavingState(
    list,
    leavingState,
    (previous, next) =>
      Boolean(
        previous.drafting?.running &&
        previous.shown?.set &&
        (!next.drafting?.running ||
          next.drafting?.writing !== previous.drafting?.writing ||
          next.shown?.set.definitions.filter((d) => d.formula).length !==
            previous.shown?.set.definitions.filter((d) => d.formula).length),
      ),
    true,
  );
  const set = displayed?.set ?? null;
  const names = displayed?.names ?? {};
  const working = displayed?.working ?? {};
  const sentences = displayed?.sentences ?? {};
  const draftRunning = drafting?.running ?? false;
  useWorkingFavicon(draftRunning);
  const easedChange = useMemo(
    () => ({ set, running: draftRunning, writing: drafting?.writing ?? null }),
    [set, draftRunning, drafting?.writing],
  );
  useEasedCards(list, easedChange, { enabled: true, hold: true });
  useDraftBeatClock(list);
  // The data profile as last reported; null until the server has said.
  const profile = body?.profile ?? null;
  const dataConfirmed = profile?.state === 'confirmed';
  const [profileOpen, setProfileOpen] = useState(false);
  const profileId = useId();
  const profileHeading = useRef<HTMLHeadingElement>(null);
  // From a card Accept refused for an unanswered blank, to the question.
  const showProfile = () => {
    setProfileOpen(true);
    requestAnimationFrame(() => profileHeading.current?.focus());
  };
  const busy =
    asked.isFetching ||
    [
      proposeProfile,
      changeProfile,
      confirmProfile,
      draft,
      confirmIntent,
      rewrite,
      choose,
      setAppliesTo,
      decide,
    ].some((action) => action.isPending) ||
    draftRunning;
  const writing = rewrite.isPending || draft.isPending;
  const [debugging, setDebugging] = useState<Debugging | null>(null);
  // What the server said of the last thing asked of it, where it refused.
  const said = failure ?? (asked.isError ? saidBy(asked.error) : null);
  // The server has answered, whatever it answered.
  const answered =
    asked.isSuccess ||
    (asked.isError && said !== null) ||
    (mock && body !== null);
  const progress = set ? progressOf(set, drafting) : null;
  // Every definition accepted and the intent confirmed: nothing waits here.
  const complete =
    set !== null &&
    progress !== null &&
    progress.total > 0 &&
    progress.approved === progress.total &&
    set.intentConfirmedAt !== null;
  // In automatic mode, drafts once as soon as the read and confirmed profile
  // are ready and no rules or draft exist yet.
  const autoDrafted = useRef(false);
  useEffect(() => {
    if (
      debug ||
      mock ||
      autoDrafted.current ||
      !readId ||
      !dataConfirmed ||
      !asked.isSuccess ||
      current !== null ||
      latestDrafting !== null
    )
      return;
    autoDrafted.current = true;
    draft.mutate({ text, version, readId, runId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debug,
    mock,
    readId,
    dataConfirmed,
    asked.isSuccess,
    current,
    latestDrafting,
  ]);
  const [showAll, setShowAll] = useState(false);
  const cardsId = useId();
  const stages = set
    ? set.definitions.map((item) => ({
        item,
        stage: stageOfDefinition(set.definitions, item, drafting),
      }))
    : [];
  const showSegments = Boolean(
    set && set.definitions.length > 0 && (draftRunning || drafting?.error),
  );
  const cards = set ? (
    <>
      {showSegments ? (
        <DraftSegments stages={stages} error={Boolean(drafting?.error)} />
      ) : null}
      <div className={cx(ASKS, 'grid gap-3 p-4')}>
        <FromModel label="The intent, as the model reads it">
          <p className="text-body">{set.intent}</p>
        </FromModel>
        <div className="flex flex-wrap items-center gap-2">
          <AcceptDecision
            accepted={set.intentConfirmedAt !== null}
            busy={busy}
            onAccept={() => {
              if (mock && current) {
                keep({
                  ...current,
                  set: {
                    ...current.set,
                    intentConfirmedAt: new Date().toISOString(),
                  },
                });
                return;
              }
              confirmIntent.mutate({ text });
            }}
          />
          {!set.intentConfirmedAt && sheet ? (
            <DecisionButton decision="deny" onPress={sheet.showInstructions}>
              Deny: edit the instructions
            </DecisionButton>
          ) : null}
        </div>
      </div>

      <div className="rules-list grid gap-4">
        <PendingDots
          pending={stages
            .filter(
              ({ item, stage }) =>
                !item.approvedAt &&
                (stage === 'written' || stage === 'unreached'),
            )
            .map(({ item }) => ({
              id: item.id,
              name: item.name,
              status: statusOf(item).label,
              severity: SEVERITY[statusOf(item).tone],
            }))}
          anchorOf={anchorOf}
        />
        <ol
          ref={list}
          className="draft-arriving grid gap-3"
          data-draft-holds-scroll=""
          aria-label="Calculations and checks"
        >
          {stages.map(({ item, stage }) => {
            const chip = chipOfStage(stage, 'blue-dashed');
            const status = statusOf(item);
            const activity =
              stage === 'writing'
                ? activityOfDraft(drafting?.step ?? '', Boolean(item.formula))
                : null;
            return (
              <DefinitionCard
                key={item.id}
                subject={subject}
                item={item}
                quoted={words(text).includes(words(item.text))}
                names={names}
                working={working[item.id] ?? []}
                sentences={sentences[item.id]}
                reads={set.definitions.filter((d) => item.uses.includes(d.id))}
                busy={busy}
                canWrite={readId !== null}
                onWrite={() =>
                  !mock &&
                  readId &&
                  rewrite.mutate({ text, readId, id: item.id, runId })
                }
                chip={
                  <Crossfade id={stage} className="draft-chip">
                    {chip ?? <Pill tone={status.tone}>{status.label}</Pill>}
                  </Crossfade>
                }
                activity={
                  activity ? (
                    <p
                      className="text-meta text-muted-strong"
                      data-leaving={leaving ? '' : undefined}
                    >
                      <Crossfade id={activity}>{activity}</Crossfade>
                    </p>
                  ) : undefined
                }
                awaitedFormula={
                  stage === 'writing' && !item.formula ? (
                    <AwaitedFormula live leaving={leaving} />
                  ) : undefined
                }
                awaitedExamples={
                  stage === 'writing' && !item.examples.length ? (
                    <AwaitedExamples live leaving={leaving} />
                  ) : undefined
                }
                onDecide={(decision, note) => {
                  if (mock && current) {
                    const now = new Date().toISOString();
                    keep({
                      ...current,
                      set: {
                        ...current.set,
                        definitions: current.set.definitions.map((d) =>
                          d.id === item.id
                            ? decision === 'accept'
                              ? {
                                  ...d,
                                  approvedAt: now,
                                  deniedAt: null,
                                  denial: null,
                                }
                              : {
                                  ...d,
                                  approvedAt: null,
                                  deniedAt: now,
                                  denial: note ?? null,
                                }
                            : d,
                        ),
                      },
                    });
                    return;
                  }
                  decide.mutate({ text, id: item.id, decision, note });
                }}
                onChoose={(index) =>
                  !mock && choose.mutate({ text, id: item.id, index })
                }
                onAdvise={() =>
                  advise.mutateAsync({ text, id: item.id, runId }).then(
                    ({ advice }) => advice,
                    (error: unknown) => {
                      throw new Error(saidBy(error) ?? 'No answer came back.');
                    },
                  )
                }
                onShowProfile={profile ? showProfile : undefined}
                onSetAppliesTo={(value) =>
                  !mock && setAppliesTo.mutate({ text, id: item.id, value })
                }
                debug={
                  debug ? (
                    <HeadIconButton
                      label={`Debug ${item.name}`}
                      tooltip={{ label: 'Debug this rule' }}
                      size="alone"
                      wash="none"
                      onPress={() =>
                        setDebugging({ kind: 'rule', id: item.id })
                      }
                    >
                      <Bug className="size-4" aria-hidden />
                    </HeadIconButton>
                  ) : undefined
                }
              />
            );
          })}
        </ol>
      </div>
    </>
  ) : null;

  return (
    <div className="rules-review grid gap-4">
      <RulesDebug
        debugging={debugging}
        text={text}
        readId={readId}
        onClose={() => setDebugging(null)}
      />
      <Lede>
        The model turns your instructions into calculations and checks, and
        tries each on records from the data. Accept the ones it got right; every
        run under these instructions will use them.
      </Lede>

      {profile ? (
        // One panel throughout, so what it says aloud and where focus is
        // survive its changes; folded away once the rules are drafted on it.
        <div className="grid gap-3">
          {set && dataConfirmed ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-dense">The data’s columns are confirmed.</p>
              <Button
                size="medium"
                aria-expanded={profileOpen}
                aria-controls={profileId}
                onPress={() => setProfileOpen(!profileOpen)}
              >
                {profileOpen
                  ? 'Hide the data’s columns'
                  : 'Show the data’s columns'}
              </Button>
            </div>
          ) : null}
          <Fold open={!set || !dataConfirmed || profileOpen} id={profileId}>
            <DataProfilePanel
              state={profile}
              busy={busy}
              canRead={readId !== null}
              drafted={set !== null}
              headingRef={profileHeading}
              className={ASKS}
              onChange={(change: ProfileChange) => {
                // A person at work in it keeps it open.
                setProfileOpen(true);
                // Only proposing one reads the data: the others take no read.
                if (change.action === 'profile') {
                  if (readId) proposeProfile.mutate({ text, readId });
                } else if (change.action === 'confirmProfile')
                  confirmProfile.mutate({ text });
                else
                  changeProfile.mutate({
                    text,
                    column: change.column,
                    label: change.label,
                    type: change.type,
                    blank: change.blank,
                  });
              }}
            />
          </Fold>
        </div>
      ) : null}

      {debug ? (
        /* Scaffolding for trying the step, as the read's setup is. */
        <section
          aria-label="Draft setup"
          className="trial-setup rounded-shell grid gap-3 p-4"
        >
          {set ? (
            <div>
              <Button
                size="medium"
                onPress={() => setDebugging({ kind: 'draft' })}
              >
                <Bug className="size-4" aria-hidden />
                Debug the draft
              </Button>
            </div>
          ) : null}
          <DraftControl
            kept={set?.definitions.length ?? 0}
            accepted={progress?.approved ?? 0}
            canDraft={readId !== null && dataConfirmed}
            busy={busy}
            mock={mock}
            modelPlan={modelPlan}
            onDraft={(model) =>
              !mock &&
              readId &&
              draft.mutate({
                text,
                version,
                readId,
                runId,
                ...(model ? { model } : {}),
              })
            }
          />
          {!readId ? (
            <p className="text-dense text-muted">
              Read the data first: the examples are worked out on it.
            </p>
          ) : profile && !dataConfirmed ? (
            <p className="text-dense text-muted">{CONFIRM_FIRST}</p>
          ) : null}
          {/* Always in the page, so its changes are read out; taking no room
              while it has nothing to say. */}
          <p
            role="status"
            className={
              writing || drafting?.running || said !== null || drafting?.error
                ? 'text-meta text-muted'
                : 'sr-only'
            }
          >
            {drafting?.running
              ? drafting.step
              : writing
                ? 'Working… writing one can take a minute.'
                : (said ?? drafting?.error ?? '')}
          </p>
        </section>
      ) : (
        <>
          {!draftRunning && (said !== null || drafting?.error) ? (
            <AlertBox
              title="Could not draft the rules"
              action={
                readId !== null && dataConfirmed ? (
                  <Button
                    size="small"
                    isDisabled={busy}
                    onPress={() =>
                      !mock && draft.mutate({ text, version, readId, runId })
                    }
                  >
                    Try again
                  </Button>
                ) : null
              }
            >
              {said ?? drafting?.error}
            </AlertBox>
          ) : null}
          <p
            role="status"
            className={
              writing || drafting?.running ? 'text-meta text-muted' : 'sr-only'
            }
          >
            {drafting?.running
              ? drafting.step
              : writing
                ? 'Working… writing one can take a minute.'
                : ''}
          </p>
        </>
      )}

      {!set ? (
        answered ? (
          <p className="text-dense text-muted">
            Nothing drafted for these instructions yet.
          </p>
        ) : null
      ) : complete ? (
        // Accepted whole: one line, as the Rules tab shows the rulebook.
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-dense">
              Using the accepted rules:{' '}
              {plural(
                set.definitions.filter((d) => d.result === 'number').length,
                'calculation',
              )}
              ,{' '}
              {plural(
                set.definitions.filter((d) => d.result === 'check').length,
                'check',
              )}
              .
            </p>
            {sheet?.showRules ? (
              <Button size="medium" onPress={sheet.showRules}>
                Open the Rules tab
              </Button>
            ) : null}
            <Button
              size="medium"
              aria-expanded={showAll}
              aria-controls={cardsId}
              onPress={() => setShowAll(!showAll)}
            >
              {showAll ? 'Hide the rules' : 'Show the rules'}
            </Button>
          </div>
          <Fold open={showAll} id={cardsId} className="grid gap-4">
            {cards}
          </Fold>
        </>
      ) : (
        <>
          <SetAside set={set} />
          {set.definitions.every((d) => d.result === 'check') ? (
            <p className="text-dense text-state-advisory">
              No calculations were found, so Calculate will have nothing to
              show. If the instructions explain how to work a number out, draft
              again.
            </p>
          ) : null}
          {cards}
        </>
      )}
    </div>
  );
}

// What the model read as only context, which is where a rule it missed would
// be: code can tell a sentence was accounted for, not that it was read rightly.
function SetAside({ set }: { set: DefinitionSet }) {
  const context = set.accounting?.filter((a) => a.kind === 'context') ?? [];
  if (!context.length) return null;
  return (
    <section aria-label="Set aside as context" className="grid gap-1">
      <p className="text-dense">
        Read as context, not as a rule or a calculation. Should any of these be
        one?
      </p>
      <ul className="text-meta text-muted grid list-disc gap-0.5 pl-4">
        {context.map((a) => (
          <li key={a.sentence}>
            {a.sentence}
            {quotedFrom(set.definitions, a.sentence).length ? (
              <>
                {' '}
                <span className="text-muted-strong">
                  Gives a number or group to{' '}
                  {quotedFrom(set.definitions, a.sentence)
                    .map((d) => d.name)
                    .join(', ')}
                  .
                </span>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
