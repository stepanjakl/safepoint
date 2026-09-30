'use client';

import { cx } from '@/lib/cx';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/model';
import { runStamp } from '@/lib/process/run-time';
import { byAttention, type SystemLink } from '@/lib/process/system-links';
import {
  DrawerAside,
  viewKey,
  type AsideLayer,
  type AsideView,
} from '@/components/app-shell/drawer-aside';
import { AddInputPanel } from '@/components/app-shell/inputs/input-connections';
import { InputDetailView } from '@/components/app-shell/inputs/input-detail';
import {
  InstructionChanges,
  InstructionEditor,
  InstructionsPanel,
} from '@/components/app-shell/instructions/instructions-panel';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { ProcessSettings } from './process-settings';
import { useAsidePanel } from '@/components/app-shell/use-aside-panel';
import { OutputsList } from './outputs-list';
import { SECTION } from './panel-parts';
import { InputsList } from '@/components/app-shell/inputs/inputs-list';
import { SectionRow } from '@/components/app-shell/runs/section-row';
import type { ProcessTab } from './process-tab-store';
import {
  SystemDisc,
  SystemMeta,
} from '@/components/app-shell/system/system-parts';

/*
  What the process is, in the sheet rather than over it. The header's menu
  chooses which of these is showing; the run itself is the other half of that
  choice and lives in process-sheet.tsx.

  Each one is a list beside a detail. The detail is the same panel the drawer
  used, with its swap, its direction and its focus handling unchanged -- only
  where it sits has changed. Below the two-column width the detail takes the
  list's place, as it did in the drawer.
*/
// The Inputs section row's Add button, where focus goes after an input is
// removed.
const ADD_INPUT_ID = 'add-input';
const ADD_BUTTON =
  'control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary aria-expanded:bg-surface-selected aria-expanded:text-primary rounded-control text-meta inline-flex min-h-7 cursor-pointer items-center gap-1 px-1.5';

/*
  The list keeps a readable measure and the detail takes the rest. One column
  below that, where the detail replaces the list rather than squeezing it --
  and one column at any width for the tabs whose rows do not open anything,
  which would otherwise hold a second column open for nothing.
*/
const COLUMNS = 'grid h-full min-h-0 grid-cols-[minmax(0,1fr)]';
const TWO_COLUMNS =
  '@sheet-narrow/sheet:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] @sheet-narrow/sheet:[&>*]:min-w-0 @sheet-wide/sheet:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]';

// Which tabs have a detail to put beside their list.
const OPENS_DETAIL = new Set<ProcessTab>(['instructions', 'inputs']);

type AsidePanel = Omit<AsideLayer, 'key'>;

export function ProcessPanels({
  process,
  tab,
  openView = null,
  inputs,
  availableInputs = [],
  inputDetails = {},
  onRemoveInput,
  onAddInput,
  onLeave,
}: {
  process: ProcessSummary;
  tab: Exclude<ProcessTab, 'runs'>;
  // A detail to open with, asked for from outside the panel -- a version's
  // change log from the runs rail, an input from the run's thread. The panel
  // is keyed on it upstream, so it is read once, at mount.
  openView?: AsideView | null;
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
  // Aliased away from `current`: a bare `current` read in render is what a
  // misread ref looks like, both to a reader and to the lint rule that guards
  // against one.
  const {
    versions,
    current: version,
    next,
  } = useInstructions(process.id, process.instructions);
  const run = process.runs.find((entry) => entry.current);

  // Where one view sits in the list it was chosen from: inputs in the order
  // the Inputs tab lists them, versions oldest first, as the pager steps
  // through them. Anything else keeps the default.
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
  const {
    aside,
    exiting,
    leaving,
    direction,
    openAside,
    closeAside,
    finishExit,
    onKeyDownCapture,
    forgetOpener,
    settleLeaving,
  } = useAsidePanel({
    initial: openView,
    place,
    viewKey,
    sameList: (from, to) => from.kind === to.kind,
    scope: '.process-panels',
  });
  // Opening a review item leaves this panel behind: the item is in the run.
  const leaveForRun = () => {
    finishExit();
    onLeave();
  };

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
                      forgetOpener();
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
              <span className="value">{version.version}</span> · saved as you
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
        runLabel={run ? runStamp(run.startedAt) : undefined}
        openId={!exiting && aside?.kind === 'input' ? aside.id : null}
        editable={onAddInput !== undefined}
        onOpen={(id) => openAside({ kind: 'input', id })}
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
          'process-panel-list shell:min-h-0 shell:overflow-y-auto shell:overscroll-contain border-rule-faint min-w-0',
          OPENS_DETAIL.has(tab) ? '@sheet-narrow/sheet:border-r' : null,
          panel ? '@max-sheet-narrow/sheet:hidden' : null,
        )}
      >
        {/* The same first row the runs rail has, so every section of the
            sheet names itself in the same place and none of them spends a
            header on it. Its one control is the section's own. */}
        <SectionRow
          id={SECTION[tab].id}
          title={SECTION[tab].title}
          count={
            tab === 'inputs'
              ? inputs.length
              : tab === 'outputs'
                ? outputs.length
                : undefined
          }
        >
          {tab === 'instructions' ? (
            <span className="bg-menu-chip value text-micro text-muted-strong rounded-control px-1.5 py-0.5">
              {version.version}
            </span>
          ) : tab === 'inputs' && onAddInput ? (
            <button
              type="button"
              id={ADD_INPUT_ID}
              onClick={() => openAside({ kind: 'add-input' })}
              aria-expanded={!exiting && aside?.kind === 'add-input'}
              className={ADD_BUTTON}
            >
              <span aria-hidden="true">+</span> Add
              <span className="sr-only"> an input, preview</span>
            </button>
          ) : null}
        </SectionRow>
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
          onLeft={settleLeaving}
        />
      ) : OPENS_DETAIL.has(tab) ? (
        // Only where a row opens something: a column that can never fill is
        // not an empty state, it is a mistake.
        <p className="text-muted text-meta @sheet-wide/sheet:block hidden place-self-center p-8">
          {tab === 'inputs'
            ? 'Choose an input to read the records it gave this run.'
            : 'Open a version to see what changed, or edit the current one.'}
        </p>
      ) : null}
    </div>
  );
}
