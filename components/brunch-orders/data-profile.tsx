'use client';

import { useEffect, useId, useRef, useState, type Ref } from 'react';

import { DecisionButton } from '@/components/brunch-orders/decision-button';
import {
  Code,
  StatusChip,
  dateTime,
  plural,
} from '@/components/brunch-orders/trial-parts';
import { Button } from '@/components/ui/button';
import { ChoiceGroup } from '@/components/ui/choice-group';
import { Fold } from '@/components/ui/fold';
import { MorphingText } from '@/components/ui/morphing-text';
import { cx } from '@/lib/cx';
import type {
  DataProfile,
  ProfileColumn,
  ProfileState,
} from '@/lib/definitions/types';

/*
  What the data's columns hold, for a person to confirm before the rules are
  drafted: each column's words, its type, and, where the data has blanks in
  it, what a blank cell means for every rule that reads it. Columns still
  waiting for that answer come first. Words for the columns come from the
  profile, so nothing here names a process.
*/

// The types a person may give a column the app inferred.
const CHOOSABLE = ['whole_number', 'decimal', 'yes_no', 'text'] as const;
type Choosable = (typeof CHOOSABLE)[number];

const TYPE_WORDS: Record<string, string> = {
  key: 'Key',
  text: 'Text',
  whole_number: 'Whole number',
  decimal: 'Decimal',
  percent: 'Percentage',
  money: 'Money',
  date: 'Date',
  datetime: 'Date and time',
  weekday: 'Day of the week',
  time_of_day: 'Time of day',
  yes_no: 'Yes or no',
  one_of: 'One of a list',
};

const BLANK_CHOICES = [
  { value: 'skip', label: 'The rule doesn’t apply' },
  { value: 'fail', label: 'The rule fails' },
] as const;

// A column a person still has to answer for.
const unanswered = (column: ProfileColumn) =>
  column.blanksSeen && column.blank === null;

export type ProfileChange =
  | { action: 'profile' }
  | { action: 'confirmProfile' }
  | {
      action: 'profileColumn';
      column: string;
      label?: string;
      type?: Choosable;
      blank?: 'skip' | 'fail';
    };

export function DataProfilePanel({
  state,
  busy,
  canRead,
  drafted,
  headingRef,
  className,
  onChange,
}: {
  state: ProfileState | null;
  // The face it is drawn on, as the step's other asks are.
  className?: string;
  busy: boolean;
  // Whether the run has read the data the columns are worked out from.
  canRead: boolean;
  // Rules are kept, so the panel is a look back rather than the first step.
  drafted: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  onChange: (change: ProfileChange) => void;
}) {
  const headingId = useId();
  const confirmed = state?.state === 'confirmed';
  // What changed, said aloud: confirming, or an edit that undoes it.
  const [said, setSaid] = useState('');
  const [seen, setSeen] = useState(state?.state ?? null);
  if ((state?.state ?? null) !== seen) {
    setSeen(state?.state ?? null);
    setSaid(
      state?.state === 'confirmed'
        ? 'The data is confirmed.'
        : seen === 'confirmed' && state?.state === 'review'
          ? 'Changed: confirm the data again before it is used.'
          : '',
    );
  }
  return (
    <section
      aria-labelledby={headingId}
      className={cx(className, 'grid gap-3 p-4')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-dense font-semibold"
        >
          The data’s columns
        </h4>
        {state && state.state !== 'none' ? (
          <span className="ml-auto">
            <StatusChip tone={confirmed ? 'ready' : 'decision'}>
              {confirmed ? 'Confirmed' : 'Not confirmed'}
            </StatusChip>
          </span>
        ) : null}
      </div>
      <p className="text-dense text-muted max-w-prose">
        What each column holds, and what a blank cell means. Every rule is
        checked against this, so confirm it before the rules are drafted.
      </p>
      <p role="status" className="sr-only">
        {said}
      </p>
      {!state || state.state === 'none' ? (
        <Proposal
          proposed={state?.proposed ?? null}
          canRead={canRead}
          busy={busy}
          onKeep={() => onChange({ action: 'profile' })}
        />
      ) : (
        <Columns
          profile={state.profile}
          confirmed={confirmed}
          drafted={drafted}
          busy={busy}
          onChange={onChange}
        />
      )}
    </section>
  );
}

function Proposal({
  proposed,
  canRead,
  busy,
  onKeep,
}: {
  proposed: DataProfile | null;
  canRead: boolean;
  busy: boolean;
  onKeep: () => void;
}) {
  if (!proposed)
    return (
      <p className="text-dense text-muted">
        {canRead
          ? 'This read does not fit what the process reads, so its columns cannot be worked out. The Read step says why.'
          : 'Read the data first: the columns are worked out from it.'}
      </p>
    );
  const blanks = proposed.columns.filter((c) => c.blanksSeen).length;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-dense">
        {plural(proposed.columns.length, 'column')} in this read
        {blanks
          ? `, ${plural(blanks, 'column')} with blank cells to say the meaning of.`
          : '.'}
      </p>
      <Button
        size="medium"
        variant="primary"
        isDisabled={busy}
        onPress={onKeep}
      >
        Review the columns
      </Button>
    </div>
  );
}

