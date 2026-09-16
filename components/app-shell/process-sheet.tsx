'use client';

import type { ReactNode } from 'react';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import type { SystemLink } from '@/lib/process/system-links';
import { useInstructions } from './instructions-store';
import { useRemovedInputs } from './inputs-store';
import { ProcessHeader } from './process-header';
import { ProcessPanels } from './process-panels';
import { useProcessTab } from './process-tab-store';
import { RunsList } from './runs-list';
import { ScheduleControl } from './schedule-control';

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
    <div className="shell:grid shell:h-full shell:grid-rows-[auto_minmax(0,1fr)]">
      <ProcessHeader
        process={process}
        version={version}
        inputs={kept}
        outputs={process.outputs}
        tab={tab}
        onTabChange={setTab}
      />
      {tab === 'runs' ? (
        /*
          Three columns where there is room, otherwise the runs become a strip
          above the thread. Between the two thresholds the strip takes what it
          needs and the thread takes the rest, so the thread scrolls rather than
          the document.
        */
        <div className="shell:max-runs:grid-rows-[auto_minmax(0,1fr)] shell:min-h-0 runs:grid-cols-[232px_minmax(0,1fr)] grid grid-cols-[minmax(0,1fr)]">
          <aside
            aria-labelledby="runs-heading"
            className="border-rule-faint shadow-separator-right-strong runs:border-b-0 runs:border-r runs:px-3 runs:py-4 shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative border-b p-3"
          >
            <div className="flex items-center justify-between gap-2 pr-1 pb-1.5 pl-2.5">
              <p id="runs-heading" className="readout text-muted">
                Runs
              </p>
              <ScheduleControl
                processId={process.id}
                schedule={process.schedule}
              />
            </div>
            <RunsList process={process} />
            <p className="text-muted runs:block text-micro mt-3 hidden px-2.5 leading-normal opacity-80">
              Only the current run is recorded. Earlier runs are placeholder
              data.
            </p>
          </aside>
          <div className="shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative">
            {run}
          </div>
        </div>
      ) : (
        <ProcessPanels
          // Keyed by tab: a new tab is a new panel, so the detail it had open
          // goes with the list it belonged to and nothing has to reset it.
          key={tab}
          process={process}
          tab={tab}
          inputs={kept}
          availableInputs={available}
          inputDetails={inputDetails}
          onRemoveInput={editable ? remove : undefined}
          onAddInput={editable ? restore : undefined}
          onLeave={() => setTab('runs')}
        />
      )}
    </div>
  );
}
