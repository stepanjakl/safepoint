import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { PROCESS_TAB_KEY } from '@/lib/shell/navigation';
import type { ProcessSummary } from '@/lib/shell/model';
import type { SystemLink } from '@/lib/shell/system-links';
import { ProcessSheet, type ProcessPolicy } from './process-sheet';

/*
  The process page's server half: it loads nothing itself, but it is where the
  run's thread is built, so the thread stays server-rendered while the sheet
  around it -- the header menu, the tab it has chosen -- is client state. It
  reads the saved tab's cookie, so a reload draws the sheet on that tab.
*/
export async function ProcessView({
  process,
  inputs = [],
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
  // The run the page opens on, from ?run=; none opens on the empty page.
  initialRunId?: string | null;
  // A process's own policy panel in place of the instructions tab.
  policy?: ProcessPolicy;
  // A process run step by step on the page: its live run's thread.
  liveThread?: ReactNode;
  // A process's own rulebook, shown as a Rules tab.
  rulesPanel?: ReactNode;
  // The complete Inputs section, which may show a list and a detail side by side.
  inputsPanel?: ReactNode;
  // And its own Outputs tab, in place of the list of outputs.
  outputsPanel?: ReactNode;
  children: ReactNode;
}) {
  const savedTabs = (await cookies()).get(PROCESS_TAB_KEY)?.value ?? null;
  return (
    <ProcessSheet
      key={process.id}
      process={process}
      inputs={inputs}
      run={children}
      initialRunId={initialRunId}
      policy={policy}
      liveThread={liveThread}
      rulesPanel={rulesPanel}
      inputsPanel={inputsPanel}
      outputsPanel={outputsPanel}
      savedTabs={savedTabs}
    />
  );
}
