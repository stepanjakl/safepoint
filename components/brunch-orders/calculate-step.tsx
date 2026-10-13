'use client';

import Check from 'blode-icons-react/icons/checkmark-1-small';
import ChevronTriangleUp from 'blode-icons-react/icons/chevron-triangle-up-small-filled';
import Cross from 'blode-icons-react/icons/cross-small';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { FromModel, Step } from '@/components/brunch-orders/rules-parts';
import { ModelSelect } from '@/components/brunch-orders/rules-step';
import {
  Lede,
  Outcome,
  StatusChip,
  plural,
  useTrial,
} from '@/components/sheet-process/trial-parts';
import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Fold } from '@/components/ui/fold';
import {
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME,
  DATA_TABLE_NAME_COLUMN,
  DATA_TABLE_NAME_UNDER,
  DATA_TABLE_RULE,
  DataTable,
} from '@/components/ui/data-table';
import { Tooltip } from '@/components/ui/tooltip';
import type {
  Calculation,
  CrossCell,
  CrossCheck,
} from '@/lib/definitions/calculate';
import { cx } from '@/lib/cx';
import { DRAFTING_MODELS, type DraftingModel } from '@/lib/rulebook/models';

import { StaleRules, type StaleReply } from './stale-rules';

type CalculateResponse =
  | {
      kind: 'calculation';
      calculation: Calculation;
      check: CrossCheck | null;
      // The accepted rulebook now, which a run pinned to an earlier one can
      // move to.
      current: string;
    }
  | StaleReply
  | { kind: 'error'; message: string };

// How far Calculate has got, for the step's mark: the rulebook it ran on and
// how many values the model's cross-check agreed with.
export type CalculateProgress = {
  fingerprint: string;
  agreed: number;
  total: number;
  checked: boolean;
};

const progressOf = (
  calculation: Calculation,
  check: CrossCheck | null,
): CalculateProgress => ({
  fingerprint: calculation.fingerprint,
  agreed: check?.agreed ?? 0,
  total: calculation.rows.length * calculation.calculations.length,
  checked: check !== null,
});

// Which cross-checks this browser has seen arrive, so a reload does not
// replay them.
const REVEALED_KEY = 'safepoint.calculate-revealed.v1';
function seenReveal(key: string): boolean {
  try {
    return (localStorage.getItem(REVEALED_KEY) ?? '').split('\n').includes(key);
  } catch {
    return false;
  }
}
function markRevealed(key: string) {
  try {
    const kept = (localStorage.getItem(REVEALED_KEY) ?? '')
      .split('\n')
      .filter((entry) => entry && entry !== key)
      .slice(-19);
    localStorage.setItem(REVEALED_KEY, [...kept, key].join('\n'));
  } catch {
    // Without storage the marks arrive on every visit; nothing breaks.
  }
}

