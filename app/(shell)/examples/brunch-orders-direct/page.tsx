import { ProcessView } from '@/components/app-shell/process/process-view';
import { DirectOrdersRun } from '@/components/engine/direct-run';
import {
  brunchOrdersDirectProcess,
  SHEET_INPUTS,
} from '@/lib/processes/brunch-orders/process';

/*
  Brunch orders worked out by the model on every run, with no rulebook: a run
  reads the live sheet, the model proposes, a person reviews and confirms the
  write.
*/
export default async function BrunchOrdersDirectPage({
  searchParams,
}: PageProps<'/examples/brunch-orders-direct'>) {
  const run = (await searchParams).run;
  return (
    <ProcessView
      process={brunchOrdersDirectProcess}
      initialRunId={typeof run === 'string' ? run : null}
      // Keyed, as on the rulebook page: drawn as a list child there.
      liveThread={
        <DirectOrdersRun key="live" process={brunchOrdersDirectProcess} />
      }
      inputs={SHEET_INPUTS}
    >
      {null}
    </ProcessView>
  );
}
