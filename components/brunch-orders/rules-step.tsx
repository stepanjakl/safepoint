'use client';

import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { DecisionButton } from '@/components/brunch-orders/decision-button';
import { PendingDots } from '@/components/brunch-orders/pending-dots';
import {
  Lede,
  StatusChip,
  plural,
  useTrial,
  type Tone,
} from '@/components/sheet-process/trial-parts';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { MorphingText } from '@/components/ui/morphing-text';
import { cx } from '@/lib/cx';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';
import { DRAFTING_MODELS, type DraftingModel } from '@/lib/rulebook/models';
import {
  Assignment,
  DEFINED_NAME,
  Examples,
  FromModel,
  TRIED_VARIABLE,
  said,
} from '@/components/brunch-orders/rules-parts';
import {
  acceptable,
  type Definition,
  type DefinitionSet,
  type DraftProgress,
} from '@/lib/definitions/types';

// Every reply says whether a draft is running on the server, and how far.
type RulesResponse = { drafting?: DraftProgress | null } & (
  | {
      kind: 'rules';
      set: DefinitionSet;
      names: Record<string, string>;
      // The app's own working of each example, by definition.
      working: Record<string, string[][]>;
    }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
);

// How far the rules have got, for the step's mark.
export type RulesProgress = {
  approved: number;
  total: number;
  intent: boolean;
};

const progressOf = (set: DefinitionSet): RulesProgress => ({
  approved: set.definitions.filter((d) => d.approvedAt).length,
  total: set.definitions.length,
  intent: set.intentConfirmedAt !== null,
});

// How often to ask how far a draft on the server has got.
const DRAFT_POLL_MS = 2_000;

function statusOf(item: Definition): { tone: Tone; label: string } {
  if (item.deniedAt) return { tone: 'blocked', label: 'Denied' };
  if (!item.formula) return { tone: 'neutral', label: 'Not written' };
  if (!acceptable(item)) return { tone: 'blocked', label: 'Examples disagree' };
  return { tone: 'decision', label: 'Waiting for you' };
}

// A status's tone as its severity rank, for the dots that follow it.
const SEVERITY: Record<Tone, number> = {
  blocked: 0,
  decision: 1,
  neutral: 2,
  ready: 3,
};

