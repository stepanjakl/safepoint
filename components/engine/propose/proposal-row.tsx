'use client';

import ArrowRotateCounterClockwise from 'blode-icons-react/icons/arrow-rotate-counter-clockwise';
import ChevronTriangleUp from 'blode-icons-react/icons/chevron-triangle-up-small-filled';
import Cross from 'blode-icons-react/icons/cross-small';
import Pencil from 'blode-icons-react/icons/pencil';
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from 'motion/react';
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import { DecisionButton } from '@/components/engine/decision-button';
import { FromModel, Step } from '@/components/engine/rules-parts';
import { Code } from '@/components/engine/trial-parts';
import { Button } from '@/components/ui/button';
import {
  DATA_TABLE_NAME,
  DATA_TABLE_NAME_COLUMN,
  DATA_TABLE_NAME_UNDER,
  DATA_TABLE_SECONDARY_NAME,
  DATA_TABLE_RULE,
} from '@/components/ui/data-table';
import { Fold } from '@/components/ui/fold';
import { IconButton } from '@/components/ui/icon-button';
import { Pill } from '@/components/ui/pill';
import { cx } from '@/lib/ui/cx';
import { DURATION_STATE } from '@/lib/ui/motion';
import type { CheckVerdict, ProposalRecord, Verdict } from '@/lib/engine/types';
import { sourceTermsOf, type SourceKind } from '@/lib/sources/model';

import { madeNow } from './made-now';
import type { Calculated, Decision, ProposalField, CheckReply } from './types';
import { VERDICT } from './verdict';

const valuesWords = (
  values: Record<string, number> | null | undefined,
  fields: ProposalField[],
) =>
  values
    ? fields.map((field) => `${field.label} ${values[field.id]}`).join(', ')
    : 'no change';

function citationsByTab(cells: string[], source?: SourceKind) {
  const address = sourceTermsOf(source).address;
  const groups = new Map<string | null, string[]>();
  for (const cell of cells) {
    const tab = source === 'database' ? null : address.resourceOf(cell);
    const group = groups.get(tab);
    if (group) group.push(cell);
    else groups.set(tab, [cell]);
  }
  return [...groups];
}

