'use client';

import Check from 'blode-icons-react/icons/checkmark-1-small';
import Cross from 'blode-icons-react/icons/cross-small';
import SparkleFilled from 'blode-icons-react/icons/sparkle-filled';
import type { ReactNode } from 'react';

import { Code, StatusChip } from '@/components/sheet-process/trial-parts';
import type { Definition } from '@/lib/definitions/types';
import { TRIED } from '@/lib/definitions/types';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';

/*
  The pieces a definition's card is drawn from: the model's mark, a record's
  name, what an example proposes, and the app's working of it.
*/

// The examples on each record together, in the order the model gave them.
function byRecord(examples: Definition['examples']) {
  const groups = new Map<string, Definition['examples']>();
  for (const example of examples)
    groups.set(example.key, [...(groups.get(example.key) ?? []), example]);
  return [...groups];
}

// A number as a person writes it: decimal noise settled (80.3, not
// 80.30000000000001).
const shown = (value: number) => String(Number(value.toFixed(6)));

export const said = (item: Definition, value: boolean | number | null) =>
  value === null
    ? '—'
    : typeof value === 'boolean'
      ? value
        ? 'holds'
        : 'fails'
      : shown(value);

/*
  What the model wrote, set apart from what the app worked out: a line in the
  advisory tone, under the mark where there is a label beside it
  (`.rules-model` in rules-step.css). Everything without it is data or the
  app's own.
*/
export function FromModel({
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

// A record by its key and, in brackets, its name.
const RecordName = ({
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

// The app's own working of one example: the formula with the record's values
// in place, so the arithmetic can be followed without the model's account.
// The app's result, and whether it matches the model's example.
function Outcome({
  item,
  example,
}: {
  item: Definition;
  example: Definition['examples'][number];
}) {
  return (
    <>
      {/* The result is a value, not a verdict, so it stays neutral; whether
          it matches the model's example is said beside it. */}
      <StatusChip tone="neutral">
        {example.error ?? said(item, example.actual)}
      </StatusChip>
      {example.agrees ? (
        <StatusChip tone="ready">
          <Check aria-hidden size={12} strokeWidth={2.75} className="me-1" />
          Matches the model
        </StatusChip>
      ) : (
        <StatusChip tone="blocked">
          <Cross aria-hidden size={12} strokeWidth={2.75} className="me-1" />
          Doesn&rsquo;t match the model
        </StatusChip>
      )}
    </>
  );
}

function Working({
  item,
  example,
  steps = [],
}: {
  item: Definition;
  example: Definition['examples'][number];
  steps: string[] | undefined;
}) {
  return (
    <p className="text-meta text-muted flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="sr-only">Worked out by the app:</span>
      {steps.map((step, index) => (
        <span key={index} className="contents">
          {index ? <span aria-hidden>→</span> : null}
          <Step text={step} />
        </span>
      ))}
      {steps.length ? <span aria-hidden>→</span> : null}
      <span className="sr-only">gives</span>
      <Outcome item={item} example={example} />
    </p>
  );
}

// The model's account of one example: its verdict, then its reasons.
function Reasoning({
  item,
  example,
}: {
  item: Definition;
  example: Definition['examples'][number];
}) {
  const verdict =
    typeof example.expect === 'boolean'
      ? example.expect
        ? 'Holds.'
        : 'Fails.'
      : `Gives ${said(item, example.expect)}.`;
  return (
    <FromModel>
      <p className="text-dense italic">
        <span className="font-medium">{verdict}</span> {example.why}
      </p>
    </FromModel>
  );
}

// What an example tries is the model's proposal: the model's blue. The
// variable is drawn the same here and in the formula.
const TRIED_TONE = 'text-state-advisory';
export const TRIED_VARIABLE =
  'bg-tried-face text-state-advisory rounded-control px-1 font-semibold';

// A name a formula reads, as the formula's own face shows it: a number or
// group the definition brings.
export const DEFINED_NAME =
  'bg-surface-floating text-state-advisory rounded-control px-1 font-semibold';

// A name and what it holds, as the formula reads it: order = 20.
export function Assignment({
  name,
  face,
  children,
}: {
  name: string;
  face: string;
  children: ReactNode;
}) {
  return (
    <code className="value text-meta inline-flex flex-wrap items-center gap-1.5">
      <span className={face}>{name}</span>
      <span className="text-muted">=</span>
      <span className="font-semibold">{children}</span>
    </code>
  );
}

// What an example proposes.
const ProposedValue = ({ id, value }: { id: string; value: number }) => (
  <Assignment name={id} face={TRIED_VARIABLE}>
    {value}
  </Assignment>
);

// A step of the working, the value the example tried in its tone.
export function Step({ text }: { text: string }) {
  const parts = text.split(new RegExp(`${TRIED[0]}(.*?)${TRIED[1]}`));
  return (
    <Code>
      {parts.map((part, index) =>
        index % 2 ? (
          <span key={index} className={`${TRIED_TONE} font-semibold`}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </Code>
  );
}

// Each record's examples together, a faint rule above all but the first.
const RECORD =
  'border-rule-faint grid gap-4 border-t pt-5 first:border-t-0 first:pt-0';

// The examples: each record's examples together, every one with the model's
// account and the app's working under it.
export function Examples({
  item,
  names,
  working,
}: {
  item: Definition;
  names: Record<string, string>;
  working: string[][];
}) {
  const title = item.name;
  return (
    <>
      {item.result === 'number' ? (
        <ul className="grid gap-5 px-4" aria-label={`Examples for ${title}`}>
          {item.examples.map((example, index) => (
            <li key={index} className={RECORD}>
              <p className="text-dense">
                <RecordName sku={example.key} names={names} />
              </p>
              <Reasoning item={item} example={example} />
              <Working item={item} example={example} steps={working[index]} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-5 px-4" aria-label={`Examples for ${title}`}>
          {byRecord(item.examples).map(([key, examples]) => (
            <li key={key} className={RECORD}>
              <p className="text-dense flex flex-wrap items-baseline gap-x-2">
                <RecordName sku={key} names={names} />
              </p>
              {examples.map((example, index) => (
                <div key={index} className="grid gap-2">
                  <p className="text-dense flex flex-wrap items-center gap-x-2 gap-y-1">
                    {SUBJECT.proposal
                      .filter((field) => field.id in example.inputs)
                      .map((field) => (
                        <ProposedValue
                          key={field.id}
                          id={field.id}
                          value={example.inputs[field.id]!}
                        />
                      ))}
                  </p>
                  <Reasoning item={item} example={example} />
                  <Working
                    item={item}
                    example={example}
                    steps={working[item.examples.indexOf(example)]}
                  />
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