// What failing a check does to a proposal, as the model read it.
const CONSEQUENCE: Record<'block' | 'decide', { tone: Tone; label: string }> = {
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

// What waits on a person is drawn as the release card is (`CARD` in
// release-card.tsx): a floating face that stands off the step around it.
const ASKS = 'control-face surface-floating rounded-shell';

function AcceptDecision({
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
      <MorphingText text={accepted ? 'Accepted' : 'Accept'} duration={360} />
    </DecisionButton>
  );
}

/*
  The rules of the instructions this run answers to, and the values they need:
  found by the model, then each given a formula and examples on real records.
  The person confirms the intent and accepts or denies each item as its
  examples show it; every run under the same instructions uses what is
  accepted.
*/
export function RulesStep({
  text,
  version,
  readId,
  onProgress,
}: {
  text: string;
  version: string;
  readId: string | null;
  onProgress: (progress: RulesProgress) => void;
}) {
  const rules = useTrial<RulesResponse>('/api/dev/brunch-orders/rules');
  const sheet = useContext(ProcessSheetActions);
  const { run } = rules;
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });
  // What is already found and accepted for these instructions, on arrival:
  // a new run under them starts as far as they have got.
  useEffect(() => {
    void run({ action: 'get', text }).then((response) => {
      if (response?.kind === 'rules') report.current(progressOf(response.set));
    });
  }, [run, text]);
  const body = rules.state.kind === 'done' ? rules.state.body : null;
  // The last rules seen stay while an action runs, so the list, and focus in
  // it, are kept.
  const [last, setLast] = useState<{
    set: DefinitionSet;
    names: Record<string, string>;
    working: Record<string, string[][]>;
  } | null>(null);
  const current = body?.kind === 'rules' ? body : null;
  if (current && current.set !== last?.set)
    setLast({
      set: current.set,
      names: current.names,
      working: current.working ?? {},
    });
  const shown = current ?? last;
  const set = shown?.set ?? null;
  const names = shown?.names ?? {};
  const working = shown?.working ?? {};
  // A draft runs on the server; the last progress reported stays while the
  // next question is out.
  const [drafting, setDrafting] = useState<DraftProgress | null>(null);
  const reported = body?.drafting ?? null;
  if (body && JSON.stringify(reported) !== JSON.stringify(drafting))
    setDrafting(reported);
  const draftRunning = drafting?.running ?? false;
  const busy = rules.state.kind === 'running' || draftRunning;
  const [writing, setWriting] = useState(false);
  const act = (request: Record<string, unknown>) => {
    setWriting(request.action === 'write' || request.action === 'draft');
    void run({ ...request, text })
      .then((response) => {
        if (response?.kind === 'rules') onProgress(progressOf(response.set));
      })
      .finally(() => setWriting(false));
  };
  // While it runs, ask again a moment after each answer.
  const answered = rules.state.kind === 'done';
  useEffect(() => {
    if (!draftRunning || !answered) return;
    const timer = setTimeout(
      () =>
        void run({ action: 'get', text }).then((response) => {
          if (response?.kind === 'rules')
            report.current(progressOf(response.set));
        }),
      DRAFT_POLL_MS,
    );
    return () => clearTimeout(timer);
  }, [draftRunning, answered, body, run, text]);
  const progress = set ? progressOf(set) : null;

  return (
    <div className="rules-review grid gap-4">
      <Lede>
        The model turns your instructions into calculations and checks, and
        tries each on records from the data. Accept the ones it got right; every
        run under these instructions will use them.
      </Lede>

      {/* Scaffolding for trying the step, as the read's setup is. */}
      <section
        aria-label="Draft setup"
        className="brunch-trial rounded-shell grid gap-3 p-4"
      >
        <DraftControl
          kept={set?.definitions.length ?? 0}
          accepted={progress?.approved ?? 0}
          canDraft={readId !== null}
          busy={busy}
          onDraft={(model) => act({ action: 'draft', version, readId, model })}
        />
        {!readId ? (
          <p className="text-dense text-muted">
            Read the data first: the examples are worked out on it.
          </p>
        ) : null}
        {/* Always in the page, so its changes are read out; taking no room
            while it has nothing to say. */}
        <p
          role="status"
          className={
            writing ||
            drafting?.running ||
            body?.kind === 'error' ||
            drafting?.error
              ? 'text-meta text-muted'
              : 'sr-only'
          }
        >
          {drafting?.running
            ? drafting.step
            : writing
              ? 'Working… writing one can take a minute.'
              : body?.kind === 'error'
                ? body.message
                : (drafting?.error ?? '')}
        </p>
      </section>

      {!set ? (
        rules.state.kind === 'done' ? (
          <p className="text-dense text-muted">
            Nothing drafted for these instructions yet.
          </p>
        ) : null
      ) : (
        <>
          <div className={cx(ASKS, 'grid gap-3 p-4')}>
            <FromModel label="The intent, as the model reads it">
              <p className="text-body">{set.intent}</p>
            </FromModel>
            <div className="flex flex-wrap items-center gap-2">
              <AcceptDecision
                accepted={set.intentConfirmedAt !== null}
                busy={busy}
                onAccept={() => act({ action: 'intent' })}
              />
              {!set.intentConfirmedAt && sheet ? (
                <DecisionButton
                  decision="deny"
                  onPress={sheet.showInstructions}
                >
                  Deny: edit the instructions
                </DecisionButton>
              ) : null}
            </div>
          </div>

          <div className="rules-list grid gap-4">
            <PendingDots
              pending={set.definitions
                // TEMPORARY, for reviewing the dots: every definition gets one.
                .filter((d) => PREVIEW_ALL_DOTS || !d.approvedAt)
                .map((d) => ({
                  id: d.id,
                  name: d.name,
                  status: statusOf(d).label,
                  severity: SEVERITY[statusOf(d).tone],
                }))}
              anchorOf={anchorOf}
            />
            <ol className="grid gap-3" aria-label="Calculations and checks">
              {set.definitions.map((item) => (
                <DefinitionCard
                  key={item.id}
                  item={item}
                  quoted={words(text).includes(words(item.text))}
                  names={names}
                  working={working[item.id] ?? []}
                  reads={set.definitions.filter((d) =>
                    item.uses.includes(d.id),
                  )}
                  busy={busy}
                  canWrite={readId !== null}
                  onWrite={() => act({ action: 'write', readId, id: item.id })}
                  onDecide={(decision, note) =>
                    act({ action: 'decide', id: item.id, decision, note })
                  }
                />
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

/*
  A new rulebook for these instructions, from the data as this run read it:
  the rules found again, then each written, by the chosen model. Replacing a
  kept one asks first, as its acceptances go with it.
*/
// Which model to ask; a busy or spent one hands over to the next older one
// of its family on the server.
export function ModelSelect({
  model,
  busy,
  onChange,
}: {
  model: DraftingModel;
  busy: boolean;
  onChange: (model: DraftingModel) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-meta text-muted">Model</span>
      <select
        className="field text-dense min-h-9 px-2"
        value={model}
        disabled={busy}
        onChange={(e) => onChange(e.target.value as DraftingModel)}
      >
        {DRAFTING_MODELS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}

function DraftControl({
  kept,
  accepted,
  canDraft,
  busy,
  onDraft,
}: {
  kept: number;
  accepted: number;
  canDraft: boolean;
  busy: boolean;
  onDraft: (model: DraftingModel) => void;
}) {
  const [model, setModel] = useState<DraftingModel>(DRAFTING_MODELS[0]!);
  const [confirming, setConfirming] = useState(false);
  const draftButton = useRef<HTMLButtonElement>(null);
  const cancel = () => {
    setConfirming(false);
    requestAnimationFrame(() => draftButton.current?.focus());
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <ModelSelect model={model} busy={busy} onChange={setModel} />
        {confirming ? (
          <>
            <Button
              variant="primary"
              autoFocus
              onPress={() => {
                setConfirming(false);
                onDraft(model);
              }}
            >
              Replace the rulebook
            </Button>
            <Button onPress={cancel}>Cancel</Button>
          </>
        ) : (
          <Button
            ref={draftButton}
            variant={kept ? 'secondary' : 'primary'}
            isDisabled={busy || !canDraft}
            onPress={() => (kept ? setConfirming(true) : onDraft(model))}
          >
            {kept ? 'Draft a new rulebook' : 'Draft the rulebook'}
          </Button>
        )}
      </div>
      <p className="text-meta text-muted max-w-prose">
        {confirming
          ? `This replaces the ${plural(kept, 'definition')} kept for these instructions${accepted ? `, and the ${accepted} you accepted,` : ''} with a new draft worked out on the data as this run read it.`
          : 'Finds the calculations and checks in the instructions, then writes each one on the data as this run read it. If the model is busy or out of quota, the next older one of its family answers.'}
      </p>
    </div>
  );
}

// Where a formula breaks: before each condition joined at its top level by
// || or &&, and, where a condition is a bracketed group of such conditions,
// inside the group one level deeper.
type FormulaLineText = { text: string; level: number };

function splitTop(formula: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < formula.length; i++) {
    const c = formula[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (
      depth === 0 &&
      i > start &&
      (formula.startsWith('||', i) || formula.startsWith('&&', i))
    ) {
      parts.push(formula.slice(start, i).trim());
      start = i;
      i++;
    }
  }
  parts.push(formula.slice(start).trim());
  return parts;
}

// The bracket that closes the one opening at `at`, or -1.
function closing(text: string, at: number): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function linesOf(formula: string, level = 0): FormulaLineText[] {
  return splitTop(formula).flatMap((part) => {
    const lead = /^(\|\||&&)\s*/.exec(part)?.[0] ?? '';
    const rest = part.slice(lead.length);
    const inner =
      rest.startsWith('(') && closing(rest, 0) === rest.length - 1
        ? rest.slice(1, -1)
        : null;
    const nested = inner === null ? [] : splitTop(inner);
    if (nested.length < 2) return [{ text: part, level }];
    const lines = linesOf(inner!, level + 1);
    lines[0] = { text: `${lead}(${lines[0]!.text}`, level };
    lines[lines.length - 1]!.text += ')';
    return lines;
  });
}

// What the definition brings to its formula: blue, dotted, with what it is on
// hover.
const DOTTED =
  'text-state-advisory decoration-state-advisory underline decoration-dotted underline-offset-2';

const READ_ROOTS = [
  'record',
  ...SUBJECT.data.lookups.map((lookup) => lookup.as),
];
// The proposal's fields: what each example sets, by the name a formula reads.
// Drawn the same in the formula and in each example's heading.
const PROPOSAL = new Set(SUBJECT.proposal.map((field) => field.id));
const TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)|\b([A-Za-z_]\w*)\b/g;

// One line of a formula, each name drawn by what it reads.
// A line one level in sits under the condition it opens; a line too long
// for the box wraps under its own start, past its operator.
const LEVEL = ['', 'ml-6', 'ml-12', 'ml-18'];

function FormulaLine({
  line,
  level,
  item,
  names,
  reads,
}: {
  line: string;
  level: number;
  item: Definition;
  names: Record<string, string>;
  reads: Definition[];
}) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of line.matchAll(TOKEN)) {
    const [whole, text, root, field, bare] = match;
    const index = match.index;
    if (index > at) parts.push(line.slice(at, index));
    at = index + whole.length;
    const key = `${index}`;
    if (text)
      parts.push(
        <span key={key} className="text-muted">
          {text}
        </span>,
      );
    else if (root === 'values') {
      const read = reads.find((d) => d.id === field);
      const about = read
        ? `A calculation this formula reads: ${read.name}. On its examples, ${read.examples
            .map((e) => `${e.key} gives ${said(read, e.expect)}`)
            .join(', ')}.`
        : null;
      const link = (
        <a key={key} href={`#${anchorOf(field!)}`} className={DOTTED}>
          {whole}
        </a>
      );
      parts.push(
        about ? (
          <Tooltip key={key} label={whole} description={about}>
            {link}
          </Tooltip>
        ) : (
          link
        ),
      );
    } else if (root === 'constants' || root === 'groups') {
      const constant = item.constants.find((c) => c.id === field);
      const group = item.groups.find((g) => g.id === field);
      const about = constant
        ? `A number from the instructions: ${constant.value}, from “${constant.quote}”.`
        : group
          ? `Records the instructions name: ${group.keys.map((k) => (names[k] ? `${k} [${names[k]}]` : k)).join(', ')}, from “${group.quote}”.`
          : null;
      parts.push(
        about ? (
          <Tooltip key={key} label={whole} description={about}>
            <span tabIndex={0} className={cx(DOTTED, 'cursor-help')}>
              {whole}
            </span>
          </Tooltip>
        ) : (
          whole
        ),
      );
    } else if (root && READ_ROOTS.includes(root))
      parts.push(
        <span key={key}>
          <span className="text-muted">{root}.</span>
          <span className="text-primary font-medium">{field}</span>
        </span>,
      );
    else if (bare && PROPOSAL.has(bare)) {
      parts.push(
        <Tooltip
          key={key}
          label={bare}
          description="The value being proposed. Each example sets it, to show where the check holds and where it fails."
        >
          <span tabIndex={0} className={cx(TRIED_VARIABLE, 'cursor-help')}>
            {bare}
          </span>
        </Tooltip>,
      );
    } else if (bare === 'key')
      parts.push(
        <span key={key} className="text-primary font-medium">
          {bare}
        </span>,
      );
    else parts.push(whole);
  }
  if (at < line.length) parts.push(line.slice(at));
  return (
    <div className={cx('pl-6 -indent-6 break-words', LEVEL[level] ?? LEVEL[3])}>
      {parts}
    </div>
  );
}

/*
  The formula as the app runs it: one condition to a line, the data it reads
  in the primary ink, the proposal in its own tone, and what the definition
  brings to it -- the calculations it reads, its constants and groups -- with
  what each is on hover; a calculation also links to its card.
*/
function Formula({
  item,
  formula,
  names,
  reads,
}: {
  item: Definition;
  formula: string;
  names: Record<string, string>;
  reads: Definition[];
}) {
  return (
    <div
      role="group"
      aria-label={`Formula of ${item.name}`}
      className="value text-meta bg-surface-floating rounded-control grid gap-0.5 px-3 py-2"
    >
      {linesOf(formula).map((line, index) => (
        <FormulaLine
          key={index}
          line={line.text}
          level={line.level}
          item={item}
          names={names}
          reads={reads}
        />
      ))}
    </div>
  );
}

// TEMPORARY: shows a dot for accepted definitions too, while the dots are
// reviewed. Remove with its use in RulesStep.
const PREVIEW_ALL_DOTS = true;

// Where a card is, for a link from a card that reads it.
const anchorOf = (id: string) => `definition-${id}`;

// What a definition is and what failing it does, as pills.
function DefinitionPills({ item }: { item: Definition }) {
  const kind = kindOf(item);
  return (
    <>
      <Tooltip label={kind.label} description={kind.about}>
        <span
          tabIndex={0}
          data-severity={2}
          className="bg-severity-pill text-severity-ink text-meta focus-visible:bg-severity-pill-hover hover:bg-severity-pill-hover inline-flex cursor-default items-center rounded-full px-2 py-0.5 font-medium whitespace-nowrap"
        >
          {kind.label}
        </span>
      </Tooltip>
      {item.result === 'check' && item.consequence ? (
        <span
          data-severity={
            CONSEQUENCE[item.consequence].tone === 'blocked' ? 0 : 1
          }
          className="ring-severity-pill-hover text-severity-ink text-meta inline-flex items-center rounded-full px-2 py-0.5 whitespace-nowrap ring-1 ring-inset"
        >
          {CONSEQUENCE[item.consequence].label}
          <span className="sr-only">, as the model reads it</span>
        </span>
      ) : null}
    </>
  );
}

// The definition itself, read two ways: in words as the model reads it, and
// exactly, as the app runs it.
function DefinitionReading({
  item,
  quoted,
  names,
  reads,
  headingId,
}: {
  item: Definition;
  quoted: boolean;
  names: Record<string, string>;
  reads: Definition[];
  headingId: string;
}) {
  const title = item.name;
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
        </FromModel>
        {item.formula ? (
          <FromModel label="The model's formula">
            <Formula
              item={item}
              formula={item.formula}
              names={names}
              reads={reads}
            />
          </FromModel>
        ) : null}
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

/*
  An accepted definition as the rulebook keeps it, read-only: what it is, what
  failing it does, and its reading and formula, with when it was accepted.
  Its examples and decisions stay in the run that accepted it.
*/
export function RulebookCard({
  item,
  quoted,
  names,
  reads,
}: {
  item: Definition;
  quoted: boolean;
  names: Record<string, string>;
  reads: Definition[];
}) {
  const headingId = useId();
  return (
    <li
      id={anchorOf(item.id)}
      className={cx(ASKS, 'grid scroll-mt-4')}
      aria-labelledby={headingId}
    >
      <div className="floating-rule-below grid gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <DefinitionPills item={item} />
          {item.approvedAt ? (
            <span className="text-meta text-muted ml-auto">
              Accepted {ACCEPTED_AT.format(new Date(item.approvedAt))}
            </span>
          ) : null}
        </div>
        <h4 id={headingId} className="text-dense font-semibold">
          {item.name}
        </h4>
      </div>
      <div className="grid gap-3 p-4">
        <DefinitionReading
          item={item}
          quoted={quoted}
          names={names}
          reads={reads}
          headingId={headingId}
        />
      </div>
    </li>
  );
}

const ACCEPTED_AT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function DefinitionCard({
  item,
  quoted,
  names,
  working,
  reads,
  busy,
  canWrite,
  onWrite,
  onDecide,
}: {
  item: Definition;
  // The item is the instructions' own words, not the model's restatement.
  quoted: boolean;
  names: Record<string, string>;
  // The app's own working of each example, in the examples' order.
  working: string[][];
  // The definitions its formula reads.
  reads: Definition[];
  busy: boolean;
  canWrite: boolean;
  onWrite: () => void;
  onDecide: (decision: 'accept' | 'deny', note?: string) => void;
}) {
  const status = statusOf(item);
  const title = item.name;
  const kind = kindOf(item);
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
  return (
    <li
      id={anchorOf(item.id)}
      className={cx(ASKS, 'grid scroll-mt-4')}
      aria-labelledby={headingId}
    >
      <div className="floating-rule-below grid gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <DefinitionPills item={item} />
          <span
            className="rules-status-out ml-auto"
            data-accepted={item.approvedAt ? '' : undefined}
            aria-hidden={item.approvedAt ? true : undefined}
          >
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
          </span>
        </div>
        <h4 id={headingId} className="text-dense font-semibold">
          {title}
        </h4>
      </div>

      <div className="grid gap-3 p-4">
        <DefinitionReading
          item={item}
          quoted={quoted}
          names={names}
          reads={reads}
          headingId={headingId}
        />

        {item.examples.length ? (
          <section
            aria-labelledby={`${headingId}-examples`}
            className="grid gap-3"
          >
            <h5 id={`${headingId}-examples`} className="readout text-muted">
              Examples
            </h5>
            <Examples item={item} names={names} working={working} />
          </section>
        ) : null}

        {item.deniedAt ? (
          <p className="text-dense">
            You denied this
            {item.denial ? <>: &ldquo;{item.denial}&rdquo;</> : null}. Write it
            again to send that to the model.
          </p>
        ) : null}
        {item.problem ? <p className="text-dense">{item.problem}</p> : null}
      </div>

      <div className="floating-rule-above p-4">
        {denying ? (
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
            <Button pill onPress={close}>
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
                  canAccept={acceptable(item)}
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
              <Button pill isDisabled={busy || !canWrite} onPress={onWrite}>
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
    </li>
  );
}
