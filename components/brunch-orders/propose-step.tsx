'use client';

import ArrowRotateCounterClockwise from 'blode-icons-react/icons/arrow-rotate-counter-clockwise';
import ChevronTriangleUp from 'blode-icons-react/icons/chevron-triangle-up-small-filled';
import Cross from 'blode-icons-react/icons/cross-small';
import Pencil from 'blode-icons-react/icons/pencil';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { DecisionButton } from '@/components/brunch-orders/decision-button';
import { FromModel, Step } from '@/components/brunch-orders/rules-parts';
import { ModelSelect } from '@/components/brunch-orders/rules-step';
import { Lede, useTrial } from '@/components/brunch-orders/trial-parts';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import {
  DATA_TABLE_BODY,
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME,
  DATA_TABLE_NAME_COLUMN,
  DATA_TABLE_NAME_UNDER,
  DATA_TABLE_SECONDARY_NAME,
  DATA_TABLE_RULE,
  DataTable,
} from '@/components/ui/data-table';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Fold } from '@/components/ui/fold';
import { MorphingText } from '@/components/ui/morphing-text';
import { Pill, type Tone } from '@/components/ui/pill';
import { cx } from '@/lib/cx';
import { DURATION_STATE } from '@/lib/motion';
import type {
  CheckVerdict,
  DraftProgress,
  Proposal,
  ProposalRecord,
  Verdict,
} from '@/lib/definitions/types';
import type { DefinitionSubject } from '@/lib/process/model';
import { DRAFTING_MODELS, type DraftingModel } from '@/lib/models';

import { DataDrawer } from './data-drawer';
import { ModelLimits } from './model-limits';
import { StaleRules, type StaleReply } from './stale-rules';

export type Calculated = {
  calculations: { id: string; name: string }[];
  rows: Record<string, Record<string, number | null>>;
};

export type ProposeResponse =
  | {
      kind: 'proposal';
      fingerprint: string;
      names: Record<string, string>;
      calculated: Calculated;
      proposal: Proposal | null;
      progress: DraftProgress | null;
    }
  | {
      kind: 'check';
      verdict: Verdict;
      checks: CheckVerdict[];
    }
  | StaleReply
  | { kind: 'error'; message: string };

// A person's decision on one record, kept with the run in this browser.
export type Decision = {
  kind: 'approve' | 'change' | 'reject';
  // A change's own values, and how the checks found them when it was saved.
  values?: Record<string, number>;
  verdict?: Verdict;
  checks?: CheckVerdict[];
  at: string;
};

// How far Propose has got, for the step's mark, and the decisions themselves.
export type ProposeProgress = {
  fingerprint: string;
  proposedAt: string | null;
  running: boolean;
  total: number;
  needYou: number;
  // Decided records that would write values: what Apply has to show.
  writes: number;
  decisions: Record<string, Decision>;
};

const POLL_MS = 2000;
// What a proposal sets for each record, as the process declares it.
export type ProposalField = DefinitionSubject['proposal'][number];

const VERDICT: Record<Verdict, { tone: Tone; label: string }> = {
  ready: { tone: 'ready', label: 'Ready' },
  decide: { tone: 'decision', label: 'Decide' },
  blocked: { tone: 'blocked', label: 'Blocked' },
  // No rule ran: a person reviews it all the same, so it only reads neutral.
  unchecked: { tone: 'neutral', label: 'Not checked' },
};

// A record asks for a person only where a check said so.
const needsPerson = (verdict: Verdict) =>
  verdict === 'decide' || verdict === 'blocked';

const valuesWords = (
  values: Record<string, number> | null | undefined,
  fields: ProposalField[],
) =>
  values
    ? fields.map((field) => `${field.label} ${values[field.id]}`).join(', ')
    : 'no change';

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

export type Evaluation = 'rules' | 'model';

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

type Showing = 'all' | 'need' | 'decided';

