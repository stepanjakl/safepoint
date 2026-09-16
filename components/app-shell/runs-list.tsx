'use client';

import type { ProcessSummary } from '@/lib/process/placeholder-process';
import { useInstructions } from './instructions-store';

/*
  The process's runs, each marked when it ran under instructions older than
  the current ones. A client component because the current version can be
  published in this browser, and a run that was comparable a moment ago stops
  being comparable the moment a new version is.
*/
export function RunsList({ process }: { process: ProcessSummary }) {
  const { current } = useInstructions(process.id, process.instructions);
  return (
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
            {run.instructionsVersion !== current.version ? (
              // A run evaluated under other instructions is not comparable
              // to one under the current set.
              <span className="text-state-caution text-meta">
                Ran under {run.instructionsVersion}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
