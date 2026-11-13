'use client';

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
import { adviceFor } from '@/components/brunch-orders/rules/versions-to-choose';
import { Lede, plural, useTrial } from '@/components/brunch-orders/trial-parts';
import { Button } from '@/components/ui/button';
import { Fold } from '@/components/ui/fold';
import { Loader } from '@/components/ui/loader';
import { SEVERITY } from '@/components/ui/pill';
import { useLoader } from '@/components/ui/working-mark';
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
  type DraftProgress,
  type ProfileState,
} from '@/lib/definitions/types';

// Every reply says whether a draft is running on the server, and how far,
// and how the data profile stands.
type RulesResponse = {
  drafting?: DraftProgress | null;
  profile?: ProfileState;
} & (
  | {
      kind: 'rules';
      set: DefinitionSet;
      names: Record<string, string>;
      // The app's own working of each example, by definition.
      working: Record<string, string[][]>;
      // Each check's sentence, and each version's, by definition.
      sentences?: Record<string, Sentences>;
    }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
);

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

// How often to ask how far a draft on the server has got.
const DRAFT_POLL_MS = 2_000;

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
  const rules = useTrial<RulesResponse>('/api/dev/brunch-orders/rules');
  const sheet = useContext(ProcessSheetActions);
  const { run } = rules;
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });
  // What is already found and accepted for these instructions, on arrival:
  // a new run under them starts as far as they have got.
  useEffect(() => {
    void run({ action: 'get', text, readId }).then((response) => {
      if (response?.kind === 'rules') report.current(progressOf(response.set));
    });
  }, [run, text, readId]);
  const body = rules.state.kind === 'done' ? rules.state.body : null;
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
      working: current.working ?? {},
      sentences: current.sentences ?? {},
    });
  const shown = current ?? last;
  const set = shown?.set ?? null;
  const names = shown?.names ?? {};
  const working = shown?.working ?? {};
  const sentences = shown?.sentences ?? {};
  // A draft runs on the server; the last progress reported stays while the
  // next question is out.
  const [drafting, setDrafting] = useState<DraftProgress | null>(null);
  const reported = body?.drafting ?? null;
  if (body && JSON.stringify(reported) !== JSON.stringify(drafting))
    setDrafting(reported);
  const draftRunning = drafting?.running ?? false;
  // The data profile as last reported; null until the route has said.
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const reportedProfile = body?.profile;
  if (
    reportedProfile &&
    JSON.stringify(reportedProfile) !== JSON.stringify(profile)
  )
    setProfile(reportedProfile);
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
  const busy = rules.state.kind === 'running' || draftRunning;
  const [writing, setWriting] = useState(false);
  const [debugging, setDebugging] = useState<Debugging | null>(null);
  const act = (request: Record<string, unknown>) => {
    setWriting(request.action === 'write' || request.action === 'draft');
    void run({ ...request, text })
      .then((response) => {
        if (response?.kind === 'rules') onProgress(progressOf(response.set));
      })
      .finally(() => setWriting(false));
  };
  // While it runs, ask again a moment after each answer.
  // A failed request says nothing about the job, so it is asked again too.
  const answered = rules.state.kind === 'done' || rules.state.kind === 'failed';
  useEffect(() => {
    if (!draftRunning || !answered) return;
    const timer = setTimeout(
      () =>
        void run({ action: 'get', text, readId }).then((response) => {
          if (response?.kind === 'rules')
            report.current(progressOf(response.set));
        }),
      DRAFT_POLL_MS,
    );
    return () => clearTimeout(timer);
  }, [draftRunning, answered, body, run, text, readId]);
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
            onAccept={() => act({ action: 'intent' })}
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
              onWrite={() => act({ action: 'write', readId, id: item.id })}
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
                act({ action: 'decide', id: item.id, decision, note })
              }
              onChoose={(index) =>
                act({ action: 'choose', id: item.id, index })
              }
              onAdvise={() => adviceFor(text, item.id)}
              onShowProfile={profile ? showProfile : undefined}
              onSetAppliesTo={(value) =>
                act({ action: 'appliesTo', id: item.id, value })
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
        route="/api/dev/brunch-orders/rules"
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
                // Only proposing one reads the data: the route takes no
                // read with an edit or a confirmation, and refuses one.
                act(
                  change.action === 'profile' ? { ...change, readId } : change,
                );
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
            act({
              action: 'draft',
              version,
              readId,
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
            writing ||
            drafting?.running ||
            body?.kind === 'error' ||
            drafting?.error
              ? 'text-meta text-muted'
              : 'sr-only'
          }
        >
          {drafting?.running
            ? drafting.step
            : writing
              ? 'Working… writing one can take a minute.'
              : body?.kind === 'error'
                ? body.message
                : (drafting?.error ?? '')}
        </p>
      </section>

      {!set ? (
        rules.state.kind === 'done' ? (
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
