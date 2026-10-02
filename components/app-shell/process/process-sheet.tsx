'use client';

import { motion } from 'motion/react';
import { createContext, useEffect, useState, type ReactNode } from 'react';
import { LAST_PROCESS_KEY } from '@/lib/process/navigation';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/model';
import type { SystemLink } from '@/lib/process/system-links';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { useRemovedInputs } from '@/components/app-shell/inputs/inputs-store';
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
import {
  RunView,
  type PlayableRun,
} from '@/components/app-shell/runs/run-view';
import { StartRunButton } from '@/components/app-shell/runs/start-run-button';
import { ScheduleControl } from './schedule-control';
import { SectionRow } from '@/components/app-shell/runs/section-row';
import { useSwap } from '@/components/ui/swap';

const TAB_MOTION = (): 'fade' => 'fade';

/*
  What the run's thread can ask of the sheet around it. Absent where the thread
  is drawn without one -- the workbench -- so a caller offers the action only
  when there is a sheet to take it.
*/
export const ProcessSheetActions = createContext<{
  showInput: (id: string) => void;
  showVersion: (version: string) => void;
  showInstructions: () => void;
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
}: {
  process: ProcessSummary;
  inputs?: SystemLink[];
  inputDetails?: Record<string, InputDetail>;
  // The current run's thread, built on the server.
  run: ReactNode;
  // The run to open on, from the address; none opens on the empty page.
  initialRunId?: string | null;
  // What a started run is drawn from, where this process can play one.
  playable?: PlayableRun;
}) {
  const [tab, setTab] = useProcessTab(process.id);
  // The root opens the process last open (app/(shell)/page.tsx).
  useEffect(() => {
    document.cookie = `${LAST_PROCESS_KEY}=${encodeURIComponent(process.id)}; path=/; max-age=31536000; samesite=lax`;
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
  // Set once the reader chooses a tab: the stored one, applied on hydration,
  // is put in place without a swap.
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
    ask({ kind: 'changes', version }, 'instructions');
  // The selected tab answers at once; its previous body fades before the new
  // section arrives, without moving the dividers inside either layout.
  const { shown, layer, entering } = useSwap(tab, TAB_MOTION, chosen);
  // Inputs can be changed, as a preview, only where they have details to
  // show: the promotion scenario's files. Everything downstream reads the kept
  // set, so a removed input leaves the count and the list together.
  const { removed, remove, restore } = useRemovedInputs(process.id);
  // The current version, which a publish in this browser can move on.
  const { version } = useInstructions(process.id, process.instructions).current;
  const kept = inputs.filter((input) => !removed.has(input.id));
  const available = inputs.filter((input) => removed.has(input.id));
  const editable = inputDetails !== undefined;
  const actions = {
    showInput: (id: string) => ask({ kind: 'input', id }, 'inputs'),
    showVersion,
    showInstructions: () => chooseTab('instructions'),
    currentVersion: version,
  };
  const selection = useRunSelectionState({
    process,
    initialRunId,
    canPlay: playable !== undefined,
    version,
  });

  return (
    <RunSelectionProvider value={selection}>
      <div className="shell:grid shell:h-full shell:grid-rows-[auto_minmax(0,1fr)]">
        <ProcessHeader
          process={process}
          version={version}
          inputs={kept}
          outputs={process.outputs}
          tab={tab}
          onTabChange={chooseTab}
        />
        {/* The frame the tab bodies trade places in, clipped to the pane's inner
            radius so a body or its scrollbar never crosses the corner's edge. */}
        <ProcessContentTransition
          className="shell:grid shell:min-h-0 shell:grid-rows-[minmax(0,1fr)] rounded-b-shell-inner rounded-tr-shell-inner clip-past-pane-highlight grid-cols-[minmax(0,1fr)] overflow-clip"
          finishesLeaving
        >
          <motion.div
            key={shown}
            {...layer}
            className="process-sheet-swap shell:grid shell:min-h-0 shell:grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)]"
            data-swap-entering={entering || undefined}
          >
            {shown === 'runs' ? (
              /*
          Three columns where there is room, otherwise the runs become a strip
          above the thread. Between the two thresholds the strip takes what it
          needs and the thread takes the rest, so the thread scrolls rather than
          the document.
        */
              // Clipped to the pane's inner radius. The lists inside are full-bleed
              // and carry fills of their own, and at the pane's own radius they
              // paint over the edge its face draws in the bottom corners.
              <div className="shell:@max-sheet-wide/sheet:grid-rows-[auto_minmax(0,1fr)] shell:min-h-0 @sheet-wide/sheet:grid-cols-[232px_minmax(0,1fr)] rounded-b-shell-inner clip-past-pane-highlight grid grid-cols-[minmax(0,1fr)] overflow-clip">
                {/* Full-bleed: the list draws its own rules edge to edge, and
              padding on the column would leave them floating short of it. */}
                <aside
                  aria-labelledby="runs-heading"
                  className="process-runs-list sheet-bleed border-raised-ring shadow-separator-right-strong @sheet-wide/sheet:border-b-0 @sheet-wide/sheet:border-r shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative border-b"
                >
                  <SectionRow id="runs-heading" title="Runs">
                    <span className="flex items-center gap-0.5">
                      <StartRunButton />
                      <ScheduleControl
                        processId={process.id}
                        schedule={process.schedule}
                      />
                    </span>
                  </SectionRow>
                  <RunsList process={process} onShowVersion={showVersion} />
                </aside>
                <div className="process-runs-detail shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative">
                  <ProcessSheetActions value={actions}>
                    <RunView
                      process={process}
                      recorded={run}
                      playable={playable}
                    />
                  </ProcessSheetActions>
                </div>
              </div>
            ) : (
              <ProcessPanels
                // Keyed by request: the layer around it is keyed by tab, so the
                // detail it had open goes with its list, and a second request for
                // a different version remounts rather than being ignored. Not by
                // the view itself, which is cleared while the old tab fades out.
                key={request}
                process={process}
                tab={shown}
                openView={openView}
                inputs={kept}
                availableInputs={available}
                inputDetails={inputDetails}
                onRemoveInput={editable ? remove : undefined}
                onAddInput={editable ? restore : undefined}
                onLeave={() => chooseTab('runs')}
              />
            )}
          </motion.div>
        </ProcessContentTransition>
      </div>
    </RunSelectionProvider>
  );
}
