'use client';

import ChevronTriangleUp from 'blode-icons-react/icons/chevron-triangle-up-small-filled';
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
import { Lede, useTrial } from '@/components/sheet-process/trial-parts';
import { Button } from '@/components/ui/button';
import {
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME,
  DATA_TABLE_NAME_COLUMN,
  DATA_TABLE_NAME_UNDER,
  DATA_TABLE_RULE,
  DataTable,
} from '@/components/ui/data-table';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Fold } from '@/components/ui/fold';
import { Pill, type Tone } from '@/components/ui/pill';
import { cx } from '@/lib/cx';
import type {
  CheckVerdict,
  DraftProgress,
  Proposal,
  ProposalRecord,
  Verdict,
} from '@/lib/definitions/types';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';
import { DRAFTING_MODELS, type DraftingModel } from '@/lib/rulebook/models';

import { DataDrawer } from './data-drawer';

type Calculated = {
  calculations: { id: string; name: string }[];
  rows: Record<string, Record<string, number | null>>;
};

type ProposeResponse =
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
const FIELDS = SUBJECT.proposal;

const VERDICT: Record<Verdict, { tone: Tone; label: string }> = {
  ready: { tone: 'ready', label: 'Ready' },
  decide: { tone: 'decision', label: 'Decide' },
  blocked: { tone: 'blocked', label: 'Blocked' },
};

const valuesWords = (values: Record<string, number> | null | undefined) =>
  values
    ? FIELDS.map((field) => `${field.label} ${values[field.id]}`).join(', ')
    : 'no change';

