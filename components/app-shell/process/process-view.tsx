import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { PROCESS_TAB_KEY } from '@/lib/process/navigation';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/model';
import type { SystemLink } from '@/lib/process/system-links';
import type { PlayableRun } from '@/components/app-shell/runs/run-view';
import { ProcessSheet, type ProcessPolicy } from './process-sheet';

/*
  The process page's server half: it loads nothing itself, but it is where the
  run's thread is built, so the thread stays server-rendered while the sheet
  around it -- the header menu, the tab it has chosen -- is client state. It
  reads the saved tab's cookie, so the sheet is first drawn on that tab.
*/
export async function ProcessView({
  process,
  inputs = [],
  inputDetails,
  initialRunId = null,
  playable,
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
  // What a started run is drawn from, where the process can play one.
  playable?: PlayableRun;
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
  const savedTabs = (await cookies()).get(PROCESS_TAB_KEY)?.value ?? null;
  return (
    <ProcessSheet
      process={process}
      inputs={inputs}
      inputDetails={inputDetails}
      run={children}
      initialRunId={initialRunId}
      playable={playable}
      policy={policy}
      liveThread={liveThread}
      rulesPanel={rulesPanel}
      inputsPanel={inputsPanel}
      outputsPanel={outputsPanel}
      savedTabs={savedTabs}
    />
  );
}
