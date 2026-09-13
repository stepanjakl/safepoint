import type { ReactNode } from 'react';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import type { SystemLink } from '@/lib/process/system-links';
import { Notch } from '@/components/ui/notch';
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
      {/*
        Two cells on one row: the heading and its systems, then the notch the
        instructions sit in. The row takes the taller of the two, and both draw
        their bottom edge on the same line, so the notch's floor is the header's
        rule however the heading wraps.
      */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto]">
        <div className="border-rule-faint shadow-separator-bottom-strong flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <h2 className="text-title [font-weight:550]">{process.name}</h2>
            <p className="text-meta text-muted">{process.trigger}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SystemCluster label="Reads" links={sources} />
            <SystemCluster label="Writes" links={process.destinations} />
          </div>
        </div>
        <Notch className="-mt-control-edge -mr-control-edge">
          <InstructionsDrawer instructions={process.instructions} />
        </Notch>
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
          <p id="runs-heading" className="readout text-muted px-2.5 pb-1.5">
            Runs
          </p>
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
