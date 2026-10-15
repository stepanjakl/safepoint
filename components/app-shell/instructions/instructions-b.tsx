'use client';

import { useMemo, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { cx } from '@/lib/cx';
import { diffText, paragraphsOf } from '@/lib/process/instruction-diff';
import type { ProcessSummary } from '@/lib/process/model';
import type { AsideView } from '@/components/app-shell/drawer-aside';
import { ROW_BUTTON } from '@/components/app-shell/inputs/inputs-list';
import {
  Group,
  NOTE,
  SECTION,
} from '@/components/app-shell/process/panel-parts';
import { useRunSelection } from '@/components/app-shell/runs/run-selection';
import { labelDate, liveRange, useInstructions } from './instructions-store';

/*
  The proposed Instructions tab, shown beside the current one in development
  so the two can be compared. It is built from the Inputs tab's parts: rows on
  faint rules, a detail opened under a real header with a ledger flush under
  it, and the section's one control -- Edit -- in the section row. Whichever
  approach is kept, the other goes: this file, its tab key and its header item.
*/

// The quiet action in a detail, as the input detail's Remove is.
const QUIET =
  'control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary rounded-control text-meta -mx-1.5 inline-flex min-h-8 cursor-pointer items-center gap-1.5 px-1.5';

// How many runs ran under a version, counting a run started here.
function useRanUnder(process: ProcessSummary) {
  const runs = useRunSelection()?.runs ?? process.runs;
  return (version: string) =>
    runs.filter((run) => run.instructionsVersion === version).length;
}

const runsLabel = (count: number) =>
  count === 0 ? 'No runs' : `${count} ${count === 1 ? 'run' : 'runs'}`;

export function InstructionsListB({
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
  const ranUnder = useRanUnder(process);
  const showing = aside?.kind === 'version' ? aside.version : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
      <p className="text-dense text-muted leading-relaxed">
        What this process is told to do. Every published version is kept, and
        each run records the one it ran under.
      </p>
      <Group labelledBy={SECTION['instructions-b'].id}>
        <ul>
          {draft !== null ? (
            <li className="border-rule-faint border-b">
              <button
                type="button"
                className={ROW_BUTTON}
                aria-expanded={aside?.kind === 'edit'}
                onClick={onEdit}
              >
                <VersionRow version={next} state="Draft" meta="Not published" />
              </button>
            </li>
          ) : null}
          {[...versions].reverse().map((version, reversed) => {
            const index = versions.length - 1 - reversed;
            return (
              <li
                key={version.version}
                className="border-rule-faint border-b last:border-b-0"
              >
                <button
                  type="button"
                  className={ROW_BUTTON}
                  aria-expanded={showing === version.version}
                  onClick={() => onShowVersion(version.version)}
                >
                  <VersionRow
                    version={version.version}
                    state={version === current ? 'Current' : null}
                    meta={liveRange(versions, index)}
                    count={runsLabel(ranUnder(version.version))}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </Group>
      <p className={NOTE}>
        Editing and publishing is a preview saved in this browser; the recorded
        run and its review don’t change.
      </p>
    </div>
  );
}

// Laid out as an input row is: the name over its meta, the count and the
// chevron at the end.
function VersionRow({
  version,
  state,
  meta,
  count,
}: {
  version: string;
  state: string | null;
  meta: string;
  count?: string;
}) {
  return (
    <>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-dense text-primary">
          <span className="value">{version}</span>
          {state ? <span className="text-muted"> · {state}</span> : null}
        </span>
        <span className="text-meta text-muted group-aria-expanded/input-row:text-primary truncate">
          {meta}
        </span>
      </span>
      {count ? (
        <span className="text-meta text-muted group-aria-expanded/input-row:text-primary whitespace-nowrap">
          {count}
        </span>
      ) : null}
      <span aria-hidden="true" className="text-muted text-dense">
        ›
      </span>
    </>
  );
}

/*
  One version, under the panel's header: the facts a reader would otherwise
  have to ask for -- when, by whom, how many runs, and why it was written --
  in a ledger flush under the header, then its text or what changed in it.
*/
export function InstructionVersionViewB({
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
  const { versions, current } = store;
  const ranUnder = useRanUnder(process);
  const index = versions.findIndex((entry) => entry.version === version);
  const to = versions[index];
  const from = index > 0 ? versions[index - 1] : undefined;
  const [shown, setShown] = useState(from ? face : 'text');
  if (!to) return null;
  const isCurrent = to === current;
  const changesLabel = from ? `Changes from ${from.version}` : '';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
      {/* Flush under the panel's header, whose rule is its top edge. */}
      <Ledger className="border-rule-faint -mx-5 -mt-5 border-b">
        <LedgerRow label="Published" className="px-5">
          {labelDate(to.updatedLabel)}
          <span className="text-muted"> · {to.author}</span>
        </LedgerRow>
        <LedgerRow label="Ran under it" className="px-5">
          {runsLabel(ranUnder(to.version))}
        </LedgerRow>
        {to.promptedBy ? (
          <LedgerRow label="Prompted by" className="px-5">
            {to.promptedBy}
          </LedgerRow>
        ) : null}
        {to.note ? (
          <LedgerRow label="Why" className="px-5">
            <span className="leading-relaxed">{to.note}</span>
          </LedgerRow>
        ) : null}
      </Ledger>

      {from || !isCurrent ? (
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
          {/* The current version is edited from the section row; an earlier
              one comes back as a draft, never republished as it stands. */}
          {!isCurrent ? (
            <AriaButton
              className={QUIET}
              onPress={() => {
                store.saveDraft(to.text);
                onEdit();
              }}
            >
              Restore as draft
            </AriaButton>
          ) : null}
        </div>
      ) : null}

      {shown === 'changes' && from ? (
        <TextDiffB before={from.text} after={to.text} label={changesLabel} />
      ) : (
        <div className="text-dense grid max-w-prose gap-3 leading-relaxed">
          {paragraphsOf(to.text).map((paragraph, key) => (
            <p key={key} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/*
  A change read in the text's own face and measure. A paragraph put in or
  taken out keeps its tint and sign; a rewritten one is one paragraph, with the
  words taken out struck and the words put in underlined, so a one-clause edit
  reads as that clause rather than as the whole paragraph twice.
*/
const SIGN = {
  same: { sign: '', said: '', row: 'text-muted', ink: '' },
  changed: { sign: '±', said: 'Changed: ', row: '', ink: 'text-muted' },
  removed: {
    sign: '−',
    said: 'Removed: ',
    row: 'bg-diff-removed text-state-blocked',
    ink: 'text-diff-removed-sign',
  },
  added: {
    sign: '+',
    said: 'Added: ',
    row: 'bg-diff-added text-state-verified',
    ink: 'text-diff-added-sign',
  },
} as const;

export function TextDiffB({
  before,
  after,
  label,
}: {
  before: string;
  after: string;
  label: string;
}) {
  const paragraphs = useMemo(
    () => diffText(before, after).paragraphs,
    [before, after],
  );
  return (
    <ol
      aria-label={label}
      className="text-dense grid max-w-prose gap-1 leading-relaxed"
    >
      {paragraphs.map((paragraph, index) => {
        const kind = SIGN[paragraph.kind];
        return (
          <li
            key={index}
            className={cx(
              'rounded-control grid grid-cols-[1.25rem_minmax(0,1fr)] py-2 pe-3 whitespace-pre-line',
              kind.row,
            )}
          >
            <span
              aria-hidden="true"
              className={cx('text-center font-semibold', kind.ink)}
            >
              {kind.sign}
            </span>
            <span>
              {kind.said ? <span className="sr-only">{kind.said}</span> : null}
              {paragraph.kind === 'changed'
                ? paragraph.segments.map((segment, at) =>
                    segment.kind === 'same' ? (
                      <span key={at}>{segment.text}</span>
                    ) : segment.kind === 'removed' ? (
                      <del
                        key={at}
                        className="bg-diff-removed text-state-blocked"
                      >
                        <span className="sr-only">[removed: </span>
                        {segment.text}
                        <span className="sr-only">]</span>
                      </del>
                    ) : (
                      <ins
                        key={at}
                        className="bg-diff-added text-state-verified"
                      >
                        <span className="sr-only">[added: </span>
                        {segment.text}
                        <span className="sr-only">]</span>
                      </ins>
                    ),
                  )
                : paragraph.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