/*
  Calculate: every value the accepted rulebook defines, worked out by code for
  every record of the run's read. These are the values later steps use. The
  model can cross-check them, working them out on its own from the
  instructions and the data without the formulas; where it differs, the
  formula or the model has read the instructions another way, and a person
  looks before anything is proposed.
*/
export function CalculateStep({
  text,
  readId,
  calculatedOn,
  onProgress,
}: {
  text: string;
  readId: string;
  // The rulebook the run last calculated on, if any.
  calculatedOn: string | null;
  onProgress: (progress: CalculateProgress) => void;
}) {
  const calculate = useTrial<CalculateResponse>(
    '/api/dev/brunch-orders/calculate',
  );
  const { run } = calculate;
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });
  // The rulebook this run calculates on: the one it first used, kept as it
  // was, until the person moves it to the current one.
  const [pin, setPin] = useState(calculatedOn);
  useEffect(() => {
    void run({ action: 'get', text, readId, rulebook: pin ?? undefined }).then(
      (response) => {
        if (response?.kind === 'calculation')
          report.current(progressOf(response.calculation, response.check));
      },
    );
  }, [run, text, readId, pin]);
  const [model, setModel] = useState<DraftingModel>(DRAFTING_MODELS[0]!);
  const body = calculate.state.kind === 'done' ? calculate.state.body : null;
  const [last, setLast] = useState<Extract<
    CalculateResponse,
    { kind: 'calculation' }
  > | null>(null);
  const current = body?.kind === 'calculation' ? body : null;
  if (current && current.calculation !== last?.calculation) setLast(current);
  const shown = current ?? last;
  const busy = calculate.state.kind === 'running';
  // The marks arrive once per cross-check: when it finishes, or when the
  // step is first opened on one this browser has not seen arrive.
  const revealKey = shown?.check
    ? `${shown.check.fingerprint}:${shown.check.at}`
    : null;
  const [replays, setReplays] = useState(0);
  const [reveal] = useState(() => new Set<string>());
  if (revealKey && !reveal.has(revealKey) && !seenReveal(revealKey))
    reveal.add(revealKey);
  useEffect(() => {
    if (revealKey) markRevealed(revealKey);
  }, [revealKey]);
  // The records whose values the model worked out otherwise.
  const differing = new Set(
    shown?.check
      ? Object.entries(shown.check.cells)
          .filter(([, values]) => Object.values(values).some((v) => !v.agrees))
          .map(([key]) => key)
      : [],
  );
  const [showing, setShowing] = useState<Showing>('all');
  const crossCheck = () =>
    void run({
      action: 'crossCheck',
      text,
      readId,
      model,
      rulebook: shown?.calculation.fingerprint,
    }).then((response) => {
      if (response?.kind === 'calculation')
        report.current(progressOf(response.calculation, response.check));
    });

  return (
    <div className="grid gap-4">
      <Lede>
        Code works out every value the accepted rules define, for each record of
        this run&rsquo;s data. These are the values the later steps use. The
        model can cross-check them, working each one out on its own from the
        instructions, without the formulas.
      </Lede>
      {body?.kind === 'stale' ? (
        <StaleRules stale={body} onMove={() => setPin(null)} />
      ) : body?.kind === 'error' ? (
        <p role="alert" className="text-dense text-state-blocked">
          {body.message}
        </p>
      ) : calculate.state.kind === 'failed' ? (
        <p role="alert" className="text-dense text-state-blocked">
          {calculate.state.message}
        </p>
      ) : null}
      {shown ? (
        <>
          {shown.current !== shown.calculation.fingerprint ? (
            <div role="note" className="flex flex-wrap items-center gap-3">
              <p className="text-dense text-muted max-w-prose">
                The rules accepted for these instructions have changed since
                this run calculated. These values are from the rules it used.
              </p>
              <Button isDisabled={busy} onPress={() => setPin(null)}>
                Calculate on the current rules
              </Button>
            </div>
          ) : null}
          {/* Scaffolding for trying the step, as the read's and the rules'
              setups are. */}
          <section
            aria-label="Cross-check setup"
            className="brunch-trial rounded-shell grid gap-3 p-4"
          >
            <div className="flex flex-wrap items-end gap-3">
              <ModelSelect model={model} busy={busy} onChange={setModel} />
              <Button
                variant={shown.check ? 'secondary' : 'primary'}
                isDisabled={busy}
                onPress={crossCheck}
              >
                {shown.check
                  ? 'Cross-check again'
                  : 'Cross-check with the model'}
              </Button>
              {shown.check ? (
                <Button onPress={() => setReplays((count) => count + 1)}>
                  Replay the marks
                </Button>
              ) : null}
            </div>
            <p className="text-meta text-muted max-w-prose">
              The model works every value out again from the instructions and
              the data, without the formulas. If the model is busy or out of
              quota, the next older one of its family answers.
            </p>
          </section>
          <CrossCheckResult
            check={shown.check}
            busy={busy}
            records={shown.calculation.rows.length}
            differing={differing.size}
            showing={showing}
            onShow={setShowing}
          />
          <ValuesTable
            key={replays}
            calculation={shown.calculation}
            check={shown.check}
            only={showing === 'differ' ? differing : null}
            reveal={
              revealKey !== null && (replays > 0 || reveal.has(revealKey))
            }
          />
          <p className="text-meta text-muted">
            On the accepted rules{' '}
            <code className="value">{shown.calculation.fingerprint}</code> (
            {plural(shown.calculation.accepted, 'definition')}).
          </p>
        </>
      ) : busy ? (
        <p className="text-dense text-muted">Working the values out…</p>
      ) : null}
    </div>
  );
}

