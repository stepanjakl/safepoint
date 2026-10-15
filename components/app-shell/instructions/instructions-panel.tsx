'use client';

import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { cx } from '@/lib/cx';
import { diffText, paragraphsOf } from '@/lib/process/instruction-diff';
import type { ProcessSummary } from '@/lib/process/model';
import type { AsideView } from '@/components/app-shell/drawer-aside';
import {
  Group,
  NOTE,
  SECTION,
} from '@/components/app-shell/process/panel-parts';
import { useRunSelection } from '@/components/app-shell/runs/run-selection';
import { liveRange, useInstructions } from './instructions-store';
import { TextDiff } from './text-diff';

const pad = (n: number) => String(n).padStart(2, '0');

// A quiet text button. aria-expanded holds the selected face while the side
// panel it opened is showing, so the drawer says which of its items is open;
// pressing it again closes that panel.
const QUIET =
  'control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary aria-expanded:bg-surface-selected aria-expanded:text-primary data-[disabled]:cursor-not-allowed rounded-control text-meta inline-flex min-h-8 cursor-pointer items-center gap-1.5 px-2';
// A version in the list, faced as an input row is (inputs-list.tsx): the
// wash bleeds by the list inset, and the row stays selected while it is open.
const ROW =
  'control-wash hover:bg-surface-hover focus-visible:bg-surface-hover aria-expanded:bg-surface-selected aria-expanded:text-primary rounded-control -mx-sheet-inset px-sheet-inset grid min-h-11 w-[calc(100%+2*var(--spacing-sheet-inset))] cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2 text-left';
const FIELD =
  'field text-dense text-primary field-sizing-content w-full resize-none px-3 py-2.5 leading-relaxed';

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="text-dense grid gap-3 leading-relaxed">
      {paragraphsOf(text).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/*
  Every version the process's instructions have been, newest first, in the
  drawer. A version opens in the side panel -- its text, and what changed in
  it -- and the latest opens there with the tab, so the list is all this
  column holds.

  Editing never changes a published version: a draft is its own thing until
  it is published, and publishing appends, so "Ran under v4" on a run keeps
  meaning what it said. Each version says how many runs ran under it, which
  is what makes one result comparable with another.
*/
export function InstructionsPanel({
  process,
  aside,
  onShowVersion,
  onEdit,
}: {
  process: ProcessSummary;
  aside: AsideView | null;
  onShowVersion: (version: string) => void;
  onEdit: () => void;
}) {
  const { current, versions, next, draft } = useInstructions(
    process.id,
    process.instructions,
  );
  const editing = aside?.kind === 'edit';
  const showing = aside?.kind === 'version' ? aside.version : null;
  // The runs the rail lists, a run started here included.
  const runs = useRunSelection()?.runs ?? process.runs;
  const ranUnder = (version: string) =>
    runs.filter((run) => run.instructionsVersion === version).length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
      <Group labelledBy={SECTION.instructions.id}>
        <ol className="grid gap-px">
          {draft !== null ? (
            <li>
              <AriaButton
                className={ROW}
                aria-expanded={editing}
                onPress={onEdit}
              >
                <span className="grid gap-0.5">
                  <span>
                    <span className="value">{next}</span>
                    <span className="text-muted"> · Draft</span>
                  </span>
                  <span className="text-meta text-muted">
                    Unpublished, saved in this browser
                  </span>
                </span>
              </AriaButton>
            </li>
          ) : null}
          {[...versions].reverse().map((version, reversed) => {
            const index = versions.length - 1 - reversed;
            const count = ranUnder(version.version);
            return (
              <li key={version.version}>
                <AriaButton
                  className={ROW}
                  aria-expanded={showing === version.version}
                  onPress={() => onShowVersion(version.version)}
                >
                  <span className="grid gap-0.5">
                    <span>
                      <span className="value">{version.version}</span>
                      {version === current ? (
                        <span className="text-muted"> · Current</span>
                      ) : null}
                    </span>
                    <span className="text-meta text-muted">
                      {liveRange(versions, index)} · {version.author}
                    </span>
                  </span>
                  <span className="text-meta text-muted whitespace-nowrap">
                    {count === 0 ? (
                      'No runs'
                    ) : (
                      <>
                        <span className="value text-primary">{count}</span>{' '}
                        {count === 1 ? 'run' : 'runs'}
                      </>
                    )}
                  </span>
                </AriaButton>
              </li>
            );
          })}
        </ol>
      </Group>

      {/* Only a process with a recorded run can say what it ran under; a new
          run started here records its own version. */}
      <p className={NOTE}>
        Saved in this browser.{' '}
        {process.runs.some((run) => run.current) ? (
          <>
            The recorded run ran under{' '}
            <span className="value">{process.instructions.version}</span>;
          </>
        ) : (
          'A run started from now on runs under the version current then;'
        )}{' '}
        publishing a new version does not run anything.
      </p>
    </div>
  );
}

/*
  One version, in the side panel: its text, or -- one press away -- what
  changed in it from the one before. The current version is edited from here;
  an earlier one is restored as a draft, never republished as it stands.
*/
export function InstructionVersionView({
  process,
  version,
  face,
  onEdit,
}: {
  process: ProcessSummary;
  version: string;
  face: 'text' | 'changes';
  onEdit: () => void;
}) {
  const store = useInstructions(process.id, process.instructions);
  const { versions, current, draft } = store;
  const index = versions.findIndex((entry) => entry.version === version);
  const to = versions[index];
  const from = index > 0 ? versions[index - 1] : undefined;
  const [shown, setShown] = useState(from ? face : 'text');
  if (!to) return null;
  const isCurrent = to === current;
  const changesLabel = from ? `Changes from ${from.version}` : '';

  return (
    <div className="grid gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        {from ? (
          <FilterTabs
            tabs={[
              { key: 'text', short: 'Text', label: 'Text' },
              { key: 'changes', short: changesLabel, label: changesLabel },
            ]}
            selected={shown}
            onChange={setShown}
            leadKey={null}
            ariaLabel={`Instructions ${to.version}`}
            menuLabel="Other views"
            className="w-fit"
          />
        ) : (
          <span />
        )}
        <AriaButton
          className={cx(QUIET, '-me-2')}
          onPress={() => {
            // Restoring replaces any draft; editing the current one keeps it.
            if (!isCurrent) store.saveDraft(to.text);
            else if (draft === null) store.saveDraft(current.text);
            onEdit();
          }}
        >
          {isCurrent
            ? draft === null
              ? 'Edit'
              : 'Continue draft'
            : 'Restore as draft'}
        </AriaButton>
      </div>
      {shown === 'changes' && from ? (
        <TextDiff before={from.text} after={to.text} label={changesLabel} />
      ) : (
        <Paragraphs text={to.text} />
      )}
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
  Diff = TextDiff,
}: {
  process: ProcessSummary;
  onDone: () => void;
  // How the review shows the change; the comparison tab brings its own.
  Diff?: typeof TextDiff;
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
        <Diff
          before={current.text}
          after={normalised}
          label={`Changes from ${current.version}`}
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
