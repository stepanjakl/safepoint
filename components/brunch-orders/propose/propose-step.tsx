'use client';

import { useEffect, useRef, useState } from 'react';

import { ModelLimits } from '@/components/brunch-orders/model-limits';
import { ModelSelect } from '@/components/brunch-orders/rules/model-select';
import { StaleRules } from '@/components/brunch-orders/stale-rules';
import { Lede, useTrial } from '@/components/brunch-orders/trial-parts';
import { Button } from '@/components/ui/button';
import type { Proposal } from '@/lib/definitions/types';
import type { DefinitionSubject } from '@/lib/process/model';
import { DRAFTING_MODELS, type DraftingModel } from '@/lib/models';

import { ProposalTable } from './proposal-table';
import type {
  Decision,
  Evaluation,
  ProposeProgress,
  ProposeResponse,
} from './types';
import { needsPerson } from './verdict';

const POLL_MS = 2000;

/*
  Propose: for every record, the values the model would set, why, and how the
  accepted checks find them -- and the person's decision on each, in the same
  table. The verdicts are code's. A record passes on approval; one a blocking
  check stops can only be changed to values that pass, or rejected.

  With evaluation `model` there is no rulebook and nothing to set up: the
  model proposes as soon as the step opens, and a record it is unsure of asks
  for a person, since no check can.
*/
export function ProposeStep({
  subject,
  text,
  readId,
  rulebook,
  evaluation = 'rules',
  progress: kept,
  onProgress,
  onMoveRules,
}: {
  // The process's subject: what each record's proposal sets.
  subject: DefinitionSubject;
  text: string;
  readId: string;
  // The rulebook this run calculated on; with no rulebook, none.
  rulebook?: string;
  evaluation?: Evaluation;
  progress: ProposeProgress | undefined;
  onProgress: (progress: ProposeProgress) => void;
  // Back to Calculate, on the current rules, when these no longer fit.
  onMoveRules?: () => void;
}) {
  const automatic = evaluation === 'model';
  const propose = useTrial<ProposeResponse>('/api/dev/brunch-orders/propose');
  const { run } = propose;
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });
  const [model, setModel] = useState<DraftingModel>(DRAFTING_MODELS[0]!);
  const body = propose.state.kind === 'done' ? propose.state.body : null;
  const [last, setLast] = useState<Extract<
    ProposeResponse,
    { kind: 'proposal' }
  > | null>(null);
  const current = body?.kind === 'proposal' ? body : null;
  if (current && current !== last) setLast(current);
  const shown = current ?? last;
  const proposal = asReviewed(shown?.proposal ?? null, evaluation);
  const running = shown?.progress?.running ?? false;
  // Decisions belong to the proposal they were made on.
  const decisions =
    kept && proposal && kept.proposedAt === proposal.at ? kept.decisions : {};

  const progressOf = (
    next: Record<string, Decision>,
    from = proposal,
    isRunning = running,
  ): ProposeProgress => {
    const records = from ? Object.entries(from.records) : [];
    return {
      fingerprint: from?.fingerprint ?? rulebook ?? '',
      proposedAt: from?.at ?? null,
      running: isRunning,
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
  const ask = (request: Record<string, unknown>) =>
    run({ ...request, text, readId, rulebook, evaluation }).then((response) => {
      if (response?.kind === 'proposal') {
        const same =
          kept?.proposedAt && response.proposal?.at === kept.proposedAt;
        report.current(
          progressOf(
            same ? kept.decisions : {},
            asReviewed(response.proposal, evaluation),
            response.progress?.running ?? false,
          ),
        );
      }
      return response;
    });

  // Automatic: proposes once, when nothing is kept, running or failed.
  const proposed = useRef(false);
  useEffect(() => {
    void ask({ action: 'get' }).then((response) => {
      if (
        !automatic ||
        proposed.current ||
        response?.kind !== 'proposal' ||
        response.proposal ||
        response.progress
      )
        return;
      proposed.current = true;
      void ask({ action: 'propose' });
    });
    // Once per read and rulebook; the poll below asks again while it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, text, readId, rulebook]);
  // A failed request says nothing about the job, so it is asked again too.
  const answered =
    propose.state.kind === 'done' || propose.state.kind === 'failed';
  useEffect(() => {
    if (!running || !answered) return;
    const timer = setTimeout(() => void ask({ action: 'get' }), POLL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, answered, body]);

  const [announced, setAnnounced] = useState('');
  // Several at once where a person decides several (approve all ready).
  const decide = (changes: Record<string, Decision | null>, words: string) => {
    const next = { ...decisions };
    for (const [key, decision] of Object.entries(changes))
      if (decision) next[key] = decision;
      else delete next[key];
    onProgress(progressOf(next));
    setAnnounced(words);
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
        onCheck={(key, values) =>
          run({
            action: 'check',
            text,
            readId,
            rulebook,
            evaluation,
            key,
            values,
          })
        }
      />
    ) : null;

  if (automatic) {
    const failure =
      body?.kind === 'error'
        ? body.message
        : propose.state.kind === 'failed'
          ? propose.state.message
          : !running
            ? (shown?.progress?.error ?? null)
            : null;
    return (
      <div className="grid gap-4">
        {failure ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-dense text-state-blocked">
              {failure}
            </p>
            <Button
              size="medium"
              isDisabled={running || propose.state.kind === 'running'}
              onPress={() => void ask({ action: 'propose' })}
            >
              Try again
            </Button>
          </div>
        ) : null}
        <p
          role="status"
          className={proposal && !running ? 'sr-only' : 'text-dense text-muted'}
        >
          {running
            ? 'Working out the orders from the instructions…'
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
      {body?.kind === 'stale' && onMoveRules ? (
        <StaleRules stale={body} onMove={onMoveRules} />
      ) : body?.kind === 'error' ? (
        <p role="alert" className="text-dense text-state-blocked">
          {body.message}
        </p>
      ) : null}
      {/* Scaffolding for trying the step, as the other steps' setups are. */}
      <section
        aria-label="Propose setup"
        className="brunch-trial rounded-shell grid gap-3 p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <ModelSelect model={model} busy={running} onChange={setModel} />
          {confirming ? (
            <>
              <Button
                variant="primary"
                autoFocus
                onPress={() => {
                  setConfirming(false);
                  void ask({ action: 'propose', model });
                }}
              >
                Propose again
              </Button>
              <Button onPress={() => setConfirming(false)}>Cancel</Button>
            </>
          ) : (
            <Button
              variant={proposal ? 'secondary' : 'primary'}
              isDisabled={running || propose.state.kind === 'running'}
              onPress={() =>
                hasDecisions
                  ? setConfirming(true)
                  : void ask({ action: 'propose', model })
              }
            >
              {proposal ? 'Propose again' : 'Propose'}
            </Button>
          )}
        </div>
        <ModelLimits model={model} />
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
      {table}
    </div>
  );
}

// With no rulebook, a record the model is unsure of is one a person decides:
// no check can say so instead.
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
        record.unsure && !needsPerson(record.verdict)
          ? { ...record, verdict: 'decide' as const }
          : record,
      ]),
    ),
  };
}
