import { SinglePanel } from '@/components/app-shell/process/process-sheet';
import { SECTION } from '@/components/app-shell/process/panel-parts';
import { ProcessView } from '@/components/app-shell/process/process-view';
import { DirectOrdersRun } from '@/components/processes/brunch-orders/direct-run';
import {
  SourceInputs,
  SourceOutputs,
} from '@/components/app-shell/sources/source-panels';
import {
  BRUNCH_ORDERS_DEFINITIONS,
  brunchOrdersDirectProcess,
} from '@/lib/processes/brunch-orders/process';
import { SHEET_INPUTS, SHEET_USE } from '@/lib/processes/brunch-orders/data';
import { lastWrite } from '@/server/storage/writes/applications';
import { latestSummary } from '@/server/storage/reads/source-reads';

/*
  Brunch orders worked out by the model on every run, with no rulebook: a run
  reads the live sheet, the model proposes, a person reviews and confirms the
  write.
*/
export default async function BrunchOrdersDirectPage({
  searchParams,
}: PageProps<'/processes/brunch-orders-direct'>) {
  const run = (await searchParams).run;
  const written = await lastWrite(BRUNCH_ORDERS_DEFINITIONS);
  const sheets = {
    [SHEET_USE.source]: await latestSummary(SHEET_USE.source),
  };
  return (
    <ProcessView
      process={brunchOrdersDirectProcess}
      initialRunId={typeof run === 'string' ? run : null}
      // Keyed, as on the rulebook page: drawn as a list child there.
      liveThread={
        <DirectOrdersRun key="live" process={brunchOrdersDirectProcess} />
      }
      inputs={SHEET_INPUTS}
      inputsPanel={
        <SinglePanel {...SECTION.inputs} width="full">
          <SourceInputs uses={[SHEET_USE]} initial={sheets} />
        </SinglePanel>
      }
      outputsPanel={
        <SourceOutputs
          uses={[SHEET_USE]}
          initial={sheets}
          lastWrite={written}
        />
      }
    >
      {null}
    </ProcessView>
  );
}
