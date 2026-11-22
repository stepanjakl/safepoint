'use client';

import { motion } from 'motion/react';
import {
  Activity,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from '@/lib/ui/cx';
import { LAST_PROCESS_KEY } from '@/lib/shell/navigation';
import type { ProcessSummary } from '@/lib/shell/model';
import type { SystemLink } from '@/lib/shell/system-links';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { writePreferenceCookie } from '@/components/app-shell/stored-record';
import { ProcessHeader } from './process-header';
import { ProcessContentTransition } from './process-content-transition';
import { ProcessPanels } from './process-panels';
import type { AsideView } from '@/components/app-shell/drawer-aside';
import { useProcessTab, type ProcessTab } from './process-tab-store';
import { RunsList } from '@/components/app-shell/runs/runs-list';
import {
  RunSelectionProvider,
  useRunSelectionState,
} from '@/components/app-shell/runs/run-selection';
import { RunView } from '@/components/app-shell/runs/run-view';
import { StartRunButton } from '@/components/app-shell/runs/start-run-button';
import { SECTION } from './panel-parts';
import { ScheduleControl } from './schedule-control';
import { SectionRow } from '@/components/app-shell/runs/section-row';
import { useShellPageNavigation } from '@/components/app-shell/shell-page-transition';
import {
  ScreenArrival,
  SettledLayer,
  useScreenArriving,
  useScreenSettled,
} from '@/components/ui/screen-settled';
import { TAB_PACE, useSwap } from '@/components/ui/swap';
import { motionTime } from '@/lib/ui/motion-time';

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

export const ProcessInputNavigation = createContext<{
  initialInputId: string | null;
  returnToRun: () => void;
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
  run,
  initialRunId = null,
  policy,
  liveThread,
  rulesPanel,
  inputsPanel,
  outputsPanel,
  savedTabs = null,
}: {
  process: ProcessSummary;
  inputs?: SystemLink[];
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
  // The cookie's copy of the tab last open in each process, for the first paint.
  savedTabs?: string | null;
}) {
  // Arriving from another process is an entrance too, for the detail's beat.
  // In-app navigation falls back to Runs; reloads keep the tab last open.
  const { navigated } = useShellPageNavigation();
  const [stored, setTab, resetTab] = useProcessTab(process.id, savedTabs);
  const [landedOnRuns, setLandedOnRuns] = useState(navigated);
  useEffect(() => {
    if (landedOnRuns) resetTab();
  }, [landedOnRuns, resetTab]);
  // A Rules tab kept from a process that has one means nothing on another.
  const resolved =
    stored === 'rules' && rulesPanel === undefined ? 'runs' : stored;
  const tab = landedOnRuns ? 'runs' : resolved;
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
    setLandedOnRuns(false);
    setOpenView(view);
    setRequest((count) => count + 1);
    setTab(next);
  };
  const chooseTab = (next: ProcessTab) => {
    setChosen(true);
    setLandedOnRuns(false);
    setOpenView(null);
    setTab(next);
  };
  const showVersion = (version: string) =>
    ask({ kind: 'version', version, face: 'changes' }, 'instructions');
  // The selected tab answers at once; its previous body fades out and the
  // next fades in, at a tab's pace, frame and all.
  const { shown, incoming, layer, entering } = useSwap(
    tab,
    TAB_MOTION,
    chosen,
    TAB_PACE,
  );
  // The current version, which a publish in this browser can move on.
  const { current, versions } = useInstructions(
    process.id,
    process.instructions,
  );
  const { version } = current;
  const actions = {
    showInput: (id: string) => ask({ kind: 'input', id }, 'inputs'),
    showVersion,
    hasChanges: (version: string) =>
      versions.findIndex((entry) => entry.version === version) > 0,
    showInstructions: () => chooseTab('instructions'),
    showRules: rulesPanel === undefined ? undefined : () => chooseTab('rules'),
    currentVersion: version,
  };
  const scrollRuns = useVerticalScrollFade();
  const selection = useRunSelectionState({
    process,
    initialRunId,
    liveThread: liveThread !== undefined,
  });

  // The section a swap has landed, so what it holds can begin its own entrance.
  const [landed, setLanded] = useState<ProcessTab | null>(null);
  if (incoming && landed !== null) setLanded(null);
  /*
    Every tab shown so far stays rendered, hidden, so coming back to one shows
    it rather than building it again: a run's thread is thousands of elements.
    The one coming in is rendered ahead too, so the swap only has to show it.
  */
  const [visited, setVisited] = useState<ProcessTab[]>([shown]);
  if (!visited.includes(shown)) setVisited([...visited, shown]);
  const layers =
    incoming && !visited.includes(incoming) ? [...visited, incoming] : visited;

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
      <div className="shell:@max-sheet-wide/sheet:grid-rows-[auto_minmax(0,1fr)] shell:min-h-0 @sheet-wide/sheet:grid-cols-[var(--spacing-sheet-rail)_minmax(0,1fr)] rounded-b-shell-inner clip-past-pane-highlight process-runs grid grid-cols-[minmax(0,1fr)]">
        {/* Full-bleed: the list draws its own rules edge to edge, and
              padding on the column would leave them floating short of it. */}
        <aside
          ref={scrollRuns}
          aria-labelledby="runs-heading"
          className="process-runs-list sheet-bleed @sheet-wide/sheet:sheet-bleed-bottom @max-sheet-wide/sheet:sheet-bleed-end shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative"
        >
          <SectionRow id="runs-heading" title="Runs">
            <StartRunButton />
            <ScheduleControl
              processId={process.id}
              schedule={process.schedule}
            />
          </SectionRow>
          <RunsList
            process={process}
            onShowVersion={showVersion}
            onShowRules={actions.showRules}
          />
        </aside>
        <RunsDetail>
          <ProcessSheetActions value={actions}>
            <RunView process={process} recorded={run} liveThread={liveThread} />
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
      <ProcessInputNavigation
        key={request}
        value={{
          initialInputId: openView?.kind === 'input' ? openView.id : null,
          returnToRun: () => chooseTab('runs'),
        }}
      >
        {inputsPanel}
      </ProcessInputNavigation>
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
      />
    );

  return (
    <RunSelectionProvider value={selection}>
      <div className="shell:h-full grid grid-rows-[auto_minmax(0,1fr)]">
        <ProcessHeader
          process={process}
          version={policy?.version ?? version}
          instructionsLabel={policy?.label}
          hasRules={rulesPanel !== undefined}
          inputs={inputs}
          outputs={process.outputs}
          tab={tab}
          onTabChange={chooseTab}
        />
        {/* The frame the tab bodies trade places in, clipped to the pane's inner
            radius so a body or its scrollbar never crosses the corner's edge. */}
        <ProcessContentTransition
          className="process-sheet-frame shell:grid shell:min-h-0 shell:grid-rows-[minmax(0,1fr)] rounded-b-shell-inner shell:rounded-tr-shell-inner clip-past-pane-highlight grid-cols-[minmax(0,1fr)]"
          finishesLeaving
        >
          <ScreenArrival>
            {layers.map((key) => {
              const visible = key === shown;
              return (
                <Activity key={key} mode={visible ? 'visible' : 'hidden'}>
                  <motion.div
                    {...(visible
                      ? layer
                      : {
                          initial: { opacity: 0 },
                          animate: { opacity: 0 },
                          transition: { duration: 0 },
                        })}
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
                      <Forming>{section(key)}</Forming>
                    </SettledLayer>
                  </motion.div>
                </Activity>
              );
            })}
          </ScreenArrival>
        </ProcessContentTransition>
      </div>
    </RunSelectionProvider>
  );
}