export function ProposalRow({
  fields,
  id,
  recordKey: key,
  name,
  record,
  decision,
  expanded,
  ruled,
  calculated,
  source,
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
  source?: SourceKind;
  onToggle: () => void;
  onDecide: (changes: Record<string, Decision | null>, words: string) => void;
  onCheck: (
    key: string,
    values: Record<string, number>,
  ) => Promise<CheckReply | null>;
  onCite: (cell: string) => void;
}) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const compactNameRef = useRef<HTMLSpanElement>(null);
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

  const decisionState = changing ? 'changing' : decision ? 'decided' : 'open';
  return (
    <Fragment>
      <tr className="calc-row align-top">
        <th
          scope="row"
          className="py-2.75 pr-3 pl-6 text-left font-medium whitespace-nowrap max-sm:w-full max-sm:max-w-0"
        >
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={onToggle}
            onWheel={(event) => {
              const name = nameRef.current?.getClientRects().length
                ? nameRef.current
                : compactNameRef.current;
              if (name)
                name.scrollLeft += event.shiftKey ? event.deltaY : event.deltaX;
            }}
            className="calc-row-toggle text-left"
          >
            <ChevronTriangleUp aria-hidden className="calc-row-chevron" />
            <span className={DATA_TABLE_NAME}>{key}</span>
            <span className="sr-only">
              , {VERDICT[verdict].label}
              {decision ? `, ${decided(decision, fields)}` : ''}
            </span>
          </button>
          {name ? (
            <span
              ref={compactNameRef}
              className={cx(DATA_TABLE_NAME_UNDER, 'truncate')}
            >
              {name}
            </span>
          ) : null}
        </th>
        <td
          className={cx(
            DATA_TABLE_NAME_COLUMN,
            DATA_TABLE_SECONDARY_NAME,
            'w-full max-w-0 py-2.75 pr-3',
          )}
        >
          {name ? (
            <span
              ref={nameRef}
              className="block overflow-hidden text-ellipsis whitespace-nowrap"
            >
              {name}
            </span>
          ) : null}
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
        <td className="py-2 pl-3 align-middle">
          <Pill tone={VERDICT[verdict].tone}>{VERDICT[verdict].label}</Pill>
        </td>
        <td className="py-1.5 pr-4 pl-3 text-right align-middle">
          <AnimatePresence initial={false} mode="wait">
            <DecisionControls key={decisionState} focusFallback={toggleRef}>
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
                          [key]: madeNow('change', now(), {
                            values: changing,
                            checked: checked!,
                          }),
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
                    {decision.kind === 'change'
                      ? 'Changed'
                      : decided(decision, fields)}
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
                        { [key]: madeNow('approve', now()) },
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
                        { [key]: madeNow('reject', now()) },
                        `${key} rejected`,
                      )
                    }
                  />
                </>
              )}
            </DecisionControls>
          </AnimatePresence>
        </td>
      </tr>
      <tr>
        <td
          colSpan={fields.length + 4}
          className={cx('p-0', ruled && DATA_TABLE_RULE)}
        >
          <Fold open={expanded} id={id} className="grid gap-5 px-6 pt-1 pb-4">
            <FromModel
              label={<h3 className="readout text-muted">Model rationale</h3>}
            >
              <p className="text-dense">{record.reason}</p>
              {record.unsure ? (
                <p className="text-dense">
                  <span className="font-medium">Unsure: </span>
                  {record.unsure}
                </p>
              ) : null}
            </FromModel>
            {record.cited.length ? (
              <section className="grid gap-2">
                <h3 className="readout text-muted">Source cells</h3>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  {citationsByTab(record.cited, source).map(([tab, cells]) => (
                    <div
                      key={tab ?? ''}
                      className="text-dense flex flex-wrap items-baseline gap-x-2 gap-y-1"
                    >
                      {tab ? <span>{tab}</span> : null}
                      {cells.map((cell) => {
                        const reference = tab
                          ? cell.slice(tab.length + 1)
                          : cell;
                        return (
                          <button
                            key={cell}
                            type="button"
                            aria-label={tab ? `${tab} ${reference}` : undefined}
                            className="value text-state-advisory focus-visible:outline-state-advisory rounded-sm underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2"
                            onClick={() => onCite(cell)}
                          >
                            {reference}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {calculated.calculations.length ? (
              <section className="grid gap-2">
                <h3 className="readout text-muted">Calculations</h3>
                <dl className="grid gap-2">
                  {calculated.calculations.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-baseline gap-2"
                    >
                      <dt className="font-medium">{c.name}</dt>
                      <dd>
                        <Code>{calculated.rows[key]?.[c.id] ?? '—'}</Code>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
            {checks?.length ? (
              <section className="grid gap-2">
                <h3 className="readout text-muted">Rule checks</h3>
                <ul className="grid gap-2" aria-label={`Checks on ${key}`}>
                  {/* Those a guard settles for this record come last: they
                    say nothing about the values. Decisions kept before the
                    verdicts said so read as applying. */}
                  {[...checks]
                    .sort(
                      (a, b) =>
                        Number(a.applies === false) -
                        Number(b.applies === false),
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
              </section>
            ) : null}
          </Fold>
        </td>
      </tr>
    </Fragment>
  );
}

const decided = (decision: Decision, fields: ProposalField[]) =>
  decision.kind === 'approve'
    ? 'Approved'
    : decision.kind === 'reject'
      ? 'Rejected'
      : `Changed to ${valuesWords(decision.values, fields)}`;

function DecisionControls({
  children,
  focusFallback,
}: {
  children: ReactNode;
  focusFallback: RefObject<HTMLButtonElement | null>;
}) {
  const present = useIsPresent();
  const reduceMotion = useReducedMotion();
  const controls = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const group = controls.current;
    if (!group) return;
    if (!present && group.contains(document.activeElement))
      focusFallback.current?.focus({ preventScroll: true });
    group.inert = !present;
  }, [present, focusFallback]);

  return (
    <motion.div
      ref={controls}
      className="flex items-center justify-end gap-1.5"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: reduceMotion ? 0 : DURATION_STATE,
        ease: 'easeOut',
      }}
    >
      {children}
    </motion.div>
  );
}