/*
  Propose: for every record, the values the model would set, why, and how the
  accepted checks find them -- and the person's decision on each, in the same
  table. The verdicts are code's. A record passes on approval; one a blocking
  check stops can only be changed to values that pass, or rejected.
*/
export function ProposeStep({
  text,
  readId,
  rulebook,
  progress: kept,
  onProgress,
}: {
  text: string;
  readId: string;
  // The rulebook this run calculated on.
  rulebook: string;
  progress: ProposeProgress | undefined;
  onProgress: (progress: ProposeProgress) => void;
}) {
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
  const proposal = shown?.proposal ?? null;
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
      fingerprint: rulebook,
      proposedAt: from?.at ?? null,
      running: isRunning,
      total: records.length,
      needYou: records.filter(
        ([key, record]) => !next[key] && record.verdict !== 'ready',
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
    run({ ...request, text, readId, rulebook }).then((response) => {
      if (response?.kind === 'proposal') {
        const same =
          kept?.proposedAt && response.proposal?.at === kept.proposedAt;
        report.current(
          progressOf(
            same ? kept.decisions : {},
            response.proposal,
            response.progress?.running ?? false,
          ),
        );
      }
      return response;
    });

  useEffect(() => {
    void ask({ action: 'get' });
    // Once per read and rulebook; the poll below asks again while it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, text, readId, rulebook]);
  const answered = propose.state.kind === 'done';
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

  return (
    <div className="grid gap-4">
      <Lede>
        The model proposes, for every record, what to set and why, trying its
        values against the accepted checks first. The app checks each again; you
        approve, change or reject each one.
      </Lede>
      {body?.kind === 'error' ? (
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
      {proposal && shown ? (
        <ProposalTable
          proposal={proposal}
          names={shown.names}
          calculated={shown.calculated}
          decisions={decisions}
          readId={readId}
          announced={announced}
          onDecide={decide}
          onCheck={(key, values) =>
            run({ action: 'check', text, readId, rulebook, key, values })
          }
        />
      ) : null}
    </div>
  );
}

type Showing = 'all' | 'need' | 'decided';

function ProposalTable({
  proposal,
  names,
  calculated,
  decisions,
  readId,
  announced,
  onDecide,
  onCheck,
}: {
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
    ([key, record]) => !decisions[key] && record.verdict !== 'ready',
  );
  const ready = records.filter(
    ([key, record]) => !decisions[key] && record.verdict === 'ready',
  );
  const decided = records.filter(([key]) => decisions[key]);
  const [showing, setShowing] = useState<Showing>('all');
  const shown =
    showing === 'need' ? needYou : showing === 'decided' ? decided : records;
  const counts = (['blocked', 'decide', 'ready'] as const)
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {counts.map(({ verdict, count }) => (
            <Pill key={verdict} tone={VERDICT[verdict].tone}>
              {count} {VERDICT[verdict].label.toLowerCase()}
            </Pill>
          ))}
          {ready.length ? (
            <Button
              pill
              onPress={() => {
                const at = new Date().toISOString();
                onDecide(
                  Object.fromEntries(
                    ready.map(([key]) => [key, { kind: 'approve', at }]),
                  ),
                  `${ready.length} ready approved`,
                );
              }}
            >
              Approve all {ready.length} ready
            </Button>
          ) : null}
        </div>
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
              <table className="calc-table text-dense w-full border-separate border-spacing-0">
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
                    {FIELDS.map((field) => (
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
                  {shown.length === 0 ? (
                    <tr>
                      <td
                        colSpan={FIELDS.length + 4}
                        className="text-muted px-6 py-2.75"
                      >
                        {showing === 'need'
                          ? 'Nothing needs you.'
                          : 'Nothing decided yet.'}
                      </td>
                    </tr>
                  ) : null}
                  {shown.map(([key, record], rowIndex) => (
                    <ProposalRow
                      key={key}
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
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </DataTable>
        )}
      </DataDrawer>
    </div>
  );
}

function ProposalRow({
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
}: {
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
        FIELDS.map((field) => [field.id, values?.[field.id] ?? 0]),
      ),
    );
    setChecked(null);
  };

  return (
    <Fragment>
      <tr className="align-top">
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
              {decision ? `, ${decided(decision)}` : ''}
            </span>
          </button>
          {name ? <span className={DATA_TABLE_NAME_UNDER}>{name}</span> : null}
        </th>
        <td className={cx(DATA_TABLE_NAME_COLUMN, 'text-muted py-2.75 pr-3')}>
          {name || null}
        </td>
        {FIELDS.map((field) => (
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
              <span className="text-muted">No change</span>
            ) : (
              <span className="value tabular-nums">{values?.[field.id]}</span>
            )}
          </td>
        ))}
        <td className="py-2 pl-3">
          <Pill tone={VERDICT[verdict].tone}>{VERDICT[verdict].label}</Pill>
        </td>
        <td className="py-1.5 pr-4 pl-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {changing ? (
              <>
                <DecisionButton
                  size="small"
                  decision="accept"
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
                      `${key} changed to ${valuesWords(changing)}`,
                    );
                    setChanging(null);
                  }}
                >
                  Save
                </DecisionButton>
                <Button pill size="small" onPress={() => setChanging(null)}>
                  Cancel
                </Button>
              </>
            ) : decision ? (
              <>
                <Pill tone={decision.kind === 'reject' ? 'neutral' : 'ready'}>
                  {decided(decision)}
                </Pill>
                <Button
                  pill
                  size="small"
                  onPress={() => onDecide({ [key]: null }, `${key} undecided`)}
                >
                  Undo
                </Button>
              </>
            ) : (
              <>
                <DecisionButton
                  size="small"
                  decision="accept"
                  isDisabled={record.verdict === 'blocked'}
                  onPress={() =>
                    onDecide(
                      { [key]: { kind: 'approve', at: now() } },
                      `${key} approved`,
                    )
                  }
                >
                  Approve
                </DecisionButton>
                <Button pill size="small" onPress={startChange}>
                  Change
                </Button>
                <DecisionButton
                  size="small"
                  decision="deny"
                  onPress={() =>
                    onDecide(
                      { [key]: { kind: 'reject', at: now() } },
                      `${key} rejected`,
                    )
                  }
                >
                  Reject
                </DecisionButton>
              </>
            )}
          </div>
        </td>
      </tr>
      <tr>
        <td
          colSpan={FIELDS.length + 4}
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
            {checks?.length ? (
              <ul className="grid gap-2" aria-label={`Checks on ${key}`}>
                {checks.map((check) => (
                  <li key={check.id} className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{check.name}</span>
                      <Pill
                        tone={
                          check.holds
                            ? 'ready'
                            : check.consequence === 'block'
                              ? 'blocked'
                              : 'decision'
                        }
                      >
                        {check.holds ? 'Holds' : 'Fails'}
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
      </tr>
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

const decided = (decision: Decision) =>
  decision.kind === 'approve'
    ? 'Approved'
    : decision.kind === 'reject'
      ? 'Rejected'
      : `Changed to ${valuesWords(decision.values)}`;
