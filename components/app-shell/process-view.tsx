import type { ReactNode } from 'react';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import { InstructionsDialog } from './instructions-dialog';

export function ProcessView({
  process,
  children,
}: {
  process: ProcessSummary;
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
          {/* Inert: these name the systems the process would reach, and none of
              them is a control until there is something to connect. */}
          <ul className="process-connections" aria-label="Connections">
            {process.connections.map((connection) => (
              <li key={connection}>{connection}</li>
            ))}
          </ul>
          <InstructionsDialog instructions={process.instructions} />
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
