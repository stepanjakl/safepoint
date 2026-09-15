import type { ReactNode } from 'react';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import type { SystemLink } from '@/lib/process/system-links';
import { ProcessHeader } from './process-header';
import { ScheduleControl } from './schedule-control';

export function ProcessView({
  process,
  sources = [],
  children,
}: {
  process: ProcessSummary;
  sources?: SystemLink[];
  children: ReactNode;
}) {
  const currentVersion = process.instructions.version;

  return (
    <div className="shell:grid shell:h-full shell:grid-rows-[auto_minmax(0,1fr)]">
      <ProcessHeader process={process} sources={sources} />
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
          <ol className="runs:flex-col runs:gap-0.5 runs:overflow-visible flex flex-row gap-1.5 overflow-x-auto">
            {process.runs.map((run) => (
              <li key={run.id}>
                {/* Not a control: only the current run has a review to open. */}
                <div
                  className="aria-[current]:bg-surface-selected runs:min-w-0 text-dense rounded-control grid min-w-42 gap-0.5 px-2.5 py-2"
                  aria-current={run.current ? 'true' : undefined}
                >
                  <span className="text-primary">{run.label}</span>
                  <span className="text-muted text-meta">{run.summary}</span>
                  {run.instructionsVersion !== currentVersion ? (
                    // A run evaluated under older instructions is not
                    // comparable to this one.
                    <span className="text-state-caution text-meta">
                      Ran under {run.instructionsVersion}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
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
