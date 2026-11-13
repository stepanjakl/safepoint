'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useId, useRef, useState } from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
// Deep import: Blode's barrel is the whole icon library.
import Bug from 'blode-icons-react/icons/bug';

import { DecisionButton } from '@/components/brunch-orders/decision-button';
import {
  RulesDebug,
  type Debugging,
} from '@/components/brunch-orders/rules-debug';
import { HeadIconButton } from '@/components/app-shell/head-icon-button';
import { PendingDots } from '@/components/brunch-orders/pending-dots';
import { anchorOf } from '@/components/brunch-orders/rules/card-anchor';
import {
  ASKS,
  AcceptDecision,
  DefinitionCard,
  statusOf,
  words,
  type Sentences,
} from '@/components/brunch-orders/rules/definition-card';
import { DraftControl } from '@/components/brunch-orders/rules/draft-control';
import {
  DRAFT_POLL_MS,
  type RulesReply,
} from '@/components/brunch-orders/rules/rules-queries';
import { Lede, plural, saidBy } from '@/components/brunch-orders/trial-parts';
import { Button } from '@/components/ui/button';
import { Fold } from '@/components/ui/fold';
import { Loader } from '@/components/ui/loader';
import { SEVERITY } from '@/components/ui/pill';
import { useLoader } from '@/components/ui/working-mark';
import { useTRPC } from '@/components/trpc/provider';
import { cx } from '@/lib/cx';
import { FromModel } from '@/components/brunch-orders/rules-parts';
import {
  DataProfilePanel,
  type ProfileChange,
} from '@/components/brunch-orders/data-profile';
import {
  CONFIRM_FIRST,
  quotedFrom,
  type DefinitionSet,
} from '@/lib/definitions/types';

// How far the rules have got, for the step's mark.
export type RulesProgress = {
  approved: number;
  total: number;
  intent: boolean;
};

const progressOf = (set: DefinitionSet): RulesProgress => ({
  approved: set.definitions.filter((d) => d.approvedAt).length,
  total: set.definitions.length,
  intent: set.intentConfirmedAt !== null,
});

/*
  The rules of the instructions this run answers to, and the values they need:
  found by the model, then each given a formula and examples on real records.
  The person confirms the intent and accepts or denies each item as its
  examples show it; every run under the same instructions uses what is
  accepted.
*/
export function RulesStep({
  text,
  version,
  readId,
  onProgress,
}: {
  text: string;
  version: string;
  readId: string | null;
  onProgress: (progress: RulesProgress) => void;
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
      staleTime: 0,
      refetchInterval: ({ state: { data } }) =>
        data?.drafting?.running ? DRAFT_POLL_MS : false,
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
    if (body)
      queryClient.setQueriesData(trpc.rules.get.queryFilter({ text }), body);
  }, [body, queryClient, trpc, text]);
  // Each answer reaches the step's mark once, where it holds rules.
  useEffect(() => {
    if (body?.kind === 'rules') report.current(progressOf(body.set));
  }, [body]);
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
  const set = shown?.set ?? null;
  const names = shown?.names ?? {};
  const working = shown?.working ?? {};
  const sentences = shown?.sentences ?? {};
  // A draft runs on the server; its progress is the latest answer's.
  const drafting = body?.drafting ?? null;
  const draftRunning = drafting?.running ?? false;
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
  // Writing is a wait, not a status the rule has: the card's status gives
  // way to the loader while its rule is written (behind useLoader's delay).
  const ruleLoader = useLoader(Boolean(drafting?.running && drafting.writing));
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
  const answered = asked.isSuccess || (asked.isError && said !== null);
  const progress = set ? progressOf(set) : null;
  // Every definition accepted and the intent confirmed: nothing waits here.
  const complete =
    set !== null &&
    progress !== null &&
    progress.total > 0 &&
    progress.approved === progress.total &&
    set.intentConfirmedAt !== null;
  const [showAll, setShowAll] = useState(false);
  const cardsId = useId();
  const cards = set ? (
    <>
      <div className={cx(ASKS, 'grid gap-3 p-4')}>
        <FromModel label="The intent, as the model reads it">
          <p className="text-body">{set.intent}</p>
        </FromModel>
        <div className="flex flex-wrap items-center gap-2">
          <AcceptDecision
            accepted={set.intentConfirmedAt !== null}
            busy={busy}
            onAccept={() => confirmIntent.mutate({ text })}
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
          pending={set.definitions
            .filter((d) => !d.approvedAt)
            .map((d) => ({
              id: d.id,
              name: d.name,
              status: statusOf(d).label,
              severity: SEVERITY[statusOf(d).tone],
            }))}
          anchorOf={anchorOf}
        />
        <ol className="grid gap-3" aria-label="Calculations and checks">
          {set.definitions.map((item) => (
            <DefinitionCard
              key={item.id}
              item={item}
              quoted={words(text).includes(words(item.text))}
              names={names}
              working={working[item.id] ?? []}
              sentences={sentences[item.id]}
              reads={set.definitions.filter((d) => item.uses.includes(d.id))}
              busy={busy}
              canWrite={readId !== null}
              onWrite={() =>
                readId && rewrite.mutate({ text, readId, id: item.id })
              }
              {...(drafting?.running && drafting.writing === item.id
                ? {
                    chip:
                      ruleLoader.phase && ruleLoader.phase !== 'waiting' ? (
                        <Loader
                          phase={ruleLoader.phase}
                          label="Writing…"
                          announce={false}
                          className="text-meta"
                        />
                      ) : undefined,
                    activity: item.formula ? (
                      <p className="text-meta text-muted">
                        Being written again. This is the version before it,
                        until the new one is ready.
                      </p>
                    ) : null,
                  }
                : {})}
              onDecide={(decision, note) =>
                decide.mutate({ text, id: item.id, decision, note })
              }
              onChoose={(index) => choose.mutate({ text, id: item.id, index })}
              onAdvise={() =>
                advise.mutateAsync({ text, id: item.id }).then(
                  ({ advice }) => advice,
                  (error: unknown) => {
                    throw new Error(saidBy(error) ?? 'No answer came back.');
                  },
                )
              }
              onShowProfile={profile ? showProfile : undefined}
              onSetAppliesTo={(value) =>
                setAppliesTo.mutate({ text, id: item.id, value })
              }
              debug={
                <HeadIconButton
                  label={`Debug ${item.name}`}
                  tooltip={{ label: 'Debug this rule' }}
                  size="alone"
                  wash="none"
                  onPress={() => setDebugging({ kind: 'rule', id: item.id })}
                >
                  <Bug className="size-4" aria-hidden />
                </HeadIconButton>
              }
            />
          ))}
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

      {/* Scaffolding for trying the step, as the read's setup is. */}
      <section
        aria-label="Draft setup"
        className="brunch-trial rounded-shell grid gap-3 p-4"
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
          onDraft={(model) =>
            readId &&
            draft.mutate({ text, version, readId, ...(model ? { model } : {}) })
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
