import type { ReactNode } from 'react';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import type { SystemLink } from '@/lib/process/system-links';
import { ProcessHeader } from './process-header';
import { RunsList } from './runs-list';
import { ScheduleControl } from './schedule-control';

export function ProcessView({
  process,
  inputs = [],
  inputDetails,
  children,
}: {
  process: ProcessSummary;
  inputs?: SystemLink[];
  inputDetails?: Record<string, InputDetail>;
  children: ReactNode;
}) {
  return (
    <div className="shell:grid shell:h-full shell:grid-rows-[auto_minmax(0,1fr)]">
      <ProcessHeader
        process={process}
        inputs={inputs}
        inputDetails={inputDetails}
      />
      {/*
        Three columns where there is room, otherwise the runs become a strip
        above the thread. Between the two thresholds the strip takes what it
        needs and the thread takes the rest, so the thread scrolls rather than
        the document.
      */}
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
            Only the current run is recorded. Earlier runs are placeholder data.
          </p>
        </aside>
        <div className="shell:min-h-0 shell:min-w-0 shell:overflow-y-auto shell:overscroll-contain relative">
          {children}
        </div>
      </div>
    </div>
  );
}
