'use client';

import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { MorphingText, MORPH_WORDS_MS } from '@/components/ui/morphing-text';
import {
  Activity,
  createContext,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from 'react';
import { cx } from '@/lib/cx';
import { LAST_PROCESS_KEY } from '@/lib/process/navigation';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/model';
import type { SystemLink } from '@/lib/process/system-links';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { useRemovedInputs } from '@/components/app-shell/inputs/inputs-store';
import { writePreferenceCookie } from '@/components/app-shell/stored-record';
import { ProcessHeader } from './process-header';
import { ProcessContentTransition } from './process-content-transition';
import { ProcessPanels } from './process-panels';
import { useSheetChrome } from './sheet-chrome';
import type { AsideView } from '@/components/app-shell/drawer-aside';
import { useProcessTab, type ProcessTab } from './process-tab-store';
import { RunsList } from '@/components/app-shell/runs/runs-list';
import {
  RunSelectionProvider,
  useRunSelectionState,
} from '@/components/app-shell/runs/run-selection';
import {
  RunView,
  type PlayableRun,
} from '@/components/app-shell/runs/run-view';
import { StartRunButton } from '@/components/app-shell/runs/start-run-button';
import { SECTION } from './panel-parts';
import { ScheduleControl } from './schedule-control';
import { SectionRow } from '@/components/app-shell/runs/section-row';
import { useShellPageNavigation } from '@/components/app-shell/shell-page-transition';
import {
  SectionClock,
  SettledLayer,
  useDetailHold,
  useScreenSettled,
} from '@/components/ui/screen-settled';
import { useSwap } from '@/components/ui/swap';

const TAB_MOTION = (): 'fade' => 'fade';

/*
  What a process brings in place of the shared instructions panel, where its
  policy is something else: a versioned rulebook, approved by a person, is
  what a sheet process is told to do. Built on the server like the run.
*/
export type ProcessPolicy = {
  label: string;
  version: string;
  content: ReactNode;
};

/*
  What the run's thread can ask of the sheet around it. Absent where the thread
  is drawn without one -- the workbench -- so a caller offers the action only
  when there is a sheet to take it.
*/
export const ProcessSheetActions = createContext<{
  showInput: (id: string) => void;
  showVersion: (version: string) => void;
  // A change log needs a version before it; the first one has none to show.
  hasChanges: (version: string) => boolean;
  showInstructions: () => void;
  // Only where the process keeps a rulebook to show.
  showRules?: () => void;
  // The instructions now, which a run may predate.
  currentVersion: string;
} | null>(null);

/*
  The sheet, and what it is showing. The header's menu chooses between the run
  -- the list of runs beside the thread of the current one -- and the four
  panels that describe the process itself.

  The choice lives here rather than in the header because both halves answer to
  it, and it is state rather than a route: a tab is a way of looking at one
  process, not a place to link to. The run is rendered on the server and handed
  in, so choosing a tab never re-fetches it.

  Panels replace the run entirely, rail and all: the rail lists runs, which is
  the run's own furniture, and the panels need the width.
*/
export function ProcessSheet({
  process,
  inputs = [],
  inputDetails,
  run,
  initialRunId = null,
  playable,
  policy,
  liveThread,
  rulesPanel,
  inputsPanel,
  outputsPanel,
  savedTabs = null,
}: {
  process: ProcessSummary;
  inputs?: SystemLink[];
  inputDetails?: Record<string, InputDetail>;
  // A process's own rulebook, as a Rules tab; and its own Inputs and Outputs
  // tabs, in place of the evidence files' and outputs' lists.
  rulesPanel?: ReactNode;
  inputsPanel?: ReactNode;
  outputsPanel?: ReactNode;
  // The current run's thread, built on the server.
  run: ReactNode;
  policy?: ProcessPolicy;
  // Where a process runs step by step on the page: the live run's thread.
  liveThread?: ReactNode;
  // The run to open on, from the address; none opens on the empty page.
  initialRunId?: string | null;
  // What a started run is drawn from, where this process can play one.
  playable?: PlayableRun;
  // The cookie's copy of the tab last open in each process, for the first paint.
  savedTabs?: string | null;
}) {
  const [stored, setTab] = useProcessTab(process.id, savedTabs);
  // A Rules tab kept from a process that has one means nothing on another.
  const tab = stored === 'rules' && rulesPanel === undefined ? 'runs' : stored;
  // The root opens the process last open (app/(shell)/page.tsx).
  useEffect(() => {
    writePreferenceCookie(LAST_PROCESS_KEY, process.id);
  }, [process.id]);
  /*
    A detail the sheet has been asked to open: a version's change log from a
    boundary in the runs rail, or an input from a flag in the run's thread. It
    is a request rather than a place: the panels own which detail is open, so
    this only says which one to mount with, and it is cleared the moment the
    reader chooses a tab themselves.
  */
  const [openView, setOpenView] = useState<AsideView | null>(null);
  // Counts the requests, so a second one remounts the panels it is for.
  const [request, setRequest] = useState(0);
  // Set once the reader chooses a tab: a stored one that only storage knew of,
  // applied on hydration, is put in place without a swap.
  const [chosen, setChosen] = useState(false);
  const ask = (view: AsideView, next: ProcessTab) => {
    setChosen(true);
    setOpenView(view);
    setRequest((count) => count + 1);
    setTab(next);
  };
  const chooseTab = (next: ProcessTab) => {
    setChosen(true);
    setOpenView(null);
    setTab(next);
  };
  const showVersion = (version: string) =>
    ask({ kind: 'version', version, face: 'changes' }, 'instructions');
  // The selected tab answers at once; its previous body fades before the new
  // section arrives, without moving the dividers inside either layout.
  // The tab shown is held unseen until the sheet's frame has moved onto it
  // (sheet-chrome.ts), so the line is in place before what it divides.
  const [frameReady, setFrameReady] = useState<ProcessTab | null>(null);
  const { shown, incoming, layer, entering } = useSwap(
    tab,
    TAB_MOTION,
    chosen,
    undefined,
    frameReady === tab,
  );
  if (incoming !== null && frameReady !== null) setFrameReady(null);
  // Arriving from another process is an entrance too, for the detail's beat.
  const { enteringProcess } = useShellPageNavigation();
  // Inputs can be changed, as a preview, only where they have details to
  // show: the promotion scenario's files. Everything downstream reads the kept
  // set, so a removed input leaves the count and the list together.
  const { removed, remove, restore } = useRemovedInputs(process.id);
  // The current version, which a publish in this browser can move on.
  const { current, versions } = useInstructions(
    process.id,
    process.instructions,
  );
  const { version } = current;
  const kept = inputs.filter((input) => !removed.has(input.id));
  const available = inputs.filter((input) => removed.has(input.id));
  const editable = inputDetails !== undefined;
  const actions = {
    showInput: (id: string) => ask({ kind: 'input', id }, 'inputs'),
    showVersion,
    hasChanges: (version: string) =>
      versions.findIndex((entry) => entry.version === version) > 0,
    showInstructions: () => chooseTab('instructions'),
    showRules: rulesPanel === undefined ? undefined : () => chooseTab('rules'),
    currentVersion: version,
  };
  const selection = useRunSelectionState({
    process,
    initialRunId,
    canPlay: playable !== undefined,
    liveThread: liveThread !== undefined,
    version,
  });

  // The section a swap has landed, so what it holds can begin its own entrance.
  const [landed, setLanded] = useState<ProcessTab | null>(null);
  // The frame's bands and divider, held and moved through a swap.
  const chrome = useRef<HTMLDivElement>(null);
  const chromeTitles = useSheetChrome(chrome, {
    shown,
    incoming,
    settled: incoming === null && (!entering || landed === shown),
    onShow: setFrameReady,
  });
  if (incoming && landed !== null) setLanded(null);

  const section = (key: ProcessTab) =>
    key === 'runs' ? (
      /*
          Three columns where there is room, otherwise the runs become a strip
          above the thread. Between the two thresholds the strip takes what it
          needs and the thread takes the rest, so the thread scrolls rather than
          the document.
        */
      // Clipped to the pane's inner radius. The lists inside are full-bleed
      // and carry fills of their own, and at the pane's own radius they
      // paint over the edge its face draws in the bottom corners.
      <div className="shell:@max-sheet-wide/sheet:grid-rows-[auto_minmax(0,1fr)] shell:min-h-0 @sheet-wide/sheet:grid-cols-[232px_minmax(0,1fr)] rounded-b-shell-inner clip-past-pane-highlight process-runs grid grid-cols-[minmax(0,1fr)] overflow-clip">
        {/* Full-bleed: the list draws its own rules edge to edge, and
              padding on the column would leave them floating short of it. */}
        <aside
          aria-labelledby="runs-heading"
          className="process-runs-list sheet-bleed @sheet-wide/sheet:sheet-bleed-bottom @max-sheet-wide/sheet:sheet-bleed-end border-raised-ring shadow-separator-right-strong @sheet-wide/sheet:border-b-0 @sheet-wide/sheet:border-r shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative border-b"
        >
          <SectionRow id="runs-heading" title="Runs">
            <span className="flex items-center gap-1">
              <ScheduleControl
                processId={process.id}
                schedule={process.schedule}
              />
              <StartRunButton />
            </span>
          </SectionRow>
          <RunsList
            process={process}
            onShowVersion={showVersion}
            onShowRules={actions.showRules}
          />
        </aside>
        <RunsDetail>
          <ProcessSheetActions value={actions}>
            <RunView
              process={process}
              recorded={run}
              playable={playable}
              liveThread={liveThread}
            />
          </ProcessSheetActions>
        </RunsDetail>
      </div>
    ) : key === 'rules' ? (
      <SinglePanel {...SECTION.rules} width="wide">
        {rulesPanel}
      </SinglePanel>
    ) : key === 'instructions' && policy ? (
      <PolicyPanel policy={policy} />
    ) : key === 'inputs' && inputsPanel ? (
      <SinglePanel {...SECTION.inputs} width="full">
        {inputsPanel}
      </SinglePanel>
    ) : key === 'outputs' && outputsPanel ? (
      <SinglePanel {...SECTION.outputs} width="full">
        {outputsPanel}
      </SinglePanel>
    ) : (
      <ProcessPanels
        // Keyed by request: the layer around it is keyed by tab, so the
        // detail it had open goes with its list, and a second request for
        // a different version remounts rather than being ignored. Not by
        // the view itself, which is cleared while the old tab fades out.
        key={request}
        process={process}
        tab={key}
        openView={openView}
        inputs={kept}
        availableInputs={available}
        inputDetails={inputDetails}
        onRemoveInput={editable ? remove : undefined}
        onAddInput={editable ? restore : undefined}
        onLeave={() => chooseTab('runs')}
      />
    );

  return (
    <RunSelectionProvider value={selection}>
      <div className="shell:grid shell:h-full shell:grid-rows-[auto_minmax(0,1fr)]">
        <ProcessHeader
          process={process}
          version={policy?.version ?? version}
          instructionsLabel={policy?.label}
          hasRules={rulesPanel !== undefined}
          inputs={kept}
          outputs={process.outputs}
          tab={tab}
          onTabChange={chooseTab}
        />
        {/* The frame the tab bodies trade places in, clipped to the pane's inner
            radius so a body or its scrollbar never crosses the corner's edge. */}
        <ProcessContentTransition
          className="process-sheet-frame shell:grid shell:min-h-0 shell:grid-rows-[minmax(0,1fr)] rounded-b-shell-inner rounded-tr-shell-inner clip-past-pane-highlight grid-cols-[minmax(0,1fr)] overflow-clip"
          finishesLeaving
        >
          <div ref={chrome} className="sheet-chrome" aria-hidden="true" />
          {chromeTitles.map(({ host, text }, index) =>
            createPortal(
              <MorphingText text={text} duration={MORPH_WORDS_MS} />,
              host,
              String(index),
            ),
          )}
          {/* The section on screen, and the one coming while it fades out:
              rendered hidden beforehand, so the swap only has to show it and a
              heavy section cannot stall its own fade-in. */}
          {(incoming ? [shown, incoming] : [shown]).map((key) => {
            const visible = key === shown;
            return (
              <Activity key={key} mode={visible ? 'visible' : 'hidden'}>
                <motion.div
                  {...(visible ? layer : { initial: { opacity: 0 } })}
                  onAnimationComplete={(definition) => {
                    if (!visible) return;
                    layer.onAnimationComplete(definition);
                    if (
                      typeof definition === 'object' &&
                      definition !== null &&
                      'opacity' in definition &&
                      definition.opacity === 1
                    )
                      setLanded(key);
                  }}
                  className="process-sheet-swap shell:grid shell:min-h-0 shell:grid-rows-[minmax(0,1fr)] relative z-1 grid-cols-[minmax(0,1fr)]"
                  data-swap-entering={(visible && entering) || undefined}
                >
                  <SettledLayer
                    settled={visible && (!entering || landed === key)}
                  >
                    <SectionClock
                      entering={!visible || entering || enteringProcess}
                    >
                      <Forming
                        active={
                          key !== 'settings' &&
                          (!visible || entering || enteringProcess)
                        }
                      >
                        {section(key)}
                      </Forming>
                    </SectionClock>
                  </SettledLayer>
                </motion.div>
              </Activity>
            );
          })}
        </ProcessContentTransition>
      </div>
    </RunSelectionProvider>
  );
}

// One column, the width of a run's thread, under the same first row every
// section of the sheet has.
function PolicyPanel({ policy }: { policy: ProcessPolicy }) {
  return (
    <SinglePanel
      id="policy-heading"
      title={policy.label}
      chip={
        <span className="bg-menu-chip value text-micro text-muted-strong rounded-control px-1.5 py-0.5">
          {policy.version}
        </span>
      }
    >
      {policy.content}
    </SinglePanel>
  );
}

// A panel a process brings of its own, in one column.
/*
  Marks a section as forming while its rows rise into place (process-sheet.css),
  and lets go once the last of them has, so a
  row that arrives later -- a run just started -- does not rise in on its own.
*/
function Forming({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [formed, setFormed] = useState(!active);
  const settled = useScreenSettled();
  return (
    <div
      className="contents"
      data-section-forming={formed ? undefined : true}
      data-entrance-held={!settled || undefined}
      onAnimationEnd={(event) => {
        if (event.animationName !== 'section-form-in') return;
        const rising = event.currentTarget
          .getAnimations({ subtree: true })
          .some(
            (animation) =>
              animation instanceof CSSAnimation &&
              animation.animationName === 'section-form-in' &&
              animation.playState === 'running',
          );
        if (!rising) setFormed(true);
      }}
    >
      {children}
    </div>
  );
}

/*
  The run beside the rail. The section around it has landed (SettledLayer);
  where it trails the list, its own fade's end is what releases the run.
*/
function RunsDetail({ children }: { children: ReactNode }) {
  const { held, props } = useDetailHold();
  const [ended, setEnded] = useState(!held);
  return (
    <div
      {...props}
      className="process-runs-detail shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative"
      onAnimationEnd={(event: AnimationEvent<HTMLElement>) => {
        if (event.target === event.currentTarget) setEnded(true);
      }}
    >
      <SettledLayer settled={ended}>{children}</SettledLayer>
    </div>
  );
}

function SinglePanel({
  id,
  title,
  count,
  chip,
  width = 'reading',
  children,
}: {
  id: string;
  title: string;
  count?: number;
  chip?: ReactNode;
  // A measure for reading, or room for a grid of cards.
  width?: 'reading' | 'wide' | 'full';
  children: ReactNode;
}) {
  return (
    <div className="process-panels grid h-full min-h-0 grid-cols-[minmax(0,1fr)]">
      {/* A column, so the section takes the height below its row and an
          empty state can centre in it. */}
      <div className="process-panel-list sheet-bleed sheet-bleed-head sheet-bleed-end sheet-bleed-end-head shell:min-h-0 shell:overflow-y-auto shell:overscroll-contain flex min-w-0 flex-col">
        <SectionRow id={id} title={title} count={count}>
          {chip}
        </SectionRow>
        <section
          aria-labelledby={id}
          className={cx(
            'mx-auto flex flex-1 flex-col',
            width === 'full'
              ? 'w-full p-6 max-sm:p-4'
              : cx(
                  'px-6 pt-6 pb-8 max-sm:px-4',
                  width === 'wide'
                    ? 'w-[min(100%,1120px)]'
                    : 'w-[min(100%,760px)]',
                ),
          )}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
