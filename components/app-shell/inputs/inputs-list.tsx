'use client';

import { useState } from 'react';

import type { InputDetail } from '@/lib/process/input-details';
import { byAttention, type SystemLink } from '@/lib/process/system-links';
import {
  Group,
  NOTE,
  SECTION,
} from '@/components/app-shell/process/panel-parts';
import {
  SystemDisc,
  SystemMeta,
} from '@/components/app-shell/system/system-parts';

// A filter field earns its place once the list is longer than a glance takes in.
const FILTER_FROM = 12;

// A row that opens its input: the wash reaches past the row's text by the
// amount it pads back in, so the disc and name stay where a plain row has them.
// It bleeds by the list inset rather than by a number of its own, which puts
// its edge on the section row's axis above it -- the panel's body keeps its
// own reading margin, and the two things that are rows agree on one edge.
// aria-expanded holds the selected face while its panel is open, and takes the
// row's ink up with it. Every other control that reaches for the selected fill
// moves its ink in the same breath: it is the darkest ground a light theme puts
// text on, and a muted label left sitting on it is what puts the role back
// under AA -- see the note on --sp-surface-selected.
// Named group, so the two quiet parts of the row can answer a state held on the
// button around them.
const ROW_BUTTON =
  'group/input-row control-wash hover:bg-surface-hover focus-visible:bg-surface-hover aria-expanded:bg-surface-selected aria-expanded:text-primary rounded-control -mx-sheet-inset px-sheet-inset flex min-h-11 w-[calc(100%+2*var(--spacing-sheet-inset))] cursor-pointer items-center gap-3 py-2 text-left';

export function InputsList({
  inputs,
  details,
  runLabel,
  openId,
  editable,
  onOpen,
}: {
  inputs: SystemLink[];
  details: Record<string, InputDetail>;
  runLabel: string | undefined;
  openId: string | null;
  // Whether this scenario's inputs can be changed at all -- the Add control
  // itself is in the section row, and this only decides what the note says.
  editable: boolean;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const shown = [...inputs]
    .sort(byAttention)
    .filter((link) => link.label.toLocaleLowerCase().includes(needle));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
      <p className="text-dense text-muted leading-relaxed">
        The JSON files this run read. Each is an analysed extract, treated as
        the source of truth; producing and updating them happens outside
        Safepoint.
      </p>
      {inputs.length > FILTER_FROM ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter inputs"
          aria-label="Filter inputs"
          className="field text-dense text-primary min-h-9 w-full px-3"
        />
      ) : null}
      <Group
        labelledBy={SECTION.inputs.id}
        meta={runLabel ? `As read by the run of ${runLabel}` : undefined}
      >
        {inputs.length === 0 ? (
          <p className="text-dense text-muted py-2">
            This process lists no input files.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-dense text-muted py-2">
            No inputs match “{query}”.
          </p>
        ) : (
          <ul>
            {shown.map((link) => (
              <li
                key={link.id}
                className="border-rule-faint border-b last:border-b-0"
              >
                {details[link.id] ? (
                  <button
                    type="button"
                    id={`input-row-${link.id}`}
                    className={ROW_BUTTON}
                    aria-expanded={openId === link.id}
                    onClick={() => onOpen(link.id)}
                  >
                    <InputRow link={link} />
                    <span aria-hidden="true" className="text-muted text-dense">
                      ›
                    </span>
                  </button>
                ) : (
                  <div className="flex min-h-11 items-center gap-3 py-2">
                    <InputRow link={link} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Group>
      <p className={NOTE}>
        {editable
          ? 'Adding and removing an input is a preview saved in this browser; the recorded run and its review don’t change.'
          : 'Inputs can’t be changed in this demo.'}
      </p>
    </div>
  );
}

// Name above its file and condition rather than beside them: names and
// condition labels are both long, and side by side one of them is always the
// one cut short.
function InputRow({ link }: { link: SystemLink }) {
  return (
    <>
      <SystemDisc link={link} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-dense text-primary truncate">{link.label}</span>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <SystemMeta link={link} />
          {link.file ? (
            <span className="value text-micro text-muted group-aria-expanded/input-row:text-primary truncate">
              {link.file}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );
}
