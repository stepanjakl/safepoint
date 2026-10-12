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
import { Fold } from '@/components/ui/fold';
import {
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME,
  DataTable,
  DataTableRule,
} from '@/components/ui/data-table';
import { Tooltip } from '@/components/ui/tooltip';
import type {
  Calculation,
  CrossCell,
  CrossCheck,
} from '@/lib/definitions/calculate';
import { cx } from '@/lib/cx';
import { DRAFTING_MODELS, type DraftingModel } from '@/lib/rulebook/models';

type CalculateResponse =
  | { kind: 'calculation'; calculation: Calculation; check: CrossCheck | null }
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
const REVEALED_KEY = 'safepoint:calculate-revealed';
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

// TEMPORARY: extra rows in every state of a cross-check, for reviewing the
// marks. Remove with withPreview and its uses.
const PREVIEW_STATES = true;
const PREVIEW_KEY = 'PREVIEW-';
const PREVIEW_LOOP_MS = 4500;
const PREVIEW_PLAIN_MS = 1500;
const PREVIEW: {
  name: string;
  values: (c: number) => [number | null, number];
}[] = [
  { name: 'Matches, whole', values: () => [42, 42] },
  { name: 'Matches, decimal', values: (c) => [12.35 + c, 12.35 + c] },
  { name: 'Differs, whole', values: (c) => [60 + c, 50 + c] },
  { name: 'Differs, decimal', values: (c) => [80.3 + c, 79.95 + c] },
  { name: 'Mixed', values: (c) => (c ? [7, 8] : [7, 7]) },
  { name: 'Large number', values: () => [12345.67, 12345.67] },
  { name: 'App gave none', values: () => [null, 3] },
];
function withPreview({
  calculation,
  check,
}: {
  calculation: Calculation;
  check: CrossCheck | null;
}) {
  const rows = PREVIEW.map((preview, index) => ({
    key: `${PREVIEW_KEY}${index + 1}`,
    name: preview.name,
    values: Object.fromEntries(
      calculation.calculations.map((c, at) => [
        c.id,
        {
          value: preview.values(at)[0],
          error: preview.values(at)[0] === null ? 'It gave no number.' : null,
          steps: [],
        },
      ]),
    ),
  }));
  return {
    calculation: { ...calculation, rows: [...calculation.rows, ...rows] },
    check: check && {
      ...check,
      cells: {
        ...check.cells,
        ...Object.fromEntries(
          PREVIEW.map((preview, index) => [
            `${PREVIEW_KEY}${index + 1}`,
            Object.fromEntries(
              calculation.calculations.map((c, at) => {
                const [engine, model] = preview.values(at);
                return [
                  c.id,
                  {
                    model,
                    working: 'Preview only.',
                    agrees: engine !== null && engine === model,
                  },
                ];
              }),
            ),
          ]),
        ),
      },
    },
  };
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
  // The rulebook it ran on when the step was opened, before this visit
  // reports the current one.
  const [ranOn] = useState(calculatedOn);
  useEffect(() => {
    void run({ action: 'get', text, readId }).then((response) => {
      if (response?.kind === 'calculation')
        report.current(progressOf(response.calculation, response.check));
    });
  }, [run, text, readId]);
  const [model, setModel] = useState<DraftingModel>(DRAFTING_MODELS[0]!);
  const body = calculate.state.kind === 'done' ? calculate.state.body : null;
  const [last, setLast] = useState<{
    calculation: Calculation;
    check: CrossCheck | null;
  } | null>(null);
  const current = body?.kind === 'calculation' ? body : null;
  if (current && current.calculation !== last?.calculation)
    setLast({ calculation: current.calculation, check: current.check });
  const kept = current ?? last;
  // TEMPORARY: preview rows in every state, while the marks are reviewed.
  const shown = kept && PREVIEW_STATES ? withPreview(kept) : kept;
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
  const crossCheck = () =>
    void run({ action: 'crossCheck', text, readId, model }).then((response) => {
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
      {body?.kind === 'error' ? (
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
          {ranOn && ranOn !== shown.calculation.fingerprint ? (
            <p role="note" className="text-dense text-muted">
              The accepted rules have changed since this run last calculated;
              the values below are worked out on the rules as they are now.
            </p>
          ) : null}
          <CrossCheckControl
            check={kept?.check ?? null}
            busy={busy}
            model={model}
            onModel={setModel}
            onCrossCheck={crossCheck}
          />
          <ValuesTable
            key={replays}
            calculation={shown.calculation}
            check={shown.check}
            reveal={
              revealKey !== null && (replays > 0 || reveal.has(revealKey))
            }
          />
          {PREVIEW_STATES && shown.check ? (
            <div>
              <Button onPress={() => setReplays((count) => count + 1)}>
                Replay the marks (preview)
              </Button>
            </div>
          ) : null}
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

function CrossCheckControl({
  check,
  busy,
  model,
  onModel,
  onCrossCheck,
}: {
  check: CrossCheck | null;
  busy: boolean;
  model: DraftingModel;
  onModel: (model: DraftingModel) => void;
  onCrossCheck: () => void;
}) {
  const differ = check ? check.total - check.agreed : 0;
  return (
    <div className="grid gap-3">
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
            <span className="text-dense text-muted">
              Cross-checked by {check.model}
            </span>
          </Outcome>
        ) : busy ? (
          <span className="text-dense text-muted">Working…</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <ModelSelect model={model} busy={busy} onChange={onModel} />
        <Button
          variant={check ? 'secondary' : 'primary'}
          isDisabled={busy}
          onPress={onCrossCheck}
        >
          {check ? 'Cross-check again' : 'Cross-check with the model'}
        </Button>
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
}: {
  calculation: Calculation;
  check: CrossCheck | null;
  // Whether the cross-check's marks arrive value by value, or are just there.
  reveal: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const tableId = useId();
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const { calculations, rows } = calculation;
  // TEMPORARY: the preview rows rest as plain numbers for a moment, then
  // their marks arrive again, every few seconds.
  const firstPreview = rows.findIndex((r) => r.key.startsWith(PREVIEW_KEY));
  const [previewLoop, setPreviewLoop] = useState(0);
  const [previewPlain, setPreviewPlain] = useState(false);
  useEffect(() => {
    if (firstPreview < 0 || !check) return;
    let rest: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setPreviewPlain(true);
      rest = setTimeout(() => {
        setPreviewPlain(false);
        setPreviewLoop((count) => count + 1);
      }, PREVIEW_PLAIN_MS);
    }, PREVIEW_LOOP_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(rest);
    };
  }, [firstPreview, check]);
  // The whole table in about a second, however long it is.
  const step = Math.min(
    REVEAL_STEP_MS,
    REVEAL_TOTAL_MS / Math.max(1, rows.length * calculations.length),
  );
  return (
    <DataTable>
      {/* Scrolls across only: a fold's clip margin under the last row would
          otherwise make it scroll a few pixels down. */}
      <div className="min-w-0 overflow-x-auto overflow-y-hidden">
        <table className="text-dense w-full border-separate border-spacing-0">
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
              <th scope="col" className={cx(DATA_TABLE_HEAD, 'pr-3 text-left')}>
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
            {rows.map((row, rowIndex) => {
              const preview = row.key.startsWith(PREVIEW_KEY);
              const expanded = open.has(row.key);
              const differs = calculations.some(
                (c) => check?.cells[row.key]?.[c.id]?.agrees === false,
              );
              return (
                <Fragment key={row.key}>
                  <tr className="align-top">
                    <th
                      scope="row"
                      className="py-2.75 pr-3 pl-6 text-left font-medium"
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
                    </th>
                    <td className="text-muted py-2.75 pr-3">
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
                            // TEMPORARY: a preview row remounts on each
                            // loop, so its marks arrive again.
                            key={preview ? previewLoop : undefined}
                            value={cell.value}
                            cross={preview && previewPlain ? undefined : cross}
                            reveal={reveal || preview}
                            delay={
                              ((preview ? rowIndex - firstPreview : rowIndex) *
                                calculations.length +
                                calculations.indexOf(c)) *
                              step
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {/* Always there, folded shut, carrying the rule below the
                      record. */}
                  <tr>
                    <td colSpan={calculations.length + 2} className="p-0">
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
                      {rowIndex < rows.length - 1 ? (
                        <DataTableRule led />
                      ) : null}
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

const REVEAL_STEP_MS = 50;
const REVEAL_TOTAL_MS = 1000;

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
  delay,
}: {
  value: number | null;
  cross: CrossCell | undefined;
  reveal: boolean;
  delay: number;
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
        style={{ '--calc-delay': `${delay}ms` } as CSSProperties}
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