type Showing = 'all' | 'differ';

// What the model's cross-check came to, announced as it arrives, and which
// records the table shows.
function CrossCheckResult({
  check,
  busy,
  records,
  differing,
  showing,
  onShow,
}: {
  check: CrossCheck | null;
  busy: boolean;
  records: number;
  differing: number;
  showing: Showing;
  onShow: (showing: Showing) => void;
}) {
  const differ = check ? check.total - check.agreed : 0;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="status">
          {check ? (
            <Outcome>
              {differ ? (
                <StatusChip tone="blocked">
                  <Cross
                    aria-hidden
                    size={12}
                    strokeWidth={2.75}
                    className="me-1"
                  />
                  {differ} of {check.total} don&rsquo;t match the model
                </StatusChip>
              ) : (
                <StatusChip tone="ready">
                  <Check
                    aria-hidden
                    size={12}
                    strokeWidth={2.75}
                    className="me-1"
                  />
                  All {check.total} match the model
                </StatusChip>
              )}
            </Outcome>
          ) : busy ? (
            <span className="text-dense text-muted">Working…</span>
          ) : null}
        </div>
        {check ? (
          <FilterTabs
            size="small"
            ariaLabel="Records to show"
            tabs={[
              {
                key: 'all',
                short: 'All',
                label: 'All records',
                count: records,
              },
              {
                key: 'differ',
                short: 'Don’t match',
                label: 'Records that don’t match the model',
                count: differing,
                severity: 0,
              },
            ]}
            selected={showing}
            onChange={onShow}
          />
        ) : null}
      </div>
      {differ ? (
        <p className="text-meta text-muted max-w-prose">
          Where they differ, the rule&rsquo;s formula or the model has read the
          instructions another way. Open the record to compare the two workings.
        </p>
      ) : null}
    </div>
  );
}