// One column, the width of a run's thread. Its version is on the header's tab.
function PolicyPanel({ policy }: { policy: ProcessPolicy }) {
  return (
    <SinglePanel id="policy-heading" title={policy.label}>
      {policy.content}
    </SinglePanel>
  );
}

// A panel a process brings of its own, in one column.
/*
  Marks a section as forming while its rows rise into place (process-sheet.css),
  and lets go once the last of them has, so a row that arrives later -- a run
  just started -- does not rise in on its own. Only a section arriving with its
  screen forms (ScreenArrival); one reached by a tab is shown as it is.

  Rows the first fetch brings soon after still rise. Past FORM_WINDOW_MS with
  nothing rising, the section has formed: on a reload its rows can finish
  before hydration, so their end is never heard.
*/
const FORM_WINDOW_MS = 1000;

function Forming({ children }: { children: ReactNode }) {
  const arriving = useScreenArriving();
  const [formed, setFormed] = useState(!arriving);
  const settled = useScreenSettled();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (formed || !settled) return;
    const timer = window.setTimeout(() => {
      if (root.current && !rising(root.current)) setFormed(true);
    }, motionTime(FORM_WINDOW_MS));
    return () => window.clearTimeout(timer);
  }, [formed, settled]);
  return (
    <div
      ref={root}
      className="contents"
      data-section-forming={formed ? undefined : true}
      data-entrance-held={!settled || undefined}
      onAnimationEnd={(event) => {
        if (event.animationName !== 'section-form-in') return;
        if (!rising(event.currentTarget)) setFormed(true);
      }}
    >
      {children}
    </div>
  );
}

