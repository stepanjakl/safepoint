'use client';

import {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { DecisionButton } from '@/components/engine/decision-button';
import { CardAnchor } from '@/components/engine/rules/card-anchor';
import { Formula } from '@/components/engine/rules/formula';
import { VersionsToChoose } from '@/components/engine/rules/versions-to-choose';
import {
  Assignment,
  DEFINED_NAME,
  Examples,
  FromModel,
} from '@/components/engine/rules-parts';
import { StatusChip, type Tone } from '@/components/engine/trial-parts';
import { Button } from '@/components/ui/button';
import { MORPH_WORDS_MS, MorphingText } from '@/components/ui/morphing-text';
import { Pill } from '@/components/ui/pill';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';
import type { Advice } from '@/lib/engine/advise';
import type { DefinitionSubject } from '@/lib/engine/subject';
import {
  acceptable,
  BLANKS_UNANSWERED,
  canAccept as canAcceptItem,
  ignoresProposal,
  SCOPE_MISMATCH,
  worksOutItself,
  type AppliesTo,
  type Definition,
} from '@/lib/engine/types';

export function statusOf(item: Definition): { tone: Tone; label: string } {
  if (item.deniedAt) return { tone: 'blocked', label: 'Denied' };
  if (!item.formula) return { tone: 'neutral', label: 'Not written' };
  if (!acceptable(item)) return { tone: 'blocked', label: 'Examples disagree' };
  if (!canAcceptItem(item))
    return { tone: 'decision', label: 'Versions differ' };
  return { tone: 'decision', label: 'Waiting for you' };
}

// A status's tone as its severity rank, for the dots that follow it.

// What failing a check does to a proposal, as the model read it.
export const CONSEQUENCE: Record<
  'block' | 'decide',
  { tone: Tone; label: string }
> = {
  block: { tone: 'blocked', label: 'Blocks the proposal' },
  decide: { tone: 'decision', label: 'A person decides' },
};

// The two kinds of definition, said the same for any process: a calculation
// gives a number, a check holds or fails on a proposal.
const KINDS = [
  {
    result: 'number',
    label: 'Calculation',
    about:
      'A number the app works out for every record from the data, as the instructions describe. Checks and later calculations read it.',
  },
  {
    result: 'check',
    label: 'Check',
    about:
      'A condition the app tests every proposal against, record by record. It holds or fails; what failing means is in the pill beside it.',
  },
] as const;
const kindOf = (item: Definition) =>
  KINDS.find((k) => k.result === item.result)!;

export const words = (value: string) => value.replace(/\s+/g, ' ').trim();

// What waits on a person is drawn as a card: a floating face that stands off
// the step around it.
export const ASKS = 'control-face surface-floating rounded-shell';

export function AcceptDecision({
  accepted,
  busy,
  canAccept = true,
  onAccept,
}: {
  accepted: boolean;
  busy: boolean;
  canAccept?: boolean;
  onAccept: () => void;
}) {
  return (
    <DecisionButton
      decision="accept"
      data-action="accept"
      data-phase={accepted ? 'done' : 'idle'}
      className="decision-morph-control"
      aria-disabled={accepted || busy}
      isDisabled={!accepted && !canAccept}
      onPress={() => {
        if (!accepted && !busy) onAccept();
      }}
    >
      <MorphingText
        text={accepted ? 'Accepted' : 'Accept'}
        duration={MORPH_WORDS_MS}
      />
    </DecisionButton>
  );
}

// What the app shows of a check written as a shape: the sentence code wrote
// from it, and from each version where writes disagreed.
export type Sentences = { own: string | null; versions: (string | null)[] };

// How finding read a check, in the process's words for its records: said of
// the reading, and of the other one a person may say instead.
const appliesToWords = ({
  record,
}: DefinitionSubject): Record<
  AppliesTo,
  { for: string; read: string; other: AppliesTo; correction: string }
> => ({
  every: {
    for: `every ${record.singular}`,
    read: `for every ${record.singular}`,
    other: 'some',
    correction: `This rule is for every ${record.singular}`,
  },
  some: {
    for: `some ${record.plural}`,
    read: `for only some ${record.plural}`,
    other: 'every',
    correction: `This rule is for only some ${record.plural}`,
  },
});

// What a definition is and what failing it does, as pills.
function DefinitionPills({ item }: { item: Definition }) {
  const kind = kindOf(item);
  return (
    <>
      <Tooltip label={kind.label} description={kind.about}>
        <Pill tone="neutral" interactive tabIndex={0}>
          {kind.label}
        </Pill>
      </Tooltip>
      {item.result === 'check' && item.consequence ? (
        <Pill tone={CONSEQUENCE[item.consequence].tone} variant="ringed">
          {CONSEQUENCE[item.consequence].label}
          <span className="sr-only">, as the model reads it</span>
        </Pill>
      ) : null}
    </>
  );
}

// The definition itself, read two ways: in words as the model reads it, and
// exactly, as the app runs it.
function DefinitionReading({
  subject,
  item,
  quoted,
  names,
  reads,
  headingId,
  sentence = null,
  awaitedFormula,
}: {
  subject: DefinitionSubject;
  item: Definition;
  quoted: boolean;
  names: Record<string, string>;
  reads: Definition[];
  headingId: string;
  // A check written as a shape: what it checks, written by the app.
  sentence?: string | null;
  // Drawn where the formula goes until there is one.
  awaitedFormula?: ReactNode;
}) {
  const appliesTo = useMemo(() => appliesToWords(subject), [subject]);
  const title = item.name;
  const formula = item.formula ? (
    <FromModel label="The model's formula">
      <Formula
        subject={subject}
        item={item}
        formula={item.formula}
        names={names}
        reads={reads}
      />
    </FromModel>
  ) : null;
  return (
    <section aria-labelledby={`${headingId}-rule`} className="grid gap-1.5">
      <h5 id={`${headingId}-rule`} className="readout text-muted">
        Definition
      </h5>
      <div className="bg-surface-primary rounded-shell grid gap-3 py-3 pr-3 pl-4">
        <FromModel label="The model's reading">
          <p className="text-body italic">
            {quoted ? <>&ldquo;{item.text}&rdquo;</> : item.text}
          </p>
          {item.appliesTo ? (
            <p className="text-meta text-muted">
              <MorphingText
                text={`For ${appliesTo[item.appliesTo].for}`}
                duration={MORPH_WORDS_MS}
              />
            </p>
          ) : null}
        </FromModel>
        {sentence ? (
          <div className="grid gap-1">
            <span className="readout text-muted">What the app checks</span>
            <p className="text-body">{sentence}</p>
          </div>
        ) : null}
        {formula ?? awaitedFormula}
        {item.constants.length || item.groups.length ? (
          <FromModel label="The model's numbers and groups">
            <ul
              className="text-dense grid gap-2"
              aria-label={`Numbers and groups ${title} reads`}
            >
              {item.constants.map((c) => (
                <li key={c.id}>
                  <Assignment name={c.id} face={DEFINED_NAME}>
                    {c.value}
                  </Assignment>
                </li>
              ))}
              {item.groups.map((g) => (
                <li key={g.id} className="grid gap-1">
                  <Assignment name={g.id} face={DEFINED_NAME}>
                    {g.keys.join(', ')}
                  </Assignment>
                  {g.keys.some((key) => names[key]) ? (
                    <span className="text-meta text-muted">
                      {g.keys.map((key) => names[key] ?? key).join(' · ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </FromModel>
        ) : null}
      </div>
    </section>
  );
}

export function DefinitionCard({
  subject,
  item,
  quoted,
  names,
  working,
  sentences,
  reads,
  busy,
  canWrite,
  onWrite,
  onDecide,
  debug,
  onChoose,
  onAdvise,
  onShowProfile,
  onSetAppliesTo,
  chip,
  activity,
  awaitedFormula,
  awaitedExamples,
}: {
  // What the process's records and proposal are called and read as.
  subject: DefinitionSubject;
  item: Definition;
  // The item is the instructions' own words, not the model's restatement.
  quoted: boolean;
  names: Record<string, string>;
  // The app's own working of each example, in the examples' order.
  working: string[][];
  // The check's sentence, and each version's, where it is written as a shape.
  sentences?: Sentences;
  // The definitions its formula reads.
  reads: Definition[];
  busy: boolean;
  canWrite: boolean;
  onWrite: () => void;
  onDecide: (decision: 'accept' | 'deny', note?: string) => void;
  // A button for what code finds of this rule.
  debug?: ReactNode;
  // Takes one of the versions, where writes disagreed.
  onChoose?: (index: number) => void;
  // Asks which version the instructions support, for the assistant to show.
  onAdvise?: () => Promise<Advice>;
  // Leads to the data profile, where an unanswered blank is answered.
  onShowProfile?: () => void;
  // Says how the rule is really meant, where finding read it the other way.
  onSetAppliesTo?: (value: AppliesTo) => void;
  // The rest are only passed by /workbench/draft-progress, which compares what
  // a card could show while a draft runs: its pill, in place of its status...
  chip?: ReactNode;
  // ...a line under its title, and what stands in for what is still to come.
  activity?: ReactNode;
  awaitedFormula?: ReactNode;
  awaitedExamples?: ReactNode;
}) {
  const status = statusOf(item);
  const title = item.name;
  const kind = kindOf(item);
  const appliesTo = useMemo(() => appliesToWords(subject), [subject]);
  const anchor = useContext(CardAnchor);
  const headingId = useId();
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();
  // Focus follows the swap: into the note when it opens, back to Deny when it
  // closes, so it is never left on a control that has gone.
  const denyButton = useRef<HTMLButtonElement>(null);
  const close = () => {
    setDenying(false);
    // Deny is drawn again on the next render; focus it once it is there.
    requestAnimationFrame(() => denyButton.current?.focus());
  };
  const open = !item.approvedAt;
  // The shape written disagrees with how finding read the rule: a person can
  // say which is right. The control goes once the reading is changed, so focus
  // is handed to Write again, the next step.
  const mismatch = Boolean(
    item.appliesTo && item.formula && item.problem?.includes(SCOPE_MISMATCH),
  );
  const writeButton = useRef<HTMLButtonElement>(null);
  const corrected = useRef(false);
  useEffect(() => {
    if (mismatch || !corrected.current) return;
    corrected.current = false;
    writeButton.current?.focus();
  }, [mismatch]);
  return (
    <li
      id={anchor(item.id)}
      className={cx(ASKS, 'grid scroll-mt-4')}
      aria-labelledby={headingId}
    >
      <div className="rule-below grid gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <DefinitionPills item={item} />
          <span
            className="rules-status-out ml-auto"
            data-accepted={item.approvedAt ? '' : undefined}
            aria-hidden={item.approvedAt ? true : undefined}
          >
            {chip ?? <StatusChip tone={status.tone}>{status.label}</StatusChip>}
          </span>
        </div>
        <h4 id={headingId} className="text-dense font-semibold">
          {title}
        </h4>
        {activity}
      </div>

      <div className="grid gap-3 p-4">
        <DefinitionReading
          subject={subject}
          item={item}
          quoted={quoted}
          names={names}
          reads={reads}
          headingId={headingId}
          sentence={sentences?.own ?? null}
          awaitedFormula={awaitedFormula}
        />

        {item.examples.length ? (
          <section
            aria-labelledby={`${headingId}-examples`}
            className="grid gap-3"
          >
            <h5 id={`${headingId}-examples`} className="readout text-muted">
              Examples
            </h5>
            <Examples
              subject={subject}
              item={item}
              names={names}
              working={working}
            />
          </section>
        ) : (
          awaitedExamples
        )}

        {item.deniedAt ? (
          <p className="text-dense">
            You denied this
            {item.denial ? <>: &ldquo;{item.denial}&rdquo;</> : null}. Write it
            again to send that to the model.
          </p>
        ) : null}
        {item.problem ? <p className="text-dense">{item.problem}</p> : null}
        {mismatch && item.appliesTo && onSetAppliesTo ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-meta text-muted">
              Finding read this rule as {appliesTo[item.appliesTo].read}.
            </span>
            <Button
              size="medium"
              isDisabled={busy}
              onPress={() => {
                corrected.current = true;
                onSetAppliesTo(appliesTo[item.appliesTo!].other);
              }}
            >
              {appliesTo[appliesTo[item.appliesTo].other].correction}
            </Button>
          </div>
        ) : null}
        {item.problem?.startsWith(BLANKS_UNANSWERED) && onShowProfile ? (
          <div>
            <Button size="medium" onPress={onShowProfile}>
              Answer it in the data’s columns
            </Button>
          </div>
        ) : null}
        {item.unfit ? (
          <FromModel label="Why the model found no shape">
            <p className="text-dense italic">{item.unfit}</p>
          </FromModel>
        ) : null}
        {ignoresProposal(
          item,
          reads,
          subject.proposal.map((field) => field.id),
        ) ? (
          <p className="text-dense text-state-advisory">
            No proposed{' '}
            {subject.proposal.map((field) => field.label).join(' or ')} can
            change this check&rsquo;s answer. Right for a rule about the data;
            wrong for a rule about what is proposed.
          </p>
        ) : null}
        {worksOutItself(item) ? (
          <p className="text-dense text-state-advisory">
            This check works a quantity out itself. As a calculation of its own,
            Calculate would show it and the cross-check would test it.
          </p>
        ) : null}
      </div>

      <div className="rule-above flex items-end gap-3 p-4">
        <div className="min-w-0 flex-1">
          {open && item.agreement?.status === 'split' ? (
            <VersionsToChoose
              subject={subject}
              item={item}
              names={names}
              sentences={sentences?.versions ?? []}
              busy={busy}
              canWrite={canWrite}
              onChoose={onChoose}
              onWrite={onWrite}
              onAdvise={onAdvise}
            />
          ) : denying ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onDecide('deny', note);
                close();
                setNote('');
              }}
            >
              <label htmlFor={noteId} className="sr-only">
                What is wrong with {title}
              </label>
              <input
                id={noteId}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                ref={(element) => element?.focus()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') close();
                }}
                placeholder="What's wrong? (optional)"
                className="field text-dense min-h-8 min-w-64 flex-1 px-3"
              />
              <DecisionButton decision="deny" type="submit" isDisabled={busy}>
                Deny
              </DecisionButton>
              <Button size="medium" onPress={close}>
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {item.formula ? (
                <>
                  <AcceptDecision
                    accepted={item.approvedAt !== null}
                    busy={busy}
                    canAccept={canAcceptItem(item)}
                    onAccept={() => onDecide('accept')}
                  />
                  {open ? (
                    <DecisionButton
                      decision="deny"
                      ref={denyButton}
                      isDisabled={busy}
                      onPress={() => setDenying(true)}
                    >
                      Deny
                    </DecisionButton>
                  ) : null}
                </>
              ) : null}
              {open ? (
                <Button
                  ref={writeButton}
                  size="medium"
                  isDisabled={busy || !canWrite}
                  onPress={onWrite}
                >
                  {item.formula
                    ? 'Write again'
                    : `Write the ${kind.label.toLowerCase()}`}
                </Button>
              ) : null}
              {item.formula && open && !acceptable(item) ? (
                <span className="text-meta text-muted">
                  Accept waits until the app’s check agrees with every example.
                </span>
              ) : null}
            </div>
          )}
        </div>
        {debug}
      </div>
    </li>
  );
}