function Columns({
  profile,
  confirmed,
  drafted,
  busy,
  onChange,
}: {
  profile: DataProfile;
  confirmed: boolean;
  drafted: boolean;
  busy: boolean;
  onChange: (change: ProfileChange) => void;
}) {
  const open = profile.columns.filter(unanswered);
  const rest = profile.columns.filter((c) => !unanswered(c));
  const restId = useId();
  const [showRest, setShowRest] = useState(false);
  // An answered column leaves the list it was answered in: focus moves on to
  // the next question, or to Confirm when none is left.
  const panel = useRef<HTMLDivElement>(null);
  const answering = useRef(false);
  useEffect(() => {
    if (!answering.current) return;
    answering.current = false;
    const next =
      panel.current?.querySelector<HTMLElement>(
        '[data-unanswered] [role="group"] button',
      ) ?? panel.current?.querySelector<HTMLElement>('[data-confirm]');
    next?.focus();
  }, [profile.id]);
  const change = (request: ProfileChange) => {
    if (busy) return;
    if (request.action === 'profileColumn' && request.blank)
      answering.current = unanswered(
        profile.columns.find((c) => c.column === request.column)!,
      );
    onChange(request);
  };
  const row = (column: ProfileColumn) => (
    <ColumnRow key={column.column} column={column} onChange={change} />
  );
  return (
    <div ref={panel} className="grid gap-3">
      <p className="text-dense">
        <MorphingText
          text={
            confirmed
              ? `Confirmed ${dateTime(profile.confirmedAt!)}.${drafted ? '' : ' The rules can be drafted.'}`
              : open.length
                ? `${plural(open.length, 'column has', 'columns have')} blank cells with no meaning yet. Not confirmed.`
                : 'Every blank has a meaning. Not confirmed: confirm it to draft the rules.'
          }
        />
      </p>
      {open.length ? (
        <ul
          className="grid gap-2"
          aria-label="Columns that need an answer"
          data-unanswered=""
        >
          {open.map(row)}
        </ul>
      ) : null}
      <div className="grid gap-2">
        <div>
          <Button
            size="medium"
            aria-expanded={showRest}
            aria-controls={restId}
            onPress={() => setShowRest(!showRest)}
          >
            {showRest
              ? `Hide the ${open.length ? 'other ' : ''}columns`
              : `Show the ${open.length ? 'other ' : ''}${plural(rest.length, 'column')}`}
          </Button>
        </div>
        <Fold open={showRest} id={restId}>
          <ul
            className="grid gap-2"
            aria-label={open.length ? 'Other columns' : 'Columns'}
          >
            {rest.map(row)}
          </ul>
        </Fold>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DecisionButton
          decision="accept"
          data-confirm=""
          className="decision-morph-control"
          aria-disabled={confirmed || busy}
          onPress={() => {
            if (!confirmed) change({ action: 'confirmProfile' });
          }}
        >
          {confirmed ? 'Confirmed' : 'Confirm the data'}
        </DecisionButton>
        {!confirmed && open.length ? (
          <span className="text-meta text-muted">
            A rule reading an unanswered column can’t be accepted until it has
            an answer.
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Never disabled while a change is out: a control that goes disabled under
// focus drops it. The panel ignores a change made while one is out.
function ColumnRow({
  column,
  onChange,
}: {
  column: ProfileColumn;
  onChange: (change: ProfileChange) => void;
}) {
  const labelId = useId();
  const typeId = useId();
  const [label, setLabel] = useState(column.label);
  const [kept, setKept] = useState(column.label);
  if (column.label !== kept) {
    setKept(column.label);
    setLabel(column.label);
  }
  const save = () => {
    const words = label.trim();
    if (words && words !== column.label)
      onChange({
        action: 'profileColumn',
        column: column.column,
        label: words,
      });
    else setLabel(column.label);
  };
  const typeWords = column.type
    ? (TYPE_WORDS[column.type.kind] ?? column.type.kind)
    : 'Not known: blank throughout';
  return (
    <li className="bg-surface-inset rounded-control grid gap-2 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={labelId} className="grid min-w-48 flex-1 gap-1">
          <span className="text-meta text-muted">
            Called <Code>{column.column}</Code> in the data
          </span>
          <input
            id={labelId}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setLabel(column.label);
            }}
            className="field text-dense min-h-8 px-3"
          />
        </label>
        {column.origin === 'declared' ? (
          <p className="grid gap-1">
            <span className="text-meta text-muted">Type</span>
            <span className="text-dense">{typeWords}, set by the process</span>
          </p>
        ) : (
          <label htmlFor={typeId} className="grid gap-1">
            <span className="text-meta text-muted">Type</span>
            <select
              id={typeId}
              className="field text-dense min-h-8 px-2"
              value={column.type?.kind ?? ''}
              onChange={(event) =>
                onChange({
                  action: 'profileColumn',
                  column: column.column,
                  type: event.target.value as Choosable,
                })
              }
            >
              {column.type &&
              CHOOSABLE.includes(column.type.kind as Choosable) ? null : (
                <option value={column.type?.kind ?? ''} disabled>
                  {typeWords}
                </option>
              )}
              {CHOOSABLE.map((kind) => (
                <option key={kind} value={kind}>
                  {TYPE_WORDS[kind]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {column.blanksSeen ? (
        <div className="grid gap-1">
          <span className="text-meta text-muted">
            Where a cell is blank
            {column.blank === null ? ', which needs an answer' : ''}
          </span>
          <ChoiceGroup
            label={`Where ${column.label} is blank`}
            options={BLANK_CHOICES}
            value={column.blank}
            onChange={(blank) =>
              onChange({
                action: 'profileColumn',
                column: column.column,
                blank,
              })
            }
          />
        </div>
      ) : null}
    </li>
  );
}
