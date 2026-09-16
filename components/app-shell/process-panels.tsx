'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '@/lib/cx';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import { byAttention, type SystemLink } from '@/lib/process/system-links';
import {
  DrawerAside,
  viewKey,
  type AsideLayer,
  type AsideView,
  type SwapDirection,
} from './drawer-aside';
import { AddInputPanel } from './input-connections';
import { InputDetailView } from './input-detail';
import {
  InstructionChanges,
  InstructionEditor,
  InstructionsPanel,
} from './instructions-panel';
import { useInstructions } from './instructions-store';
import { ProcessSettings } from './process-settings';
import type { ProcessTab } from './process-tab-store';
import { SystemDisc, SystemMeta } from './system-parts';

/*
  What the process is, in the sheet rather than over it. The header's menu
  chooses which of these is showing; the run itself is the other half of that
  choice and lives in process-sheet.tsx.

  Each one is a list beside a detail. The detail is the same panel the drawer
  used, with its swap, its direction and its focus handling unchanged -- only
  where it sits has changed. Below the two-column width the detail takes the
  list's place, as it did in the drawer.
*/
// A filter field earns its place once the list is longer than a glance takes in.
const FILTER_FROM = 12;
// The Inputs heading's Add button, where focus goes after an input is removed.
const ADD_INPUT_ID = 'add-input';

const NOTE = 'border-rule-faint text-muted text-meta border-t pt-3';

/*
  The list keeps a readable measure and the detail takes the rest. One column
  below that, where the detail replaces the list rather than squeezing it --
  and one column at any width for the tabs whose rows do not open anything,
  which would otherwise hold a second column open for nothing.
*/
const COLUMNS = 'grid h-full min-h-0 grid-cols-[minmax(0,1fr)]';
const TWO_COLUMNS =
  'lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:[&>*]:min-w-0';

// Which tabs have a detail to put beside their list.
const OPENS_DETAIL = new Set<ProcessTab>(['instructions', 'inputs']);

type AsidePanel = Omit<AsideLayer, 'key'>;

