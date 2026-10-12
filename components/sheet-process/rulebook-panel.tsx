'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { cx } from '@/lib/cx';
import type { Draft, StageStop } from '@/lib/rulebook/draft';
import {
  DRAFTING_MODELS,
  strongerModel,
  type DraftingModel,
} from '@/lib/rulebook/models';
import type {
  ApprovedRulebook,
  Decision,
  Rulebook,
} from '@/lib/rulebook/schema';
import type { DraftRecord, DraftSummary } from '@/lib/rulebook/store';

import { CheckResults, OwnerChecks } from './check-step';
import { EvaluationProvider, useEvaluation } from './evaluation-context';
import { RulebookDrift } from './rulebook-drift';
import { Assumption, RulebookView, type Answer } from './rulebook-view';
import {
  Code,
  DataTable,
  Disclosure,
  JsonBlock,
  Lede,
  Mark,
  Outcome,
  StatusChip,
  TechnicalDetails,
  TrialControl,
  dateTime,
  td,
  th,
  plural,
  useTrial,
  type Tone,
} from './trial-parts';

type Issue = { where: string; message: string };

type DraftResponse =
  | ({ kind: 'result'; saved: string | null } & DraftRecord)
  | { kind: 'not_configured'; missing: string[] }
  | { kind: 'error'; message: string; runId?: string };

type DraftsResponse =
  | { kind: 'list'; drafts: DraftSummary[] }
  | ({ kind: 'record'; file: string; drift: Issue[] } & DraftRecord)
  | { kind: 'error'; message: string };

type ApproveResponse =
  | { kind: 'result'; version: number; file: string }
  | { kind: 'error'; message: string; issues?: unknown };

// The draft on screen: the one just made, or one opened from the history. A
// saved one is checked again against today's sheet and checks (drift).
type Shown = DraftRecord & { saved: string | null; drift?: Issue[] };

type ShownDecision = Decision & { stale: boolean };

const STOP_REASONS: Record<StageStop['reason'], string> = {
  limit: 'the attempt limit was reached without the problems falling',
  no_progress: 'the same problems came back',
  repeat: 'the model sent back the same answer',
};

const STAGE_NAMES: Record<Draft['stages'][number]['stage'], string> = {
  inventory: 'Inventory',
  data_model: 'Data model',
  logic: 'Rules',
};

const describeStop = (stop: StageStop) =>
  `${STAGE_NAMES[stop.stage]} gave up after ${plural(stop.attempts, 'attempt')} with ${plural(stop.problems, 'problem')} left: ${STOP_REASONS[stop.reason]}`;

const when = dateTime;
const fileOf = (saved: string | null) => saved?.split('/').pop() ?? null;

// Where a draft ended, as a chip and its words.
function draftResult(draft: Draft): { tone: Tone; label: string } {
  if (draft.rulebook) return { tone: 'ready', label: 'Passes its checks' };
  if (draft.interrupted)
    return { tone: 'blocked', label: 'Stopped by the service' };
  if (draft.stopped)
    return {
      tone: 'blocked',
      label: `Gave up at ${STAGE_NAMES[draft.stopped.stage]}`,
    };
  return { tone: 'blocked', label: plural(draft.issues.length, 'problem') };
}

