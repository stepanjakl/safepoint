'use client';

import { useEffect } from 'react';

import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { RulebookCard, words } from '@/components/brunch-orders/rules-step';
import { plural, useTrial } from '@/components/brunch-orders/trial-parts';
import { Pill } from '@/components/ui/pill';
import type {
  DefinitionSet,
  Revision,
  RevisionIndex,
} from '@/lib/definitions/types';
import type { ProcessSummary } from '@/lib/process/model';
import { runStamp } from '@/lib/process/run-time';

type RulesResponse =
  | {
      kind: 'rules';
      set: DefinitionSet;
      names: Record<string, string>;
      history: RevisionIndex;
    }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

/*
  The rulebook of the current instructions: what has been accepted, read-only.
  Drafting, examples and decisions stay in a run's Rules step; this is what
  every run under these instructions uses.
*/
export function RulebookPanel({ process }: { process: ProcessSummary }) {
  const { current } = useInstructions(process.id, process.instructions);
  const rules = useTrial<RulesResponse>('/api/dev/brunch-orders/rules');
  const { run } = rules;
  useEffect(() => {
    void run({ action: 'get', text: current.text });
  }, [run, current.text]);
  const body = rules.state.kind === 'done' ? rules.state.body : null;
  const set = body?.kind === 'rules' ? body.set : null;
  const accepted = set?.definitions.filter((d) => d.approvedAt) ?? [];
  const numbers = accepted.filter((d) => d.result === 'number').length;
  return (
    <div className="grid gap-5">
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
      ) : !body ? (
        <p className="text-dense text-muted">Loading the rulebook…</p>
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
    </div>
  );
}

const REASONS: Record<Revision['reason'], string> = {
  accepted: 'Accepted',
  migrated: 'Migrated',
  used: 'Kept by a run',
};

/*
  Every accepted rulebook for these instructions, newest first: each is kept
  as it was, and a run that used one keeps using it. Read-only.
*/
function History({ history }: { history: RevisionIndex }) {
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