export function ProcessPanels({
  process,
  tab,
  inputs,
  availableInputs = [],
  inputDetails = {},
  onRemoveInput,
  onAddInput,
  onLeave,
}: {
  process: ProcessSummary;
  tab: Exclude<ProcessTab, 'runs'>;
  // The process's inputs only; removed ones arrive as availableInputs.
  inputs: SystemLink[];
  availableInputs?: SystemLink[];
  inputDetails?: Record<string, InputDetail>;
  onRemoveInput?: (id: string) => void;
  onAddInput?: (id: string) => void;
  // Back to the run, for a link that leaves this panel behind.
  onLeave: () => void;
}) {
  const { outputs } = process;
  const { versions, current, next } = useInstructions(
    process.id,
    process.instructions,
  );
  const run = process.runs.find((entry) => entry.current);

  // The view on show. It stays set while the panel animates out, with
  // `exiting` marking that, so the panel leaves with its content in it.
  const [aside, setAside] = useState<AsideView | null>(null);
  const [exiting, setExiting] = useState(false);
  // The view being swapped out, kept while its content leaves.
  const [leaving, setLeaving] = useState<AsideView | null>(null);
  // Which way the swap travels: towards an item further down its list or
  // back up it.
  const [direction, setDirection] = useState<SwapDirection>('down');
  // What opened the panel, so closing it puts focus back there. A choice made
  // inside the panel -- paging to another change -- keeps the original.
  const opener = useRef<HTMLElement | null>(null);
  // Where focus returns once a closing panel is gone.
  const returnTo = useRef<HTMLElement | null>(null);

  const finishExit = () => {
    setAside(null);
    setLeaving(null);
    setExiting(false);
  };
  // Changing tab takes the detail with it -- what it was showing belongs to a
  // list that is no longer here -- and the sheet does that by keying this
  // component on the tab, so there is no state to reset by hand.
  // Focus moved back when the close began. If the panel took it with it on
  // the way out -- it held focus, and unmounting drops focus to the body --
  // put it back once the panel is actually gone.
  useEffect(() => {
    if (aside !== null) return;
    const target = returnTo.current;
    returnTo.current = null;
    const active = document.activeElement;
    if (target?.isConnected && (!active || active === document.body)) {
      target.focus();
    }
  }, [aside]);
  const closeAside = (focusId?: string) => {
    if (aside === null || exiting) return;
    // Where focus goes back to: the element named, or else the row marked as
    // having this panel open -- the opener by definition, and the only
    // reliable one, since some browsers (Safari) do not focus a button on
    // click. The element focused when the panel opened is the last resort.
    const expanded = document.querySelector<HTMLElement>(
      '.process-panels [aria-expanded="true"]',
    );
    const recorded = opener.current?.isConnected ? opener.current : null;
    const target = focusId
      ? document.getElementById(focusId)
      : (expanded ?? recorded);
    opener.current = null;
    returnTo.current = target;
    requestAnimationFrame(() => target?.focus());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishExit();
      return;
    }
    // DrawerAside unmounts itself through finishExit when its exit has run.
    setLeaving(null);
    setExiting(true);
  };
  const openAside = (view: AsideView) => {
    // The control that opened the panel closes it.
    if (aside && !exiting && viewKey(aside) === viewKey(view)) {
      closeAside();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest('.drawer-aside')) {
      opener.current = active;
    }
    returnTo.current = null;
    // Swapping one detail for another lets the old content leave while the
    // new one arrives. With reduced motion it is simply replaced: two layers
    // with nothing moving would only overlap.
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    setLeaving(aside && !exiting && !reduce ? aside : null);
    if (aside && !exiting) setDirection(swapDirection(aside, view));
    setExiting(false);
    setAside(view);
  };
  // Opening a review item leaves this panel behind: the item is in the run.
  const leaveForRun = () => {
    finishExit();
    onLeave();
  };
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || aside === null || exiting) return;
    // A dialog centred over the sheet answers its own Escape.
    if (document.querySelector('[role=alertdialog]')) return;
    event.stopPropagation();
    closeAside();
  };

  // Where one view sits relative to another in the list it was chosen from:
  // inputs in the order the Inputs tab lists them, versions oldest first, as
  // the pager steps through them. Anything else keeps the default.
  function swapDirection(from: AsideView, to: AsideView): SwapDirection {
    const place = (view: AsideView) => {
      if (view.kind === 'input') {
        return [...inputs]
          .sort(byAttention)
          .findIndex((input) => input.id === view.id);
      }
      if (view.kind === 'changes') {
        return versions.findIndex((entry) => entry.version === view.version);
      }
      return -1;
    };
    const was = place(from);
    const is = place(to);
    return from.kind === to.kind && was >= 0 && is >= 0 && is < was
      ? 'up'
      : 'down';
  }

  const panel = aside ? asidePanel(aside) : null;
  const leavingPanel =
    leaving && aside && viewKey(leaving) !== viewKey(aside)
      ? asidePanel(leaving)
      : null;

  function asidePanel(view: AsideView): AsidePanel | null {
    switch (view.kind) {
      case 'input': {
        const link = inputs.find((input) => input.id === view.id);
        const detail = inputDetails[view.id];
        if (!link || !detail) return null;
        return {
          eyebrow: 'Input',
          title: detail.label,
          announce: detail.label,
          leading: <SystemDisc link={link} />,
          meta: <SystemMeta link={link} />,
          body: (
            <InputDetailView
              detail={detail}
              onNavigate={leaveForRun}
              onRemove={
                onRemoveInput
                  ? () => {
                      // The input leaves the list with this, so the panel
                      // goes at once rather than animating an empty face.
                      onRemoveInput(view.id);
                      opener.current = null;
                      finishExit();
                      requestAnimationFrame(() =>
                        document.getElementById(ADD_INPUT_ID)?.focus(),
                      );
                    }
                  : undefined
              }
            />
          ),
        };
      }
      case 'add-input':
        return onAddInput
          ? {
              eyebrow: 'Inputs · Preview',
              title: 'Add an input',
              announce: 'Add an input',
              meta: 'One of the scenario’s own evidence files.',
              body: (
                <AddInputPanel
                  available={availableInputs}
                  details={inputDetails}
                  onAdd={onAddInput}
                />
              ),
            }
          : null;
      case 'changes': {
        const index = versions.findIndex(
          (version) => version.version === view.version,
        );
        const to = versions[index];
        const from = index > 0 ? versions[index - 1] : undefined;
        if (!to || !from) return null;
        return {
          eyebrow: 'Instructions',
          title: (
            <>
              What changed in <span className="value">{to.version}</span>
            </>
          ),
          announce: `What changed in ${to.version}`,
          meta: `${to.updatedLabel} · ${to.author}`,
          body: (
            <InstructionChanges
              from={from}
              to={to}
              position={index}
              total={versions.length - 1}
              earlier={index > 1 ? from.version : undefined}
              later={versions[index + 1]?.version}
              onShow={(version) => openAside({ kind: 'changes', version })}
            />
          ),
        };
      }
      case 'edit':
        return {
          eyebrow: 'Instructions',
          title: 'Edit instructions',
          announce: 'Edit instructions',
          meta: (
            <>
              Draft of <span className="value">{next}</span> from{' '}
              <span className="value">{current.version}</span> · saved as you
              type
            </>
          ),
          focusOnOpen: false,
          body: (
            <InstructionEditor process={process} onDone={() => closeAside()} />
          ),
        };
    }
  }

  const list =
    tab === 'instructions' ? (
      <InstructionsPanel
        process={process}
        aside={exiting ? null : aside}
        onShowChanges={(version) => openAside({ kind: 'changes', version })}
        onEdit={() => openAside({ kind: 'edit' })}
      />
    ) : tab === 'inputs' ? (
      <InputsList
        inputs={inputs}
        details={inputDetails}
        runLabel={run?.label}
        openId={!exiting && aside?.kind === 'input' ? aside.id : null}
        adding={!exiting && aside?.kind === 'add-input'}
        onOpen={(id) => openAside({ kind: 'input', id })}
        onAdd={onAddInput ? () => openAside({ kind: 'add-input' }) : undefined}
      />
    ) : tab === 'outputs' ? (
      <OutputsList outputs={outputs} />
    ) : (
      <ProcessSettings process={process} />
    );

  return (
    <div
      className={cx(
        'process-panels',
        COLUMNS,
        OPENS_DETAIL.has(tab) && TWO_COLUMNS,
      )}
      onKeyDownCapture={onKeyDownCapture}
    >
      <div
        // Where the detail is showing and the two do not fit, it takes this
        // column's place rather than squeezing beside it.
        className={cx(
          'shell:min-h-0 shell:overflow-y-auto shell:overscroll-contain border-rule-faint min-w-0',
          OPENS_DETAIL.has(tab) ? 'lg:border-r' : null,
          panel ? 'max-lg:hidden' : null,
        )}
      >
        {list}
      </div>
      {aside && panel ? (
        <DrawerAside
          current={{ key: viewKey(aside), ...panel }}
          leaving={
            leaving && leavingPanel
              ? { key: viewKey(leaving), ...leavingPanel }
              : null
          }
          direction={direction}
          exiting={exiting}
          onExited={finishExit}
          onLeft={() => setLeaving(null)}
        />
      ) : OPENS_DETAIL.has(tab) ? (
        // Only where a row opens something: a column that can never fill is
        // not an empty state, it is a mistake.
        <p className="text-muted text-meta hidden place-self-center p-8 lg:block">
          {tab === 'inputs'
            ? 'Choose an input to read the records it gave this run.'
            : 'Open a version to see what changed, or edit the current one.'}
        </p>
      ) : null}
    </div>
  );
}