function rising(element: Element) {
  return element
    .getAnimations({ subtree: true })
    .some(
      (animation) =>
        animation instanceof CSSAnimation &&
        animation.animationName === 'section-form-in' &&
        animation.playState === 'running',
    );
}

// The run beside the rail: it comes in with its section, not after it.
function RunsDetail({ children }: { children: ReactNode }) {
  return (
    <div className="process-runs-detail shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative">
      {children}
    </div>
  );
}

export function SinglePanel({
  id,
  title,
  width = 'reading',
  children,
}: {
  id: string;
  title: string;
  // A measure for reading, or room for a grid of cards.
  width?: 'reading' | 'wide' | 'full';
  children: ReactNode;
}) {
  return (
    <div className="process-panels grid h-full min-h-0 grid-cols-[minmax(0,1fr)]">
      {/* A column, so the section takes the height below the header and an
          empty state can centre in it. */}
      <div className="process-panel-list sheet-bleed sheet-bleed-head sheet-bleed-end sheet-bleed-end-head shell:min-h-0 shell:overflow-y-auto shell:overscroll-contain flex min-w-0 flex-col">
        <SectionRow id={id} title={title} />
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

function useVerticalScrollFade<T extends HTMLElement>() {
  return useCallback((element: T | null) => {
    if (!element) return;
    const supportsTimeline = CSS.supports('animation-timeline', 'scroll()');
    const update = () => {
      const room = element.scrollHeight - element.clientHeight;
      const scrollable = room > 0.5;
      toggleDataAttribute(element, 'data-runs-scrollable', scrollable);
      if (scrollable) {
        const head = element.querySelector('.sheet-head');
        const headHeight = head instanceof HTMLElement ? head.offsetHeight : 0;
        element.style.setProperty(
          '--runs-view-height',
          `${Math.max(0, element.clientHeight - headHeight)}px`,
        );
        if (!supportsTimeline) {
          element.style.setProperty(
            '--runs-scroll-y',
            `${(element.scrollTop / room) * 100}%`,
          );
        }
      } else {
        element.style.removeProperty('--runs-view-height');
        element.style.removeProperty('--runs-scroll-y');
      }
      toggleDataAttribute(
        element,
        'data-fade-top',
        scrollable && element.scrollTop > 0.5,
      );
      toggleDataAttribute(
        element,
        'data-fade-bottom',
        scrollable && element.scrollTop < room - 0.5,
      );
    };

    const resize = new ResizeObserver(update);
    const watch = () => {
      resize.disconnect();
      resize.observe(element);
      for (const child of element.children) resize.observe(child);
    };
    const children = new MutationObserver(() => {
      watch();
      update();
    });
    children.observe(element, { childList: true });
    watch();
    update();

    element.addEventListener('scroll', update, { passive: true });
    return () => {
      resize.disconnect();
      children.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, []);
}

function toggleDataAttribute(element: HTMLElement, name: string, on: boolean) {
  if (on) element.setAttribute(name, '');
  else element.removeAttribute(name);
}