// One row per record, one column per value; a record opens to show how each
// of its values was worked out.
function ValuesTable({
  calculation,
  check,
  reveal,
  only,
}: {
  calculation: Calculation;
  check: CrossCheck | null;
  // Whether the cross-check's marks arrive value by value, or are just there.
  reveal: boolean;
  // Only these records, where the person asked for those that differ.
  only: Set<string> | null;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const tableId = useId();
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const { calculations } = calculation;
  const rows = only
    ? calculation.rows.filter((row) => only.has(row.key))
    : calculation.rows;
  return (
    <DataTable>
      {/* Scrolls across only: a fold's clip margin under the last row would
          otherwise make it scroll a few pixels down. */}
      <div className="min-w-0 overflow-x-auto overflow-y-hidden">
        <table className="calc-table text-dense w-full border-separate border-spacing-0">
          <caption className="sr-only">
            Values worked out for every record
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
                  'pr-3 text-left',
                )}
              >
                <span className="sr-only">Name</span>
              </th>
              {calculations.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cx(DATA_TABLE_HEAD, 'pl-3 text-right last:pr-4')}
                >
                  <Tooltip label={c.name} description={c.text}>
                    <span tabIndex={0} className="cursor-help">
                      {c.name}
                    </span>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={calculations.length + 2}
                  className="text-muted px-6 py-2.75"
                >
                  Every value matches the model.
                </td>
              </tr>
            ) : null}
            {rows.map((row, rowIndex) => {
              const expanded = open.has(row.key);
              const differs = calculations.some(
                (c) => check?.cells[row.key]?.[c.id]?.agrees === false,
              );
              return (
                <Fragment key={row.key}>
                  <tr className="calc-row align-top">
                    <th
                      scope="row"
                      className="py-2.75 pr-3 pl-6 text-left font-medium whitespace-nowrap"
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`${tableId}-${row.key}`}
                        onClick={() => toggle(row.key)}
                        className="calc-row-toggle text-left"
                      >
                        <ChevronTriangleUp
                          aria-hidden
                          className="calc-row-chevron"
                        />
                        <span className={DATA_TABLE_NAME}>{row.key}</span>
                        {differs ? (
                          <span className="sr-only">
                            , differs from the model
                          </span>
                        ) : null}
                      </button>
                      {row.name ? (
                        <span className={DATA_TABLE_NAME_UNDER}>
                          {row.name}
                        </span>
                      ) : null}
                    </th>
                    <td
                      className={cx(
                        DATA_TABLE_NAME_COLUMN,
                        'text-muted py-2.75 pr-3',
                      )}
                    >
                      {row.name || null}
                    </td>
                    {calculations.map((c) => {
                      const cell = row.values[c.id]!;
                      const cross = check?.cells[row.key]?.[c.id];
                      return (
                        <td
                          key={c.id}
                          className="py-2.25 pl-3 text-right last:pr-4"
                        >
                          <CheckedValue
                            value={cell.value}
                            cross={cross}
                            reveal={reveal}
                            // Its turn in reading order, of how many.
                            order={[
                              rowIndex * calculations.length +
                                calculations.indexOf(c),
                              rows.length * calculations.length,
                            ]}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {/* Always there, folded shut, and ruled off from the next record. */}
                  <tr>
                    <td
                      colSpan={calculations.length + 2}
                      className={cx(
                        'p-0',
                        rowIndex < rows.length - 1 && DATA_TABLE_RULE,
                      )}
                    >
                      <Fold
                        open={expanded}
                        id={`${tableId}-${row.key}`}
                        className="px-6 pt-1 pb-4"
                      >
                        <ul className="grid gap-3 ps-5">
                          {calculations.map((c) => {
                            const cell = row.values[c.id]!;
                            const cross = check?.cells[row.key]?.[c.id];
                            return (
                              <li key={c.id} className="grid gap-1.5">
                                <span className="font-medium">{c.name}</span>
                                <p className="text-meta text-muted flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                  <span className="sr-only">Worked out:</span>
                                  {cell.steps.map((step, index) => (
                                    <span key={index} className="contents">
                                      {index ? (
                                        <span aria-hidden>→</span>
                                      ) : null}
                                      <Step text={step} />
                                    </span>
                                  ))}
                                  {cell.steps.length ? (
                                    <span aria-hidden>→</span>
                                  ) : null}
                                  <span className="sr-only">gives</span>
                                  <StatusChip tone="neutral">
                                    {cell.error ?? cell.value}
                                  </StatusChip>
                                </p>
                                {cross ? (
                                  <FromModel>
                                    <p className="text-dense">
                                      <span className="font-medium">
                                        Gives {cross.model}.
                                      </span>{' '}
                                      {cross.working}
                                    </p>
                                  </FromModel>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </Fold>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </DataTable>
  );
}

/*
  One value: the engine's, plain until the model has cross-checked it, then
  on a pill in the tone of their match with its mark -- and, where they
  differ, the model's own number. The model's working is on the pill's
  tooltip.
*/
function CheckedValue({
  value,
  cross,
  reveal,
  order: [index, count],
}: {
  value: number | null;
  cross: CrossCell | undefined;
  reveal: boolean;
  order: [number, number];
}) {
  if (!cross)
    return (
      <span className="calc-value value tabular-nums">{value ?? '—'}</span>
    );
  const Mark = cross.agrees ? Check : Cross;
  return (
    <Tooltip
      label={`The model gives ${cross.model}`}
      description={cross.working}
    >
      <span
        tabIndex={0}
        data-severity={cross.agrees ? 3 : 0}
        data-reveal={reveal || undefined}
        style={
          { '--calc-index': index, '--calc-count': count } as CSSProperties
        }
        className="calc-value bg-severity-pill value cursor-help tabular-nums"
      >
        {value ?? '—'}
        <span className="calc-value-tail">
          <span className="text-severity-ink">
            <Mark
              aria-hidden
              size={14}
              strokeWidth={2.75}
              className="flex-none"
            />
            {cross.agrees ? null : cross.model}
          </span>
        </span>
        <span className="sr-only">
          {cross.agrees
            ? ', matches the model'
            : `, the model gives ${cross.model}`}
        </span>
      </span>
    </Tooltip>
  );
}
