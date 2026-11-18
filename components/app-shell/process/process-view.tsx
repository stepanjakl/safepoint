import type { ReactNode } from 'react';
import type { InputDetail } from '@/lib/shell/input-details';
import type { ProcessSummary } from '@/lib/shell/model';
import type { SystemLink } from '@/lib/shell/system-links';
import { ProcessSheet, type ProcessPolicy } from './process-sheet';

/*
  The process page's server half: it loads nothing itself, but it is where the
  run's thread is built, so the thread stays server-rendered while the sheet
  around it -- the header menu, the tab it has chosen -- is client state.
*/
export function ProcessView({
  process,
  inputs = [],
  inputDetails,
  initialRunId = null,
  policy,
  liveThread,
  rulesPanel,
  inputsPanel,
  outputsPanel,
  children,
}: {
  process: ProcessSummary;
  inputs?: SystemLink[];
  inputDetails?: Record<string, InputDetail>;
  // The run the page opens on, from ?run=; none opens on the empty page.
  initialRunId?: string | null;
  // A process's own policy panel in place of the instructions tab.
  policy?: ProcessPolicy;
  // A process run step by step on the page: its live run's thread.
  liveThread?: ReactNode;
  // A process's own rulebook, shown as a Rules tab.
  rulesPanel?: ReactNode;
  // A process's own Inputs tab, in place of the evidence files' list.
  inputsPanel?: ReactNode;
  // And its own Outputs tab, in place of the list of outputs.
  outputsPanel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ProcessSheet
      key={process.id}
      process={process}
      inputs={inputs}
      inputDetails={inputDetails}
      run={children}
      initialRunId={initialRunId}
      policy={policy}
      liveThread={liveThread}
      rulesPanel={rulesPanel}
      inputsPanel={inputsPanel}
      outputsPanel={outputsPanel}
    />
  );
}