/*
  Everything about the rulebook, in the order a version lives: the one in
  force, the questions it leaves open, drafting a new one, testing it on the
  data, approving it, and every draft made so far. Not part of a run: a run
  only uses the version in force.
*/
export function RulebookPanel({
  active,
  drift,
  decisions,
  latest,
}: {
  active: ApprovedRulebook | null;
  // What the approved rulebook no longer passes on the captured read.
  drift: Issue[];
  decisions: ShownDecision[];
  // The most recent saved draft, shown until another is made or opened.
  latest: { file: string; record: DraftRecord; drift: Issue[] } | null;
}) {
  const router = useRouter();
  const answers = new Map(
    decisions.filter((d) => !d.stale).map((d) => [d.question, d.answer]),
  );
  const deciding = useTrial<{ kind: string }>('/api/dev/brunch/decisions');
  // The owner answers an open question; drafting uses it from then on.
  const answer: Answer = async (statement, question, text) => {
    await deciding.run({
      action: 'add',
      statement: statement.id,
      quote: statement.quote,
      question,
      answer: text,
    });
    router.refresh();
  };
  const drafting = useTrial<DraftResponse>('/api/dev/brunch/draft');
  const [model, setModel] = useState<DraftingModel>(DRAFTING_MODELS[0]!);
  const [source, setSource] = useState<'captured' | 'live'>('captured');
  const [opened, setOpened] = useState<Shown | null>(
    latest
      ? {
          ...latest.record,
          drift: latest.drift,
          saved: `data/avocado-toast/drafts/${latest.file}`,
        }
      : null,
  );
  const body = drafting.state.kind === 'done' ? drafting.state.body : null;
  const shown: Shown | null = opened ?? (body?.kind === 'result' ? body : null);
  const draft = shown?.draft ?? null;

  return (
    <div className="grid gap-10">
      <Lede>
        The rules are not written into the app. A model reads the sheet and
        drafts a rulebook in standard CEL; the app checks every part, you answer
        what the sheet leaves open, test it on the data and approve it. Only an
        approved version is used by a run. The owner&rsquo;s tab of checks is
        never shown to the model.
      </Lede>

      <Stage number={1} title="In force">
        {active ? (
          <>
            <Outcome>
              <StatusChip tone={drift.length ? 'decision' : 'ready'}>
                {drift.length ? 'Out of date' : 'Up to date'}
              </StatusChip>
              <span>
                Version {active.version}, approved {when(active.approved_at)}
              </span>
            </Outcome>
            <RulebookDrift
              name={`Rulebook v${active.version}`}
              consequence="Runs may be wrong until a new version is drafted and approved."
              issues={drift}
            />
            <div className="grid">
              <Disclosure summary={`Read rulebook v${active.version}`}>
                <RulebookView
                  rulebook={active.rulebook}
                  onAnswer={answer}
                  answers={answers}
                />
              </Disclosure>
              <TechnicalDetails>
                <Ledger className="enclosure">
                  <LedgerRow label="Drafted by">
                    {active.drafted.model}, run{' '}
                    <Code>{active.drafted.run_id}</Code>
                  </LedgerRow>
                  <LedgerRow label="Stored in">
                    <Code>{`fixtures/avocado-toast/rulebooks/v${active.version}.json`}</Code>
                  </LedgerRow>
                </Ledger>
              </TechnicalDetails>
            </div>
          </>
        ) : (
          <Outcome>
            <StatusChip tone="blocked">None approved</StatusChip>
            <span>Draft one below, test it and approve it.</span>
          </Outcome>
        )}
      </Stage>

      <Stage number={2} title="Questions for you">
        <Questions
          rulebook={draft?.rulebook ?? active?.rulebook ?? null}
          from={
            draft?.rulebook ? 'the draft on screen' : 'the version in force'
          }
          answers={answers}
          onAnswer={answer}
        />
        <div className="grid">
          <Disclosure
            summary={
              <>
                <span>Your answers</span>
                <span className="text-meta text-muted">
                  {decisions.length} kept in the app, given to every draft
                </span>
              </>
            }
          >
            <Decisions
              decisions={decisions}
              busy={deciding.state.kind === 'running'}
              onRemove={(id) =>
                void deciding
                  .run({ action: 'remove', id })
                  .then(() => router.refresh())
              }
            />
          </Disclosure>
        </div>
      </Stage>

      <Stage number={3} title="Draft a new version">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="grid gap-1">
            <span className="text-meta text-muted">Model</span>
            <select
              className="field text-dense min-h-9 px-2"
              value={model}
              onChange={(e) => setModel(e.target.value as DraftingModel)}
            >
              {DRAFTING_MODELS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <SourceChoice source={source} onChange={setSource} />
        </div>
        <p className="text-meta text-muted max-w-prose">
          Newest models first. If the service is busy or out of quota for one,
          the draft moves to the next older model of its family and records
          which one answered each step.
        </p>
        <TrialControl
          label="Draft a rulebook"
          runningLabel="Drafting… (a minute or two)"
          idle={
            shown ? 'The latest saved draft is shown below.' : 'No draft yet.'
          }
          state={drafting.state}
          onRun={() => {
            setOpened(null);
            void drafting.run({ model, source });
          }}
          summary={
            body?.kind === 'result'
              ? draftResult(body.draft).label
              : body?.kind === 'not_configured'
                ? `Missing ${body.missing.join(', ')}`
                : body?.kind === 'error'
                  ? body.message
                  : null
          }
        />
        {shown ? (
          <DraftDetail
            shown={shown}
            fresh={!opened}
            onAnswer={answer}
            answers={answers}
            continuing={drafting.state.kind === 'running'}
            onContinue={(stronger, file) => {
              setOpened(null);
              void drafting.run({ model: stronger, source, resume: file });
            }}
          />
        ) : null}
      </Stage>

      <Stage number={4} title="Test it on the data">
        {draft?.rulebook && shown ? (
          // Its own evaluation, so testing a draft never replaces a run's.
          <EvaluationProvider>
            <DraftTest shown={shown} />
          </EvaluationProvider>
        ) : (
          <Lede>
            Open or make a draft that passes its checks to test it here, item by
            item, before approving it.
          </Lede>
        )}
      </Stage>

      <Stage number={5} title="Approve">
        {draft?.rulebook ? (
          <Approve
            shown={shown!}
            rulebook={draft.rulebook}
            nextVersion={(active?.version ?? 0) + 1}
            source={source}
          />
        ) : (
          <Lede>Nothing to approve: no draft that passes is on screen.</Lede>
        )}
      </Stage>

      <PastDrafts
        refreshed={
          drafting.state.kind === 'done' ? drafting.state.finishedAt : null
        }
        onOpen={setOpened}
      />
    </div>
  );
}

// One part of the panel, numbered in the order a version lives.
function Stage({
  number,
  title,
  children,
}: {
  number?: number;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <h3
        id={id}
        className="text-title border-rule-faint flex items-baseline gap-2 border-b pb-2 font-semibold"
      >
        {number ? (
          <span className="text-muted tabular-nums" aria-hidden="true">
            {number}
          </span>
        ) : null}
        {title}
      </h3>
      {children}
    </section>
  );
}

function SourceChoice({
  source,
  onChange,
}: {
  source: 'captured' | 'live';
  onChange: (source: 'captured' | 'live') => void;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-1">
      <legend className="text-meta text-muted mb-1">Sheet data</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="text-dense flex items-center gap-1.5">
          <input
            type="radio"
            name={name}
            checked={source === 'captured'}
            onChange={() => onChange('captured')}
          />
          The captured read
        </label>
        <label className="text-dense flex items-center gap-1.5">
          <input
            type="radio"
            name={name}
            checked={source === 'live'}
            onChange={() => onChange('live')}
          />
          The live sheet
        </label>
      </div>
    </fieldset>
  );
}

/*
  Every choice a rulebook makes that the sheet does not, still unanswered, in
  one list: the reader answers them here rather than hunting through the
  rules. Answered ones drop out and are kept under Your answers.
*/
function Questions({
  rulebook,
  from,
  answers,
  onAnswer,
}: {
  rulebook: Rulebook | null;
  from: string;
  answers: Map<string, string>;
  onAnswer: Answer;
}) {
  if (!rulebook)
    return <Lede>Questions appear once a draft or a version exists.</Lede>;
  const open = [
    ...rulebook.rules.map((r) => ({
      name: r.sheet_rule ?? r.id,
      title: r.title,
      statement: r.statement,
      assumes: r.assumes,
    })),
    ...rulebook.facts.map((f) => ({
      name: f.name,
      title: f.label,
      statement: f.statement,
      assumes: f.assumes,
    })),
  ].flatMap((part) => {
    const st = rulebook.statements.find((s) => s.id === part.statement);
    if (!st) return [];
    // Drafts saved before alternatives existed hold plain text: shown, with
    // nothing to pick from.
    return (part.assumes as unknown[]).flatMap((a) => {
      const item =
        typeof a === 'string'
          ? { assumption: a, alternatives: [], technical: undefined }
          : (a as {
              assumption: string;
              alternatives: string[];
              technical?: string;
            });
      return answers.has(`Is it right that: ${item.assumption}`)
        ? []
        : [
            {
              ...item,
              part,
              statement: { id: st.id, quote: st.source.quote },
            },
          ];
    });
  });
  return (
    <>
      <Outcome>
        <StatusChip tone={open.length ? 'decision' : 'ready'}>
          {open.length ? `${open.length} to answer` : 'None open'}
        </StatusChip>
        <span className="text-dense text-muted">from {from}</span>
      </Outcome>
      {open.length ? (
        <ol className="grid gap-3">
          {open.map((q) => (
            <li
              key={`${q.part.name}:${q.assumption}`}
              className="enclosure grid gap-2 p-3"
            >
              <p className="text-meta text-muted">
                {q.part.name} {q.part.title} · statement {q.statement.id}: “
                {q.statement.quote}”
              </p>
              <Assumption
                statement={q.statement}
                assumption={q.assumption}
                alternatives={q.alternatives}
                technical={q.technical}
                onAnswer={onAnswer}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

function Decisions({
  decisions,
  busy,
  onRemove,
}: {
  decisions: ShownDecision[];
  busy: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <p className="text-meta text-muted max-w-prose">
        Kept in the app, not written to the sheet, and given to every draft as
        policy. An answer goes stale when its statement&rsquo;s text changes in
        the sheet, and is not used until answered again.
      </p>
      {decisions.length ? (
        <DataTable caption="Your answers">
          <thead>
            <tr>
              <th className={th}>Statement</th>
              <th className={th}>Question</th>
              <th className={th}>Answer</th>
              <th className={th}>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.id}>
                <td className={td}>
                  {d.statement}{' '}
                  {d.stale ? (
                    <StatusChip tone="decision">stale</StatusChip>
                  ) : null}
                  <span className="text-muted block">{when(d.decided_at)}</span>
                </td>
                <td className={td}>{d.question}</td>
                <td className={td}>{d.answer}</td>
                <td className={td}>
                  <Button isDisabled={busy} onPress={() => onRemove(d.id)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : (
        <p className="text-dense text-muted">None yet.</p>
      )}
    </>
  );
}

/*
  The draft on screen: where it ended, then each stage as a row that opens to
  everything sent and received, then the rulebook it made or the problems
  left.
*/
function DraftDetail({
  shown,
  fresh,
  onAnswer,
  answers,
  continuing,
  onContinue,
}: {
  shown: Shown;
  // Just made, rather than opened from the history.
  fresh: boolean;
  onAnswer: Answer;
  answers: Map<string, string>;
  continuing: boolean;
  onContinue: (model: DraftingModel, file: string) => void;
}) {
  const { draft, checks } = shown;
  const result = draftResult(draft);
  const tokens = draft.stages.reduce(
    (sum, s) => ({
      input: sum.input + (s.usage.inputTokens ?? 0),
      output: sum.output + (s.usage.outputTokens ?? 0),
    }),
    { input: 0, output: 0 },
  );
  const file = fileOf(shown.saved);
  const stronger = strongerModel(draft.models.at(-1) ?? draft.model);
  return (
    <div className="enclosure grid gap-4 p-4">
      <Outcome>
        <StatusChip tone={result.tone}>{result.label}</StatusChip>
        <span>
          {fresh ? 'The draft just made' : 'The draft'} of{' '}
          {when(draft.startedAt)}
        </span>
        {checks ? (
          <span className="text-dense text-muted">
            · {checks.results.filter((c) => c.passed).length} of{' '}
            {checks.results.length} owner checks when drafted
          </span>
        ) : null}
      </Outcome>
      {draft.stopped || draft.interrupted ? (
        <p className="text-dense">
          {draft.interrupted ?? describeStop(draft.stopped!)}.
        </p>
      ) : null}
      <RulebookDrift
        name="This draft"
        consequence="It passed its checks when it was made; approving it now would be refused. Draft again instead."
        issues={shown.drift ?? []}
      />
      {file && !draft.rulebook && draft.stopped && stronger ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            isDisabled={continuing}
            onPress={() => onContinue(stronger, file)}
          >
            Continue with {stronger}
          </Button>
          <span className="text-meta text-muted">
            Keeps the stages that passed; uses that model&rsquo;s smaller free
            quota.
          </span>
        </div>
      ) : null}

      <div className="grid">
        <p className="text-meta text-muted">
          {draft.stages.length} steps on{' '}
          {draft.models.join(', then ') || draft.model},{' '}
          {(draft.durationMs / 1000).toFixed(0)} s
        </p>
        <ol aria-label="Drafting stages" className="grid">
          {draft.stages.map((s, i) => (
            <li key={i}>
              <Disclosure
                summary={
                  <>
                    <Mark passed={s.issues.length === 0}>
                      {s.issues.length === 0 ? '✓' : '✗'}
                    </Mark>
                    <span>
                      {STAGE_NAMES[s.stage]}
                      {s.round > 1 ? ', revised' : ''}
                    </span>
                    <span className="text-meta text-muted">
                      attempt {s.attempt} · {s.model} ·{' '}
                      {(s.durationMs / 1000).toFixed(1)} s ·{' '}
                      {plural(s.toolCalls.length, 'check')}
                    </span>
                    {s.issues.length ? (
                      <StatusChip tone="blocked">
                        {plural(s.issues.length, 'problem')}
                      </StatusChip>
                    ) : null}
                  </>
                }
              >
                <StageRecord stage={s} />
              </Disclosure>
            </li>
          ))}
        </ol>
        {draft.rulebook ? (
          <Disclosure summary="Read the drafted rulebook">
            <RulebookView
              rulebook={draft.rulebook}
              onAnswer={onAnswer}
              answers={answers}
            />
          </Disclosure>
        ) : null}
        <TechnicalDetails>
          <Ledger className="enclosure">
            {draft.resumedFrom ? (
              <LedgerRow label="Continues">
                <Code>{draft.resumedFrom.file}</Code>, carrying over its{' '}
                {draft.resumedFrom.carried
                  .map((stage) => STAGE_NAMES[stage])
                  .join(' and ') || 'nothing'}
              </LedgerRow>
            ) : null}
            <LedgerRow label="Run">
              <Code>{draft.runId}</Code>, {tokens.input.toLocaleString('en-GB')}{' '}
              tokens in, {tokens.output.toLocaleString('en-GB')} out
            </LedgerRow>
            {shown.saved ? (
              <LedgerRow label="Record">
                <Code>{shown.saved}</Code> (not committed)
              </LedgerRow>
            ) : null}
          </Ledger>
        </TechnicalDetails>
      </div>

      {!draft.rulebook && draft.issues.length ? (
        <section aria-label="Remaining problems" className="grid gap-2">
          <p className="text-dense font-medium">Remaining problems</p>
          <IssueLines issues={draft.issues} />
        </section>
      ) : null}
    </div>
  );
}

function IssueLines({ issues }: { issues: Issue[] }) {
  return (
    <ul className="text-meta grid gap-1">
      {issues.map((issue, i) => (
        <li key={i}>
          <Code>{issue.where}</Code> {issue.message}
        </li>
      ))}
    </ul>
  );
}

// One stage attempt: its problems, the checks it called, and everything sent
// and received.
function StageRecord({ stage: s }: { stage: Draft['stages'][number] }) {
  return (
    <>
      {s.note ? <p className="text-meta">{s.note}</p> : null}
      {s.issues.length ? <IssueLines issues={s.issues} /> : null}
      {s.toolCalls.length ? (
        <DataTable caption={`Tool calls, ${s.stage} attempt ${s.attempt}`}>
          <thead>
            <tr>
              <th className={th}>Tool</th>
              <th className={th}>Checked</th>
              <th className={th}>Result</th>
            </tr>
          </thead>
          <tbody>
            {s.toolCalls.map((call, i) => {
              const input = call.input as {
                kind?: string;
                key?: string;
                expression?: string;
                summary?: string;
              };
              const output = call.output as {
                ok?: boolean;
                type?: string;
                value?: string;
                error?: string;
              } | null;
              return (
                <tr key={i}>
                  <td className={td}>
                    {call.tool}{' '}
                    <span className="text-muted">
                      {[input.kind, input.key].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className={td}>
                    {input.expression ? (
                      <Code>{input.expression}</Code>
                    ) : (
                      input.summary
                    )}
                  </td>
                  <td className={td}>
                    <Mark passed={output?.ok ?? false}>
                      {output?.ok
                        ? (output.type ?? output.value)
                        : output?.error}
                    </Mark>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      ) : null}
      <Disclosure summary="Instructions sent">
        <pre className="bg-surface-inset rounded-control readout max-w-full overflow-auto p-3 whitespace-pre-wrap">
          {s.instructions}
        </pre>
      </Disclosure>
      <Disclosure summary="Input sent">
        <JsonBlock label="Input sent to the model" value={s.input} />
      </Disclosure>
      <Disclosure summary="Answer received">
        <JsonBlock label="Answer from the model" value={s.output} />
      </Disclosure>
    </>
  );
}

/*
  The draft on screen, run on the captured read like a run would, item by
  item, with the owner's checks: what approving it would mean, seen before
  approving.
*/
function DraftTest({ shown }: { shown: Shown }) {
  const { state, run } = useEvaluation();
  const file = fileOf(shown.saved);
  const body = state.kind === 'done' ? state.body : null;
  const result =
    body?.kind === 'result' &&
    body.rulebook.kind === 'draft' &&
    body.rulebook.file === file
      ? body
      : null;
  return (
    <>
      <Lede>
        Runs this draft on the captured read, now, as a run would use it: every
        item&rsquo;s rules with their working, what-if values and the
        owner&rsquo;s checks. Nothing is in force until it is approved.
      </Lede>
      <TrialControl
        label="Test on the captured read"
        runningLabel="Testing…"
        state={state}
        blocked={file ? null : 'Only a saved draft can be tested.'}
        onRun={() =>
          file &&
          void run({
            read: 'captured',
            run: { mode: 'now' },
            period: 0,
            rulebook: { kind: 'draft', file },
          })
        }
        summary={
          result
            ? `${result.evaluation.items.length} items`
            : body?.kind === 'error'
              ? body.message
              : null
        }
      />
      {result ? (
        <CheckResults result={result} inContext />
      ) : shown.checks ? (
        <div className="grid">
          <Disclosure summary="The owner's checks, as scored when it was drafted">
            <OwnerChecks checks={shown.checks} title="The owner's checks" />
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}

function Approve({
  shown,
  rulebook,
  nextVersion,
  source,
}: {
  shown: Shown;
  rulebook: Rulebook;
  nextVersion: number;
  source: 'captured' | 'live';
}) {
  const router = useRouter();
  const approving = useTrial<ApproveResponse>('/api/dev/brunch/approve');
  const { draft } = shown;
  const refused = (shown.drift ?? []).length > 0;
  const approved =
    approving.state.kind === 'done' && approving.state.body.kind === 'result';
  return (
    <>
      <Lede>
        Approving saves this draft as version {nextVersion} in the repository,
        with your answers. It is checked once more against the sheet first;
        every run after that uses it.
      </Lede>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          isDisabled={approving.state.kind === 'running' || approved || refused}
          onPress={() =>
            void approving
              .run({
                rulebook,
                drafted: {
                  model: draft.models.join(', '),
                  run_id: draft.runId,
                  at: draft.startedAt,
                },
                source,
                decisions: draft.decisions ?? [],
              })
              .then(() => router.refresh())
          }
        >
          Approve as version {nextVersion}
        </Button>
        <p role="status" className="text-meta text-muted">
          {refused
            ? 'This draft no longer passes the checks, so it cannot be approved.'
            : approving.state.kind === 'running'
              ? 'Checking and saving…'
              : approving.state.kind === 'done'
                ? approving.state.body.kind === 'result'
                  ? `Saved as version ${approving.state.body.version} in ${approving.state.body.file}. Commit it to keep it.`
                  : approving.state.body.message
                : ''}
        </p>
      </div>
    </>
  );
}

// Every saved draft, newest first, so drafts can be compared and reopened.
const RECENT_DRAFTS = 5;

function PastDrafts({
  refreshed,
  onOpen,
}: {
  refreshed: string | null;
  onOpen: (shown: Shown) => void;
}) {
  const listing = useTrial<DraftsResponse>('/api/dev/brunch/drafts');
  const opening = useTrial<DraftsResponse>('/api/dev/brunch/drafts');
  // The newest few by default; every draft is kept and can be listed.
  const [all, setAll] = useState(false);
  const list =
    listing.state.kind === 'done' && listing.state.body.kind === 'list'
      ? listing.state.body.drafts
      : null;
  return (
    <Stage title="Every draft so far">
      <TrialControl
        label={refreshed ? 'Show saved drafts (refresh)' : 'Show saved drafts'}
        variant="secondary"
        idle="Every draft is kept, with its full record."
        runningLabel="Listing…"
        state={listing.state}
        onRun={() => void listing.run({})}
        summary={list ? `${list.length} saved drafts` : null}
      />
      {list?.length ? (
        <DataTable caption="Saved drafts, newest first">
          <thead>
            <tr>
              <th className={th}>Started</th>
              <th className={th}>Result</th>
              <th className={th}>Owner checks</th>
              <th className={th}>Models</th>
              <th className={th}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(all ? list : list.slice(0, RECENT_DRAFTS)).map((d) => (
              <tr key={d.file}>
                <td className={cx(td, 'whitespace-nowrap tabular-nums')}>
                  {when(d.startedAt)}
                </td>
                <td className={td}>
                  <StatusChip tone={d.passed ? 'ready' : 'blocked'}>
                    {d.passed
                      ? 'Passes'
                      : d.interrupted
                        ? 'Stopped by the service'
                        : d.stopped
                          ? `Gave up at ${STAGE_NAMES[d.stopped.stage]}`
                          : plural(d.problems, 'problem')}
                  </StatusChip>
                </td>
                <td className={cx(td, 'tabular-nums')}>
                  {d.checks ? `${d.checks.passed} of ${d.checks.total}` : '—'}
                </td>
                <td className={cx(td, 'text-muted')}>
                  {d.models.join(', then ')} · {d.steps} steps,{' '}
                  {(d.durationMs / 1000).toFixed(0)} s
                  {d.rounds > 1 ? ', revised once' : ''}
                  {d.resumed ? ', continued' : ''}
                </td>
                <td className={td}>
                  <Button
                    onPress={() =>
                      void opening.run({ file: d.file }).then((record) => {
                        if (record?.kind === 'record')
                          onOpen({
                            source: record.source,
                            draft: record.draft,
                            checks: record.checks,
                            drift: record.drift,
                            saved: `data/avocado-toast/drafts/${record.file}`,
                          });
                      })
                    }
                    isDisabled={opening.state.kind === 'running'}
                  >
                    Open
                    <span className="sr-only">
                      {' '}
                      the draft of {when(d.startedAt)}
                    </span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : null}
      {list && list.length > RECENT_DRAFTS ? (
        <div>
          <Button onPress={() => setAll(!all)}>
            {all
              ? `Show the newest ${RECENT_DRAFTS}`
              : `Show all ${list.length} drafts`}
          </Button>
        </div>
      ) : null}
      {opening.state.kind === 'done' && opening.state.body.kind === 'error' ? (
        <p className="text-meta">{opening.state.body.message}</p>
      ) : null}
    </Stage>
  );
}
