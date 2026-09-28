'use client';

import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import {
  DISCLOSURE,
  DISCLOSURE_BODY,
  SUMMARY,
} from '@/components/review/review-item-detail';
import { Button } from '@/components/ui/button';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { cx } from '@/lib/cx';
import { diffText, paragraphsOf } from '@/lib/process/instruction-diff';
import type { ProcessSummary } from '@/lib/process/model';
import type { AsideView } from '@/components/app-shell/drawer-aside';
import { useInstructions, type InstructionVersion } from './instructions-store';
import { TextDiff } from './text-diff';

// A quiet text button. aria-expanded holds the selected face while the side
// panel it opened is showing, so the drawer says which of its items is open;
// pressing it again closes that panel.
const QUIET =
  'control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary aria-expanded:bg-surface-selected aria-expanded:text-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 rounded-control text-meta inline-flex min-h-8 cursor-pointer items-center gap-1.5 px-2';
const FIELD =
  'text-dense text-primary placeholder:text-muted border-rule-default bg-surface-inset rounded-control field-sizing-content w-full resize-none border px-3 py-2.5 leading-relaxed';
const NOTE = 'border-rule-faint text-muted text-meta border-t pt-3';

const pad = (n: number) => String(n).padStart(2, '0');

/*
  The process's instructions as they stand, in the drawer. Reading happens
  here; everything that takes room -- what changed in a version, the editor --
  opens in the side panel, so the current text stays in view beside it.

  Editing never changes a published version: a draft is its own thing until
  it is published, and publishing appends, so "Ran under v4" on a run keeps
  meaning what it said.
*/
export function InstructionsPanel({
  process,
  aside,
  onShowChanges,
  onEdit,
}: {
  process: ProcessSummary;
  aside: AsideView | null;
  onShowChanges: (version: string) => void;
  onEdit: () => void;
}) {
  const store = useInstructions(process.id, process.instructions);
  const { current, versions, next, draft } = store;
  const previous = versions.at(-2);
  const editing = aside?.kind === 'edit';
  const showing = aside?.kind === 'changes' ? aside.version : null;

  const startEditing = () => {
    if (draft === null) store.saveDraft(current.text);
    onEdit();
  };

  return (
    <div className="grid gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-meta text-muted">
          <span className="value">{current.version}</span> ·{' '}
          {current.updatedLabel} · {current.author}
        </p>
        <AriaButton
          className={cx(QUIET, '-my-1')}
          aria-expanded={editing}
          onPress={startEditing}
        >
          {draft === null ? 'Edit' : 'Continue draft'}
        </AriaButton>
      </div>
      {draft !== null && !editing ? (
        <p className="text-meta bg-surface-inset rounded-control flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>
            Unpublished draft of <span className="value">{next}</span>
          </span>
          <AriaButton
            className={cx(QUIET, '-my-1.5')}
            onPress={store.discardDraft}
          >
            Discard
          </AriaButton>
        </p>
      ) : null}

      <div className="text-dense grid gap-3 leading-relaxed">
        {paragraphsOf(current.text).map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>

      {previous ? (
        // The panel opens to the drawer's left, and the arrow says so.
        <AriaButton
          className={cx(QUIET, '-mx-2 w-fit')}
          aria-expanded={showing === current.version}
          onPress={() => onShowChanges(current.version)}
        >
          <span aria-hidden="true">←</span> What changed from{' '}
          <span className="value">{previous.version}</span>
        </AriaButton>
      ) : null}

      <div>
        <details className={DISCLOSURE}>
          <summary className={SUMMARY}>
            History{' '}
            <span>
              {versions.length} {versions.length === 1 ? 'version' : 'versions'}
            </span>
          </summary>
          <div className={DISCLOSURE_BODY}>
            <ol className="grid gap-5">
              {[...versions].reverse().map((version, reversed) => {
                const index = versions.length - 1 - reversed;
                const isCurrent = index === versions.length - 1;
                return (
                  <li key={version.version} className="grid gap-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-0.5">
                        <p>
                          <span className="value">{version.version}</span>
                          {isCurrent ? (
                            <span className="text-muted"> · Current</span>
                          ) : index === 0 ? (
                            <span className="text-muted"> · First</span>
                          ) : null}
                        </p>
                        <p className="text-meta text-muted">
                          {version.updatedLabel} · {version.author}
                        </p>
                      </div>
                      <div className="-my-1 flex flex-none gap-1">
                        {index > 0 ? (
                          <AriaButton
                            className={QUIET}
                            aria-label={`Show what changed in ${version.version}`}
                            aria-expanded={showing === version.version}
                            onPress={() => onShowChanges(version.version)}
                          >
                            Changes
                          </AriaButton>
                        ) : null}
                        {isCurrent ? null : (
                          <AriaButton
                            className={QUIET}
                            aria-label={`Restore ${version.version} as a draft`}
                            onPress={() => {
                              store.saveDraft(version.text);
                              onEdit();
                            }}
                          >
                            Restore
                          </AriaButton>
                        )}
                      </div>
                    </div>
                    {version.note ? (
                      <p className="text-meta text-muted leading-normal">
                        {version.note}
                      </p>
                    ) : null}
                    {version.changes.length > 0 ? (
                      <p className="text-micro text-muted">
                        <span className="value">{version.changes.length}</span>{' '}
                        {version.changes.length === 1
                          ? 'change logged'
                          : 'changes logged'}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </details>
      </div>

      <p className={NOTE}>
        Saved in this browser. The recorded run ran under{' '}
        <span className="value">{process.instructions.version}</span>;
        publishing a new version does not run anything.
      </p>
    </div>
  );
}

/*
  One version's change, in the side panel, in the order a reviewer asks about
  it: why it was made, by whom and prompted by what, what its author says
  changed, and then the text itself. A pager steps through the other changes
  once there is more than one.
*/
export function InstructionChanges({
  from,
  to,
  position,
  total,
  earlier,
  later,
  onShow,
}: {
  from: InstructionVersion;
  to: InstructionVersion;
  position: number;
  total: number;
  earlier?: string;
  later?: string;
  onShow: (version: string) => void;
}) {
  return (
    <div className="grid gap-6 p-5">
      {to.note ? (
        <section aria-labelledby="change-why" className="grid gap-1.5">
          <h3 id="change-why" className="readout text-muted">
            Why
          </h3>
          <p className="text-body text-primary leading-relaxed">{to.note}</p>
        </section>
      ) : null}

      <Ledger className="border-rule-faint -mx-5 border-y">
        <LedgerRow label="Version" className="px-5">
          <span className="value">{to.version}</span> replaces{' '}
          <span className="value">{from.version}</span>
          <span className="text-muted"> · {from.updatedLabel}</span>
        </LedgerRow>
        <LedgerRow label="Published" className="px-5">
          {/* The row names the event, so the label's own verb goes. */}
          {to.updatedLabel.replace(/^(Updated|Published) /, '')}
        </LedgerRow>
        <LedgerRow label="By" className="px-5">
          {to.author}
        </LedgerRow>
        {to.promptedBy ? (
          <LedgerRow label="Prompted by" className="px-5">
            {to.promptedBy}
          </LedgerRow>
        ) : null}
      </Ledger>

      {to.changes.length > 0 ? (
        <section aria-labelledby="change-log" className="grid gap-2">
          <h3 id="change-log" className="readout text-muted">
            Change log <span className="value">{to.changes.length}</span>
          </h3>
          <ol className="grid gap-2.5">
            {to.changes.map((change, index) => (
              <li
                key={change}
                className="text-dense grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 leading-relaxed"
              >
                <span className="value text-meta text-muted pt-0.5">
                  {pad(index + 1)}
                </span>
                <span>{change}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby="change-text" className="grid gap-2">
        <h3 id="change-text" className="readout text-muted">
          Text
        </h3>
        <TextDiff
          key={to.version}
          before={from.text}
          after={to.text}
          from={from.version}
          to={to.version}
        />
      </section>

      {total > 1 ? (
        <nav
          aria-label="Other changes"
          className="border-rule-faint flex items-center justify-between gap-3 border-t pt-4"
        >
          <AriaButton
            className={QUIET}
            isDisabled={!earlier}
            onPress={() => earlier && onShow(earlier)}
          >
            <span aria-hidden="true">←</span> Earlier change
          </AriaButton>
          <span className="value text-meta text-muted">
            {pad(position)} / {pad(total)}
          </span>
          <AriaButton
            className={QUIET}
            isDisabled={!later}
            onPress={() => later && onShow(later)}
          >
            Later change <span aria-hidden="true">→</span>
          </AriaButton>
        </nav>
      ) : null}
    </div>
  );
}

/*
  Writing the next version, in the side panel: one field for the whole text,
  then a review of what it changes before it is published. One field because
  instructions are prose and a box per clause fights anyone writing more than a
  sentence; the structure a reviewer needs comes back in the comparison.
*/
export function InstructionEditor({
  process,
  onDone,
}: {
  process: ProcessSummary;
  onDone: () => void;
}) {
  const store = useInstructions(process.id, process.instructions);
  const { current, next, draft } = store;
  const [step, setStep] = useState<'write' | 'review'>('write');
  const [note, setNote] = useState('');

  // Spacing is not content: the draft is compared and published with its
  // paragraphs trimmed and separated by exactly one blank line.
  const normalised = paragraphsOf(draft ?? current.text).join('\n\n');
  const pending = diffText(current.text, normalised);
  const changed = pending.paragraphsChanged > 0 && normalised !== '';

  const steps = (
    <ol aria-label="Steps" className="text-meta flex gap-5">
      {(
        [
          ['write', 'Write'],
          ['review', 'Review'],
        ] as const
      ).map(([key, label], index) => (
        <li
          key={key}
          aria-current={step === key ? 'step' : undefined}
          className="text-muted aria-[current=step]:text-primary flex items-baseline gap-1.5"
        >
          <span className="value">{pad(index + 1)}</span>
          {label}
        </li>
      ))}
    </ol>
  );

  if (step === 'review') {
    return (
      <div className="grid gap-5 p-5">
        {steps}
        <TextDiff
          before={current.text}
          after={normalised}
          from={current.version}
          to={next}
        />
        <label className="text-meta text-muted grid gap-1.5">
          Why this change (optional)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What went wrong, or what the process should do differently"
            className={cx(FIELD, 'min-h-16')}
          />
        </label>
        <div className="border-rule-faint flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button onPress={() => setStep('write')}>Back to writing</Button>
          <Button
            variant="primary"
            onPress={() => {
              store.publish(normalised, note.trim() || null);
              onDone();
            }}
          >
            Publish {next}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-5">
      {steps}
      <textarea
        value={draft ?? current.text}
        onChange={(event) => store.saveDraft(event.target.value)}
        aria-label={`Instructions, draft of ${next}`}
        aria-describedby="instructions-draft-hint"
        // The field is the whole task here, so it takes focus on arrival.
        autoFocus
        className={cx(FIELD, 'min-h-80')}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p id="instructions-draft-hint" className="text-meta text-muted">
          Separate paragraphs with a blank line.
        </p>
        <p className="text-meta text-muted flex gap-x-2">
          {changed ? (
            <>
              <span>
                {pending.paragraphsChanged}{' '}
                {pending.paragraphsChanged === 1 ? 'paragraph' : 'paragraphs'}{' '}
                changed
              </span>
              {pending.wordsAdded > 0 ? (
                <span className="text-state-verified">
                  +{pending.wordsAdded}
                </span>
              ) : null}
              {pending.wordsRemoved > 0 ? (
                <span className="text-state-blocked">
                  −{pending.wordsRemoved}
                </span>
              ) : null}
            </>
          ) : (
            'No changes yet'
          )}
        </p>
      </div>
      <div className="border-rule-faint mt-1 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <AriaButton
          className={QUIET}
          onPress={() => {
            store.discardDraft();
            onDone();
          }}
        >
          Discard draft
        </AriaButton>
        <Button
          variant="primary"
          isDisabled={!changed}
          onPress={() => setStep('review')}
        >
          Review changes
        </Button>
      </div>
    </div>
  );
}
