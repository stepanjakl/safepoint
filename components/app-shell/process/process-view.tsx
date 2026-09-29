import type { ReactNode } from 'react';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/model';
import type { SystemLink } from '@/lib/process/system-links';
import type { PlayableRun } from '@/components/app-shell/runs/run-view';
import { ProcessSheet } from './process-sheet';

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
  playable,
  children,
}: {
  process: ProcessSummary;
  inputs?: SystemLink[];
  inputDetails?: Record<string, InputDetail>;
  // The run the page opens on, from ?run=; none opens on the empty page.
  initialRunId?: string | null;
  // What a started run is drawn from, where the process can play one.
  playable?: PlayableRun;
  children: ReactNode;
}) {
  return (
    <ProcessSheet
      process={process}
      inputs={inputs}
      inputDetails={inputDetails}
      run={children}
      initialRunId={initialRunId}
      playable={playable}
    />
  );
}
