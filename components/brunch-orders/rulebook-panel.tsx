'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { RulebookCard, words } from '@/components/brunch-orders/rules-step';
import { plural, useTrial } from '@/components/brunch-orders/trial-parts';
import { Pill } from '@/components/ui/pill';
import {
  Arrival,
  EmptyState,
  useLoader,
  type LoaderPhase,
} from '@/components/ui/working-mark';
import type { RevisionChanges } from '@/lib/definitions/revision-changes';
import type {
  DefinitionSet,
  Revision,
  RevisionIndex,
} from '@/lib/definitions/types';
import type { ProcessSummary } from '@/lib/process/model';
import { runStamp } from '@/lib/process/run-time';

// Each revision with what it changed from its parent, where both are kept.
export type RulebookHistory = Omit<RevisionIndex, 'revisions'> & {
  revisions: (Revision & { changes: RevisionChanges | null })[];
};

type RulesResponse =
  | {
      kind: 'rules';
      set: DefinitionSet;
      names: Record<string, string>;
      history: RulebookHistory;
    }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

/*
  Keep the rulebook outside the swapping tabs: revisiting one refreshes its
  reply without replacing known content with the loading illustration.
*/
function useRulebookState(process: ProcessSummary) {
  const { current } = useInstructions(process.id, process.instructions);
  const rules = useTrial<RulesResponse>('/api/dev/brunch-orders/rules');
  const { run } = rules;
  const [reply, setReply] = useState<{
    text: string;
    body: RulesResponse;
  } | null>(null);
  const refresh = useCallback(() => {
    let cancelled = false;
    void run({ action: 'get', text: current.text }).then((body) => {
      if (!cancelled && body) setReply({ text: current.text, body });
    });
    return () => {
      cancelled = true;
    };
  }, [run, current.text]);
  // A reply for different instructions must never appear under the new version.
  const body = reply?.text === current.text ? reply.body : null;
  const set = body?.kind === 'rules' ? body.set : null;
  const accepted = set?.definitions.filter((d) => d.approvedAt) ?? [];
  return { current, body, set, accepted, refresh };
}

const RulebookContext = createContext<ReturnType<
  typeof useRulebookState
> | null>(null);

export function RulebookProvider({
  process,
  children,
}: {
  process: ProcessSummary;
  children: ReactNode;
}) {
  const rulebook = useRulebookState(process);
  return <RulebookContext value={rulebook}>{children}</RulebookContext>;
}

export function useRulebook() {
  const rulebook = useContext(RulebookContext);
  if (!rulebook) throw new Error('Rulebook panels need a RulebookProvider.');
  const { refresh } = rulebook;
  useEffect(() => refresh(), [refresh]);
  return rulebook;
}

/*
  The rulebook of the current instructions: what has been accepted, read-only.
  Drafting, examples and decisions stay in a run's Rules step; this is what
  every run under these instructions uses.
*/
export function RulebookPanel() {
  const { current, body, set, accepted } = useRulebook();
  const { phase, fadeIn } = useLoader(!body);
  const numbers = accepted.filter((d) => d.result === 'number').length;
  if (phase || !body) return <RulebookLoading phase={phase ?? 'waiting'} />;
  return (
    <Arrival fadeIn={fadeIn} className="grid gap-5">
      <p className="text-dense text-muted leading-relaxed">
        The calculations and checks accepted for instructions{' '}
        <span className="value">{current.version}</span>. Every run under them
        uses these; a run&rsquo;s Rules step is where they are drafted and
        accepted.
      </p>
      {body?.kind === 'error' ? (
        <p role="alert" className="text-dense text-state-blocked">
          {body.message}
        </p>
      ) : !accepted.length ? (
        <p className="text-dense text-muted">
          Nothing is accepted for these instructions yet.
        </p>
      ) : (
        <>
          <p className="text-dense">
            {plural(numbers, 'calculation')},{' '}
            {plural(accepted.length - numbers, 'check')}
            {set && accepted.length < set.definitions.length ? (
              <span className="text-muted">
                {' '}
                · {set.definitions.length - accepted.length} more drafted, not
                accepted
              </span>
            ) : null}
          </p>
          <ol className="grid gap-3" aria-label="Accepted rules">
            {accepted.map((item) => (
              <RulebookCard
                key={item.id}
                item={item}
                quoted={words(current.text).includes(words(item.text))}
                names={body.kind === 'rules' ? body.names : {}}
                reads={accepted.filter((d) => item.uses.includes(d.id))}
              />
            ))}
          </ol>
        </>
      )}
      {body?.kind === 'rules' && body.history.revisions.length ? (
        <History history={body.history} />
      ) : null}
    </Arrival>
  );
}

/* The rulebook's first load, on the loader's timing (useLoader). */
export function RulebookLoading({ phase }: { phase: LoaderPhase }) {
  if (phase === 'waiting') return null;
  return (
    <EmptyState
      role="status"
      loading
      title={
        phase === 'slow'
          ? 'Still loading the rulebook…'
          : 'Loading the rulebook…'
      }
    />
  );
}

export const REASONS: Record<Revision['reason'], string> = {
  accepted: 'Accepted',
  migrated: 'Migrated',
  used: 'Kept by a run',
};

/*
  Every accepted rulebook for these instructions, newest first: each is kept
  as it was, and a run that used one keeps using it. Read-only.
*/
function History({ history }: { history: RulebookHistory }) {
  return (
    <section aria-labelledby="rulebook-history" className="grid gap-2">
      <h3 id="rulebook-history" className="readout text-muted">
        History
      </h3>
      <ol className="text-dense grid gap-2" aria-label="Rulebook revisions">
        {history.revisions.map((revision) => (
          <li key={revision.id} className="grid gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="value font-medium">{revision.id}</span>
              <span>
                {REASONS[revision.reason]}
                {revision.parent ? (
                  <span className="text-muted">
                    {' '}
                    from <span className="value">{revision.parent}</span>
                  </span>
                ) : null}
              </span>
              {revision.id === history.head ? (
                <Pill tone="ready">Current</Pill>
              ) : null}
            </span>
            <span className="text-meta text-muted">
              {runStamp(revision.at)}
              {revision.note ? ` · ${revision.note}` : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
