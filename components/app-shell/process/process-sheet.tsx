'use client';

import { styleDebug } from '@/lib/style-debug';
import { createContext, useState, type ReactNode } from 'react';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/model';
import type { SystemLink } from '@/lib/process/system-links';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { useRemovedInputs } from '@/components/app-shell/inputs/inputs-store';
import { ProcessHeader } from './process-header';
import { ProcessPanels } from './process-panels';
import { viewKey, type AsideView } from '@/components/app-shell/drawer-aside';
import { useProcessTab, type ProcessTab } from './process-tab-store';
import { RunsList } from '@/components/app-shell/runs/runs-list';
import { ScheduleControl } from './schedule-control';
import { SectionRow } from '@/components/app-shell/runs/section-row';

/*
  What the run's thread can ask of the sheet around it. Absent where the thread
  is drawn without one -- the workbench -- so a caller offers the action only
  when there is a sheet to take it.
*/
export const ProcessSheetActions = createContext<{
  showInput: (id: string) => void;
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
}: {
  process: ProcessSummary;
  inputs?: SystemLink[];
  inputDetails?: Record<string, InputDetail>;
  // The run's thread, built on the server.
  run: ReactNode;
}) {
  const [tab, setTab] = useProcessTab(process.id);
  /*
    A detail the sheet has been asked to open: a version's change log from a
    boundary in the runs rail, or an input from a flag in the run's thread. It
    is a request rather than a place: the panels own which detail is open, so
    this only says which one to mount with, and it is cleared the moment the
    reader chooses a tab themselves.
  */
  const [openView, setOpenView] = useState<AsideView | null>(null);
  const chooseTab = (next: ProcessTab) => {
    setOpenView(null);
    setTab(next);
  };
  const showVersion = (version: string) => {
    setOpenView({ kind: 'changes', version });
    setTab('instructions');
  };
  const actions = {
    showInput: (id: string) => {
      setOpenView({ kind: 'input', id });
      setTab('inputs');
    },
  };
  // Inputs can be changed, as a preview, only where they have details to
  // show: the promotion scenario's files. Everything downstream reads the kept
  // set, so a removed input leaves the count and the list together.
  const { removed, remove, restore } = useRemovedInputs(process.id);
  // The current version, which a publish in this browser can move on.
  const { version } = useInstructions(process.id, process.instructions).current;
  const kept = inputs.filter((input) => !removed.has(input.id));
  const available = inputs.filter((input) => removed.has(input.id));
  const editable = inputDetails !== undefined;

  return (
    <div
      {...styleDebug({ component: 'ProcessSheet' })}
      className="shell:grid shell:h-full shell:grid-rows-[auto_minmax(0,1fr)]"
    >
      <ProcessHeader
        process={process}
        version={version}
        inputs={kept}
        outputs={process.outputs}
        tab={tab}
        onTabChange={chooseTab}
      />
      {tab === 'runs' ? (
        /*
          Three columns where there is room, otherwise the runs become a strip
          above the thread. Between the two thresholds the strip takes what it
          needs and the thread takes the rest, so the thread scrolls rather than
          the document.
        */
        // Clipped to the pane's inner radius. The lists inside are full-bleed
        // and carry fills of their own, and at the pane's own radius they
        // paint over the edge its face draws in the bottom corners.
        <div className="shell:@max-sheet-wide/sheet:grid-rows-[auto_minmax(0,1fr)] shell:min-h-0 @sheet-wide/sheet:grid-cols-[232px_minmax(0,1fr)] rounded-b-shell-inner grid grid-cols-[minmax(0,1fr)] overflow-clip">
          {/* Full-bleed: the list draws its own rules edge to edge, and
              padding on the column would leave them floating short of it. */}
          <aside
            aria-labelledby="runs-heading"
            {...styleDebug({ component: 'ProcessSheet', part: 'runs-sidebar' })}
            className="border-rule-faint shadow-separator-right-strong @sheet-wide/sheet:border-b-0 @sheet-wide/sheet:border-r shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative border-b"
          >
            <SectionRow id="runs-heading" title="Runs">
              <ScheduleControl
                processId={process.id}
                schedule={process.schedule}
              />
            </SectionRow>
            <RunsList process={process} onShowVersion={showVersion} />
          </aside>
          <div className="shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative">
            <ProcessSheetActions value={actions}>{run}</ProcessSheetActions>
          </div>
        </div>
      ) : (
        <ProcessPanels
          // Keyed by tab, and by the version the rail asked for: a new tab is
          // a new panel, so the detail it had open goes with the list it
          // belonged to and nothing has to reset it -- and a second request
          // for a different version remounts rather than being ignored.
          key={`${tab}:${openView ? viewKey(openView) : ''}`}
          process={process}
          tab={tab}
          openView={openView}
          inputs={kept}
          availableInputs={available}
          inputDetails={inputDetails}
          onRemoveInput={editable ? remove : undefined}
          onAddInput={editable ? restore : undefined}
          onLeave={() => chooseTab('runs')}
        />
      )}
    </div>
  );
}
