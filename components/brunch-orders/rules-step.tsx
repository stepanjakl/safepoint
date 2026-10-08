'use client';

import Check from 'blode-icons-react/icons/checkmark-1-small';
import Cross from 'blode-icons-react/icons/cross-small';
import SparkleFilled from 'blode-icons-react/icons/sparkle-filled';
import { Button as AriaButton } from 'react-aria-components';
import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import {
  Code,
  Lede,
  Outcome,
  StatusChip,
  TechnicalDetails,
  TrialControl,
  plural,
  useTrial,
  type Tone,
} from '@/components/sheet-process/trial-parts';
import { Button } from '@/components/ui/button';
import { cx } from '@/lib/cx';
import type { Item, RuleSet } from '@/lib/processes/brunch-orders/rules';

type RulesResponse =
  | { kind: 'rules'; set: RuleSet; names: Record<string, string> }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

// How far the rules have got, for the step's mark.
export type RulesProgress = {
  approved: number;
  total: number;
  intent: boolean;
};

const progressOf = (set: RuleSet): RulesProgress => ({
  approved: set.items.filter((i) => i.approvedAt).length,
  total: set.items.length,
  intent: set.intentConfirmedAt !== null,
});

// Acceptable once every example agrees with the formula (the server holds
// to the same).
const acceptable = (item: Item) =>
  item.formula !== null &&
  item.examples.length > 0 &&
  item.examples.every((e) => e.agrees);

function statusOf(item: Item): { tone: Tone; label: string } {
  if (item.approvedAt) return { tone: 'ready', label: 'Accepted' };
  if (item.deniedAt) return { tone: 'blocked', label: 'Denied' };
  if (!item.formula) return { tone: 'neutral', label: 'Not written' };
  if (!acceptable(item)) return { tone: 'blocked', label: 'Examples disagree' };
  return { tone: 'decision', label: 'Waiting for you' };
}

// What happens to an order that breaks a rule, as the model read it.
const OUTCOME: Record<'block' | 'decide', { tone: Tone; label: string }> = {
  block: { tone: 'blocked', label: 'the order is blocked' },
  decide: { tone: 'decision', label: 'a person decides' },
};

// "Rule 1", or a value's id in words: "Expected sales".
const titleOf = (item: Item) =>
  item.kind === 'rule'
    ? `Rule ${item.id.replace(/^rule_/, '')}`
    : item.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const words = (value: string) => value.replace(/\s+/g, ' ').trim();

// The examples on each product together, in the order the model gave them.
function byProduct(examples: Item['examples']) {
  const groups = new Map<string, Item['examples']>();
  for (const example of examples)
    groups.set(example.sku, [...(groups.get(example.sku) ?? []), example]);
  return [...groups];
}

const said = (item: Item, value: boolean | number | null) =>
  value === null
    ? '—'
    : item.kind === 'rule'
      ? value
        ? 'meets the rule'
        : 'breaks the rule'
      : String(value);

/*
  What the model wrote, set apart from what the app worked out: a line in the
  advisory tone, under the mark where there is a label beside it
  (`.rules-model` in rules-step.css). Everything without it is data or the
  app's own.
*/
function FromModel({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="rules-model" data-labelled={label ? '' : undefined}>
      {label ? (
        <>
          <SparkleFilled aria-hidden className="rules-model-mark" />
          <span className="rules-model-label text-meta text-state-advisory">
            {label}
          </span>
        </>
      ) : null}
      <div className="rules-model-body grid gap-1">{children}</div>
    </div>
  );
}

// What waits on a person is drawn as the release card is (`CARD` in
// release-card.tsx): a floating face that stands off the step around it.
const ASKS = 'control-face surface-floating rounded-shell';

/*
  Accept and Deny: the quiet button's bordered face in the ready and blocked
  tones (control-tone, in rules-step.css). The icon is drawn heavier but
  smaller and a little faded, so the word leads; the icon side's padding is a
  step tighter, as the glyph carries its own space.
*/
const DECISION = {
  accept: { severity: 3, Icon: Check },
  deny: { severity: 0, Icon: Cross },
} as const;

