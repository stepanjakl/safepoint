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
    <div className="process">
      <header className="process-header">
        <div className="process-identity">
          <h2 className="process-name">{process.name}</h2>
          <p className="text-meta text-muted">{process.trigger}</p>
        </div>
        <div className="process-controls">
          <SystemCluster label="Reads" links={sources} />
          <SystemCluster label="Writes" links={process.destinations} />
          <InstructionsDrawer instructions={process.instructions} />
        </div>
      </header>
      <div className="process-body">
        <aside className="process-runs" aria-labelledby="runs-heading">
          <p id="runs-heading" className="app-nav-label">
            Runs
          </p>
          <ol className="run-list">
            {process.runs.map((run) => (
              <li key={run.id}>
                {/* Not a control: only the current run has a review to open. */}
                <div
                  className="run-item"
                  aria-current={run.current ? 'true' : undefined}
                >
                  <span className="run-label">{run.label}</span>
                  <span className="run-summary">{run.summary}</span>
                  {run.instructionsVersion !== currentVersion ? (
                    <span className="run-drift">
                      Ran under {run.instructionsVersion}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="run-note">
            Only the current run is recorded. Earlier runs are placeholder data.
          </p>
        </aside>
        <div className="process-thread">{children}</div>
      </div>
    </div>
  );
}