function InputsList({
  inputs,
  details,
  runLabel,
  openId,
  adding,
  onOpen,
  onAdd,
}: {
  inputs: SystemLink[];
  details: Record<string, InputDetail>;
  runLabel: string | undefined;
  openId: string | null;
  adding: boolean;
  onOpen: (id: string) => void;
  onAdd?: () => void;
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
          className="text-dense text-primary placeholder:text-muted border-rule-default bg-surface-inset rounded-control min-h-9 w-full border px-3"
        />
      ) : null}
      <LinkGroup
        id="inputs-heading"
        title="Inputs"
        count={inputs.length}
        meta={runLabel ? `As read by the run of ${runLabel}` : undefined}
        action={
          onAdd ? (
            <button
              type="button"
              id={ADD_INPUT_ID}
              onClick={onAdd}
              aria-expanded={adding}
              className="control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary aria-expanded:bg-surface-selected aria-expanded:text-primary rounded-control text-meta -my-1 inline-flex min-h-7 cursor-pointer items-center gap-1 px-1.5"
            >
              <span aria-hidden="true">+</span> Add
              <span className="sr-only"> an input, preview</span>
            </button>
          ) : null
        }
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
      </LinkGroup>
      <p className={NOTE}>
        {onAdd
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
            <span className="value text-micro text-muted truncate">
              {link.file}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );
}

function OutputsList({ outputs }: { outputs: SystemLink[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
      <p className="text-dense text-muted leading-relaxed">
        The APIs this process may call once changes are approved, what each call
        can genuinely do, and how it is undone.
      </p>
      <LinkGroup
        id="outputs-heading"
        title="Outputs"
        count={outputs.length}
        meta="Nothing is called until a review is approved"
      >
        {outputs.length === 0 ? (
          <p className="text-dense text-muted py-2">None.</p>
        ) : (
          <ul>
            {outputs.map((link) => (
              <li
                key={link.id}
                className="border-rule-faint flex items-start gap-3 border-b py-3 last:border-b-0"
              >
                <SystemDisc link={link} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-dense text-primary">
                      {link.label}
                    </span>
                    <SystemMeta link={link} />
                  </span>
                  {link.api ? (
                    <span className="value text-micro text-muted">
                      {link.api}
                    </span>
                  ) : null}
                  {link.undo ? (
                    <span className="text-meta text-muted leading-normal">
                      {link.undo}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </LinkGroup>
      <p className={NOTE}>Outputs can’t be changed in this demo.</p>
    </div>
  );
}

// A row that opens its input: the wash reaches past the row's text by the
// amount it pads back in, so the disc and name stay where a plain row has them.
// aria-expanded holds the selected face while its panel is open.
const ROW_BUTTON =
  'control-wash hover:bg-surface-inset focus-visible:bg-surface-inset aria-expanded:bg-surface-selected rounded-control -mx-2 flex min-h-11 w-[calc(100%+1rem)] cursor-pointer items-center gap-3 px-2 py-2 text-left';

function LinkGroup({
  id,
  title,
  count,
  meta,
  action,
  children,
}: {
  id: string;
  title: string;
  count: number;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3 pb-1.5">
        <h3 id={id} className="readout text-muted">
          {title} <span className="value">{count}</span>
        </h3>
        <div className="flex items-baseline gap-2">
          {meta ? <p className="text-meta text-muted">{meta}</p> : null}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}