function DecisionButton({
  decision,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof AriaButton>, 'children' | 'className'> & {
  decision: keyof typeof DECISION;
  children: ReactNode;
  className?: string;
}) {
  const { severity, Icon } = DECISION[decision];
  return (
    <AriaButton
      {...props}
      data-severity={severity}
      className={cx(
        'control-face control-hairline control-tone text-severity-ink interact:control-tone-hover interact:text-severity-strong data-[disabled]:control-off data-[disabled]:text-muted text-dense inline-flex h-8 cursor-pointer items-center gap-1 rounded-full pr-3.5 pl-2.5 font-medium whitespace-nowrap data-[disabled]:cursor-not-allowed',
        className,
      )}
    >
      <Icon
        aria-hidden
        size={14}
        strokeWidth={2.75}
        className="flex-none opacity-70"
      />
      {children}
    </AriaButton>
  );
}

// A product by its key and, in brackets, what it is.
const Product = ({
  sku,
  names,
}: {
  sku: string;
  names: Record<string, string>;
}) => (
  <span>
    <span className="font-medium">{sku}</span>
    {names[sku] ? <span className="text-muted"> [{names[sku]}]</span> : null}
  </span>
);

/*
  The rules of the instructions this run answers to, and the values they need:
  found by the model, then each given a formula and examples on real products.
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
  // What is already found and accepted for these instructions, on arrival.
  useEffect(() => {
    void run({ action: 'get', text });
  }, [run, text]);
  const body = rules.state.kind === 'done' ? rules.state.body : null;
  // The last rules seen stay while an action runs, so the list, and focus in
  // it, are kept.
  const [last, setLast] = useState<{
    set: RuleSet;
    names: Record<string, string>;
  } | null>(null);
  const current = body?.kind === 'rules' ? body : null;
  if (current && current.set !== last?.set)
    setLast({ set: current.set, names: current.names });
  const shown = current ?? last;
  const set = shown?.set ?? null;
  const names = shown?.names ?? {};
  const busy = rules.state.kind === 'running';
  const act = (request: Record<string, unknown>) =>
    void run({ ...request, text }).then((response) => {
      if (response?.kind === 'rules') onProgress(progressOf(response.set));
    });
  const progress = set ? progressOf(set) : null;

  return (
    <div className="grid gap-4">
      <Lede>
        The model turns your instructions into checks and tries each one on
        products from the sheet. Accept the ones it got right; every run under
        these instructions will use them.
      </Lede>

      {!set ? (
        <TrialControl
          label="Find the rules in the instructions"
          runningLabel="Reading the instructions…"
          state={rules.state}
          idle="Not found yet."
          onRun={() => act({ action: 'find', version })}
          summary={
            body?.kind === 'error'
              ? body.message
              : body?.kind === 'none'
                ? 'Nothing found yet for these instructions.'
                : null
          }
        />
      ) : (
        <>
          <div className={cx(ASKS, 'grid gap-3 p-4')}>
            <FromModel label="The intent, as the model reads it">
              <p className="text-body">{set.intent}</p>
            </FromModel>
            {set.intentConfirmedAt ? (
              <div>
                <StatusChip tone="ready">Accepted</StatusChip>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <DecisionButton
                  decision="accept"
                  isDisabled={busy}
                  onPress={() => act({ action: 'intent' })}
                >
                  Accept
                </DecisionButton>
                {sheet ? (
                  <DecisionButton
                    decision="deny"
                    onPress={sheet.showInstructions}
                  >
                    Deny: edit the instructions
                  </DecisionButton>
                ) : null}
              </div>
            )}
          </div>

          {progress ? (
            <Outcome>
              <StatusChip
                tone={
                  progress.approved === progress.total ? 'ready' : 'decision'
                }
              >
                {progress.approved} of {progress.total} accepted
              </StatusChip>
              <span className="text-dense text-muted">
                {plural(
                  set.items.filter((i) => i.kind === 'value').length,
                  'value',
                )}
                ,{' '}
                {plural(
                  set.items.filter((i) => i.kind === 'rule').length,
                  'rule',
                )}
              </span>
            </Outcome>
          ) : null}
          {!readId ? (
            <p className="text-dense text-muted">
              Read the sheet first: the examples are worked out on its data.
            </p>
          ) : null}
          {/* Always in the page, so its changes are read out; taking no room
              while it has nothing to say. */}
          <p
            role="status"
            className={
              busy || body?.kind === 'error'
                ? 'text-meta text-muted'
                : 'sr-only'
            }
          >
            {busy
              ? 'Working… writing a check can take a minute.'
              : body?.kind === 'error'
                ? body.message
                : ''}
          </p>

          <ol className="grid gap-3" aria-label="Values and rules">
            {set.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                quoted={words(text).includes(words(item.text))}
                names={names}
                busy={busy}
                canWrite={readId !== null}
                onWrite={() => act({ action: 'write', readId, id: item.id })}
                onDecide={(decision, note) =>
                  act({ action: 'decide', id: item.id, decision, note })
                }
              />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function ItemCard({
  item,
  quoted,
  names,
  busy,
  canWrite,
  onWrite,
  onDecide,
}: {
  item: Item;
  // The item is the instructions' own words, not the model's restatement.
  quoted: boolean;
  names: Record<string, string>;
  busy: boolean;
  canWrite: boolean;
  onWrite: () => void;
  onDecide: (decision: 'accept' | 'deny', note?: string) => void;
}) {
  const status = statusOf(item);
  const title = titleOf(item);
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
    <li className={cx(ASKS, 'grid gap-3 p-4')} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-dense font-semibold">
          {title}
          {item.kind === 'value' ? (
            <span className="text-muted font-normal">
              {' '}
              · a value the rules use
            </span>
          ) : null}
        </h3>
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
      </div>
      {quoted ? (
        <div className="grid gap-1">
          <span className="text-meta text-muted">
            From the instructions, word for word
          </span>
          <p className="text-body">&ldquo;{item.text}&rdquo;</p>
        </div>
      ) : (
        <FromModel label="The model's reading of the instructions">
          <p className="text-body">{item.text}</p>
        </FromModel>
      )}
      {item.kind === 'rule' && item.outcome ? (
        <FromModel>
          <p className="text-dense flex flex-wrap items-center gap-x-2 gap-y-1">
            If an order breaks it,
            <StatusChip tone={OUTCOME[item.outcome].tone}>
              {OUTCOME[item.outcome].label}
            </StatusChip>
          </p>
        </FromModel>
      ) : null}

      {item.examples.length ? (
        <div className="border-rule-faint grid gap-3 border-t pt-3">
          <div className="grid gap-0.5">
            <p className="text-dense font-medium">
              {item.kind === 'rule'
                ? "Check the model's verdicts"
                : "Check the model's sums"}
            </p>
            <p className="text-meta text-muted max-w-prose">
              {item.kind === 'rule'
                ? 'The model tried the rule on these orders, and the app’s check gets the same answer on each. If every verdict is right, accept the rule.'
                : 'The model worked the value out for these products, and the app’s check gets the same number on each. If every sum is right, accept the value.'}
            </p>
          </div>
          <ul className="grid gap-3" aria-label={`Examples for ${title}`}>
            {byProduct(item.examples).map(([sku, examples]) => (
              <li key={sku} className="grid gap-2">
                <p className="text-dense flex flex-wrap items-baseline gap-x-2">
                  <Product sku={sku} names={names} />
                  {new Set(examples.map((e) => e.expect)).size > 1 ? (
                    <span className="text-meta text-muted">
                      tried on both sides of the rule
                    </span>
                  ) : null}
                </p>
                {examples.map((example, index) => (
                  <div key={index} className="grid gap-1">
                    {example.order !== null || !example.agrees ? (
                      <p className="text-dense flex flex-wrap items-center gap-x-2 gap-y-1">
                        {example.order !== null ? (
                          <span className="text-muted">
                            Ordering {example.order}
                          </span>
                        ) : null}
                        {example.agrees ? null : (
                          <StatusChip tone="blocked">
                            The app&rsquo;s check says:{' '}
                            {example.error ?? said(item, example.actual)}
                          </StatusChip>
                        )}
                      </p>
                    ) : null}
                    <FromModel>
                      <p className="text-dense">
                        <span className="font-medium">
                          {item.kind === 'rule'
                            ? `The order is ${said(item, example.expect)}`
                            : `Gives ${said(item, example.expect)}`}
                          .
                        </span>{' '}
                        {example.why}
                      </p>
                    </FromModel>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.deniedAt ? (
        <p className="text-dense">
          You denied this
          {item.denial ? <>: &ldquo;{item.denial}&rdquo;</> : null}. Write it
          again to send that to the model.
        </p>
      ) : null}
      {item.problem ? <p className="text-dense">{item.problem}</p> : null}

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
          {item.formula && open ? (
            <>
              <DecisionButton
                decision="accept"
                isDisabled={busy || !acceptable(item)}
                onPress={() => onDecide('accept')}
              >
                Accept
              </DecisionButton>
              <DecisionButton
                decision="deny"
                ref={denyButton}
                isDisabled={busy}
                onPress={() => setDenying(true)}
              >
                Deny
              </DecisionButton>
            </>
          ) : null}
          {open ? (
            <Button pill isDisabled={busy || !canWrite} onPress={onWrite}>
              {item.formula ? 'Write again' : 'Write the check'}
            </Button>
          ) : null}
          {item.formula && open && !acceptable(item) ? (
            <span className="text-meta text-muted">
              Accept waits until the app’s check agrees with every example.
            </span>
          ) : null}
        </div>
      )}

      {item.formula ? (
        <div className="grid">
          <TechnicalDetails label="The formula">
            <FromModel
              label={item.model ? `Written by ${item.model}` : undefined}
            >
              <Code>{item.formula}</Code>
            </FromModel>
          </TechnicalDetails>
        </div>
      ) : null}
    </li>
  );
}
