import type { ReactNode } from 'react';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import type { SystemLink } from '@/lib/process/system-links';
import { InstructionsDrawer } from './instructions-drawer';
import { SystemCluster } from './system-cluster';

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
      <header className="border-rule-faint shadow-separator-bottom-strong flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div>
          <h2 className="text-[15px] [font-weight:550] tracking-[-0.01em]">
            {process.name}
          </h2>
          <p className="text-meta text-muted">{process.trigger}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SystemCluster label="Reads" links={sources} />
          <SystemCluster label="Writes" links={process.destinations} />
          <InstructionsDrawer instructions={process.instructions} />
        </div>
      </header>
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
          <p
            id="runs-heading"
            className="text-muted px-2.5 pb-1.5 text-[11px] tracking-[0.06em] uppercase"
          >
            Runs
          </p>
          <ol className="runs:flex-col runs:gap-0.5 runs:overflow-visible flex flex-row gap-1.5 overflow-x-auto">
            {process.runs.map((run) => (
              <li key={run.id}>
                {/* Not a control: only the current run has a review to open. */}
                <div
                  className="aria-[current]:bg-surface-selected runs:min-w-0 grid min-w-[168px] gap-0.5 rounded-[7px] px-2.5 py-2 text-[13px]"
                  aria-current={run.current ? 'true' : undefined}
                >
                  <span className="text-primary">{run.label}</span>
                  <span className="text-muted text-[12px]">{run.summary}</span>
                  {run.instructionsVersion !== currentVersion ? (
                    // A run evaluated under older instructions is not
                    // comparable to this one.
                    <span className="text-state-caution text-[12px]">
                      Ran under {run.instructionsVersion}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-muted runs:block mt-3 hidden px-2.5 text-[11px] leading-[1.5] opacity-80">
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