export function ProposalTable({
  fields,
  proposal,
  names,
  calculated,
  decisions,
  readId,
  announced,
  onDecide,
  onCheck,
  icons = false,
}: {
  // Decisions as their marks alone, each named in its tooltip.
  icons?: boolean;
  // What each record's proposal sets: a column each.
  fields: ProposalField[];
  proposal: Proposal;
  names: Record<string, string>;
  calculated: Calculated;
  decisions: Record<string, Decision>;
  readId: string;
  announced: string;
  onDecide: (changes: Record<string, Decision | null>, words: string) => void;
  onCheck: (
    key: string,
    values: Record<string, number>,
  ) => Promise<ProposeResponse | null>;
}) {
  const records = Object.entries(proposal.records);
  const needYou = records.filter(
    ([key, record]) => !decisions[key] && needsPerson(record.verdict),
  );
  // Those nothing asks a person about, whether checked or not.
  const ready = records.filter(
    ([key, record]) => !decisions[key] && !needsPerson(record.verdict),
  );
  const unchecked = ready.every(([, record]) => record.verdict === 'unchecked');
  const decided = records.filter(([key]) => decisions[key]);
  const reduceMotion = useReducedMotion();
  const [showing, setShowing] = useState<Showing>('all');
  const shown =
    showing === 'need' ? needYou : showing === 'decided' ? decided : records;
  const counts = (['blocked', 'decide', 'ready', 'unchecked'] as const)
    .map((verdict) => ({
      verdict,
      count: records.filter(([, r]) => r.verdict === verdict).length,
    }))
    .filter((entry) => entry.count);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const tableId = useId();

  return (
    <div className="grid gap-3">
      <div className="flex">
        <FilterTabs
          size="small"
          ariaLabel="Records to show"
          tabs={[
            {
              key: 'all',
              short: 'All',
              label: 'All records',
              count: records.length,
            },
            {
              key: 'need',
              short: 'Need you',
              label: 'Records that need you',
              count: needYou.length,
              severity: 1,
            },
            {
              key: 'decided',
              short: 'Decided',
              label: 'Decided records',
              count: decided.length,
            },
          ]}
          selected={showing}
          onChange={setShowing}
        />
      </div>
      <p role="status" className="sr-only">
        {announced}
      </p>
      <DataDrawer readId={readId}>
        {(view) => (
          <DataTable>
            <div className="min-w-0 overflow-x-auto overflow-y-hidden">
              <table className={cx('calc-table', DATA_TABLE_BODY)}>
                <caption className="sr-only">
                  What is proposed for every record
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className={cx(DATA_TABLE_HEAD, 'pr-3 pl-6 text-left')}
                    >
                      Record
                    </th>
                    <th
                      scope="col"
                      className={cx(
                        DATA_TABLE_HEAD,
                        DATA_TABLE_NAME_COLUMN,
                        'pr-3',
                      )}
                    >
                      <span className="sr-only">Name</span>
                    </th>
                    {fields.map((field) => (
                      <th
                        key={field.id}
                        scope="col"
                        className={cx(DATA_TABLE_HEAD, 'pl-3 text-right')}
                      >
                        {field.label}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className={cx(DATA_TABLE_HEAD, 'pl-3 text-left')}
                    >
                      Verdict
                    </th>
                    <th
                      scope="col"
                      className={cx(DATA_TABLE_HEAD, 'pr-4 pl-3 text-right')}
                    >
                      Decision
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {shown.length === 0 ? (
                      <PresentRow key="empty">
                        <td
                          colSpan={fields.length + 4}
                          className="text-muted px-6 py-2.75"
                        >
                          {showing === 'need'
                            ? 'Nothing needs you.'
                            : 'Nothing decided yet.'}
                        </td>
                      </PresentRow>
                    ) : null}
                    {shown.map(([key, record], rowIndex) => (
                      <ProposalRow
                        key={key}
                        fields={fields}
                        id={`${tableId}-${key}`}
                        recordKey={key}
                        name={names[key] ?? ''}
                        record={record}
                        decision={decisions[key]}
                        expanded={open.has(key)}
                        ruled={rowIndex < shown.length - 1}
                        calculated={calculated}
                        onToggle={() => toggle(key)}
                        onDecide={onDecide}
                        onCheck={onCheck}
                        onCite={(tab) => view(tab)}
                        icons={icons}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            <div
              role="group"
              aria-label="Proposal summary"
              className="ground-raised border-rule-faint bg-surface-primary sticky bottom-0 z-3 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {counts.map(({ verdict, count }) => (
                  <Pill key={verdict} tone={VERDICT[verdict].tone}>
                    {count} {VERDICT[verdict].label.toLowerCase()}
                  </Pill>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {ready.length ? (
                  <motion.div
                    key="approve-ready"
                    className="ml-auto"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: DURATION_STATE, ease: 'easeOut' }}
                  >
                    <Button
                      size="medium"
                      onPress={() => {
                        const at = new Date().toISOString();
                        onDecide(
                          Object.fromEntries(
                            ready.map(([key]) => [
                              key,
                              { kind: 'approve', at },
                            ]),
                          ),
                          `${ready.length} ${unchecked ? 'not checked' : 'ready'} approved`,
                        );
                      }}
                    >
                      <span>
                        Approve all <MorphingText text={String(ready.length)} />{' '}
                        {unchecked ? 'not checked' : 'ready'}
                      </span>
                    </Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </DataTable>
        )}
      </DataDrawer>
    </div>
  );
}

function ProposalRow({
  fields,
  id,
  recordKey: key,
  name,
  record,
  decision,
  expanded,
  ruled,
  calculated,
  onToggle,
  onDecide,
  onCheck,
  onCite,
  icons,
}: {
  fields: ProposalField[];
  icons: boolean;
  id: string;
  recordKey: string;
  name: string;
  record: ProposalRecord;
  decision: Decision | undefined;
  expanded: boolean;
  ruled: boolean;
  calculated: Calculated;
  onToggle: () => void;
  onDecide: (changes: Record<string, Decision | null>, words: string) => void;
  onCheck: (
    key: string,
    values: Record<string, number>,
  ) => Promise<ProposeResponse | null>;
  onCite: (tab: string) => void;
}) {
  // A change in progress: the values typed, and the checks on them.
  const [changing, setChanging] = useState<Record<string, number> | null>(null);
  const [checked, setChecked] = useState<{
    verdict: Verdict;
    checks: CheckVerdict[];
  } | null>(null);
  useEffect(() => {
    if (!changing) return;
    const timer = setTimeout(
      () =>
        void onCheck(key, changing).then((response) => {
          if (response?.kind === 'check') setChecked(response);
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [changing, key, onCheck]);
  const now = () => new Date().toISOString();
  const values = decision?.values ?? record.values;
  // The checks on what would be written: a change's own once saved.
  // What the row shows: the checks on values being typed, then on a saved
  // change, then on the proposal.
  const assessment =
    changing && checked
      ? checked
      : decision?.kind === 'change' && decision.verdict && decision.checks
        ? { verdict: decision.verdict, checks: decision.checks }
        : record;
  const { checks, verdict } = assessment;
  const startChange = () => {
    setChanging(
      Object.fromEntries(
        fields.map((field) => [field.id, values?.[field.id] ?? 0]),
      ),
    );
    setChecked(null);
  };

  const reduceMotion = useReducedMotion();
  const decisionState = changing ? 'changing' : decision ? 'decided' : 'open';
  return (
    <Fragment>
      <PresentRow className="calc-row align-top">
        <th
          scope="row"
          className="py-2.75 pr-3 pl-6 text-left font-medium whitespace-nowrap"
        >
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={onToggle}
            className="calc-row-toggle text-left"
          >
            <ChevronTriangleUp aria-hidden className="calc-row-chevron" />
            <span className={DATA_TABLE_NAME}>{key}</span>
            <span className="sr-only">
              , {VERDICT[verdict].label}
              {decision ? `, ${decided(decision, fields)}` : ''}
            </span>
          </button>
          {name ? <span className={DATA_TABLE_NAME_UNDER}>{name}</span> : null}
        </th>
        <td
          className={cx(
            DATA_TABLE_NAME_COLUMN,
            DATA_TABLE_SECONDARY_NAME,
            'py-2.75 pr-3',
          )}
        >
          {name || null}
        </td>
        {fields.map((field) => (
          <td
            key={field.id}
            className="py-2.75 pl-3 text-right whitespace-nowrap"
          >
            {changing ? (
              <input
                type="number"
                inputMode="numeric"
                step={1}
                aria-label={`${field.label} for ${key}`}
                value={changing[field.id]}
                autoFocus
                onChange={(event) =>
                  setChanging({
                    ...changing,
                    [field.id]: Math.trunc(Number(event.target.value) || 0),
                  })
                }
                className="field text-dense min-h-7 w-20 px-2 text-right"
              />
            ) : record.action === 'leave' && !decision?.values ? (
              // A quiet mark in a column of figures: nothing to order.
              <span className="text-muted">
                <span aria-hidden>—</span>
                <span className="sr-only">No change</span>
              </span>
            ) : (
              <span className="value tabular-nums">{values?.[field.id]}</span>
            )}
          </td>
        ))}
        <td className="py-2 pl-3">
          <Pill tone={VERDICT[verdict].tone}>{VERDICT[verdict].label}</Pill>
        </td>
        <td className="py-1.5 pr-4 pl-3 text-right">
          {/* One set of controls gives way to the next, never jumps. */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={decisionState}
              className="flex items-center justify-end gap-1.5"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
              transition={{ duration: DURATION_STATE, ease: 'easeOut' }}
            >
              {changing ? (
                <>
                  <DecisionButton
                    size="small"
                    decision="accept"
                    {...(icons
                      ? { label: `Save ${key}` }
                      : { children: 'Save' })}
                    isDisabled={!checked || checked.verdict === 'blocked'}
                    onPress={() => {
                      onDecide(
                        {
                          [key]: {
                            kind: 'change',
                            values: changing,
                            verdict: checked!.verdict,
                            checks: checked!.checks,
                            at: now(),
                          },
                        },
                        `${key} changed to ${valuesWords(changing, fields)}`,
                      );
                      setChanging(null);
                    }}
                  />
                  {icons ? (
                    <IconButton
                      label="Cancel"
                      face="quiet"
                      placement="top"
                      onPress={() => setChanging(null)}
                    >
                      <Cross aria-hidden size={14} strokeWidth={2.5} />
                    </IconButton>
                  ) : (
                    <Button size="small" onPress={() => setChanging(null)}>
                      Cancel
                    </Button>
                  )}
                </>
              ) : decision ? (
                <>
                  <Pill tone={decision.kind === 'reject' ? 'neutral' : 'ready'}>
                    {decided(decision, fields)}
                  </Pill>
                  {icons ? (
                    <IconButton
                      label={`Undo the decision on ${key}`}
                      face="quiet"
                      placement="top"
                      onPress={() =>
                        onDecide({ [key]: null }, `${key} undecided`)
                      }
                    >
                      <ArrowRotateCounterClockwise
                        aria-hidden
                        size={14}
                        strokeWidth={2}
                      />
                    </IconButton>
                  ) : (
                    <Button
                      size="small"
                      onPress={() =>
                        onDecide({ [key]: null }, `${key} undecided`)
                      }
                    >
                      Undo
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <DecisionButton
                    size="small"
                    decision="accept"
                    {...(icons
                      ? { label: `Approve ${key}` }
                      : { children: 'Approve' })}
                    isDisabled={record.verdict === 'blocked'}
                    onPress={() =>
                      onDecide(
                        { [key]: { kind: 'approve', at: now() } },
                        `${key} approved`,
                      )
                    }
                  />
                  {icons ? (
                    <IconButton
                      label={`Change ${key}`}
                      face="quiet"
                      placement="top"
                      onPress={startChange}
                    >
                      <Pencil aria-hidden size={14} strokeWidth={2} />
                    </IconButton>
                  ) : (
                    <Button size="small" onPress={startChange}>
                      Change
                    </Button>
                  )}
                  <DecisionButton
                    size="small"
                    decision="deny"
                    {...(icons
                      ? { label: `Reject ${key}` }
                      : { children: 'Reject' })}
                    onPress={() =>
                      onDecide(
                        { [key]: { kind: 'reject', at: now() } },
                        `${key} rejected`,
                      )
                    }
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </td>
      </PresentRow>
      <PresentRow>
        <td
          colSpan={fields.length + 4}
          className={cx('p-0', ruled && DATA_TABLE_RULE)}
        >
          <Fold open={expanded} id={id} className="grid gap-3 px-6 pt-1 pb-4">
            <FromModel label="The model's reason">
              <p className="text-dense">{record.reason}</p>
              {record.unsure ? (
                <p className="text-dense">
                  <span className="font-medium">Unsure: </span>
                  {record.unsure}
                </p>
              ) : null}
            </FromModel>
            {record.cited.length ? (
              <Facts label="Cells it relied on">
                {record.cited.map((cell) => (
                  <button
                    key={cell}
                    type="button"
                    className="value text-meta text-state-advisory underline decoration-dotted underline-offset-2"
                    onClick={() => onCite(cell.slice(0, cell.lastIndexOf('!')))}
                  >
                    {cell}
                  </button>
                ))}
              </Facts>
            ) : null}
            {calculated.calculations.length ? (
              <Facts label="Worked out in Calculate">
                {calculated.calculations.map((c) => (
                  <span key={c.id} className="text-meta">
                    {c.name}{' '}
                    <span className="value font-medium">
                      {calculated.rows[key]?.[c.id] ?? '—'}
                    </span>
                  </span>
                ))}
              </Facts>
            ) : null}
            {checks?.length ? (
              <ul className="grid gap-2" aria-label={`Checks on ${key}`}>
                {/* Those a guard settles for this record come last: they
                    say nothing about the values. Decisions kept before the
                    verdicts said so read as applying. */}
                {[...checks]
                  .sort(
                    (a, b) =>
                      Number(a.applies === false) - Number(b.applies === false),
                  )
                  .map((check) => (
                    <li key={check.id} className="grid gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{check.name}</span>
                        <Pill
                          tone={
                            check.applies === false
                              ? 'neutral'
                              : check.holds
                                ? 'ready'
                                : check.consequence === 'block'
                                  ? 'blocked'
                                  : 'decision'
                          }
                        >
                          {check.applies === false
                            ? 'Doesn’t apply'
                            : check.holds
                              ? 'Holds'
                              : 'Fails'}
                        </Pill>
                      </span>
                      <span className="text-meta text-muted flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        {check.error ??
                          check.steps.map((step, index) => (
                            <span key={index} className="contents">
                              {index ? <span aria-hidden>→</span> : null}
                              <Step text={step} />
                            </span>
                          ))}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </Fold>
        </td>
      </PresentRow>
    </Fragment>
  );
}

// A row of facts with its label, as the row's detail lists them.
function Facts({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="readout text-muted">{label}</span>
      {children}
    </p>
  );
}

const decided = (decision: Decision, fields: ProposalField[]) =>
  decision.kind === 'approve'
    ? 'Approved'
    : decision.kind === 'reject'
      ? 'Rejected'
      : `Changed to ${valuesWords(decision.values, fields)}`;

/*
  A table row that comes and goes by fading, as a filter shows and hides
  records; the rows after it close up at once, so nothing slides under the
  pointer. Inside AnimatePresence, its exit plays before it leaves.
*/
function PresentRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.tr
      className={className}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: DURATION_STATE, ease: 'easeOut' }}
    >
      {children}
    </motion.tr>
  );
}
