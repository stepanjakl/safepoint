import { SinglePanel } from '@/components/app-shell/process/process-sheet';
import { SECTION } from '@/components/app-shell/process/panel-parts';
import { ProcessView } from '@/components/app-shell/process/process-view';
import {
  OrdersRun,
  OrdersRunPrefetch,
} from '@/components/processes/brunch-orders/orders-run';
import { RulebookProvider } from '@/components/engine/rulebook-panel';
import { RulebookPanel } from '@/components/engine/rulebook-view';
import {
  SourceInputs,
  SourceOutputs,
} from '@/components/app-shell/sources/source-panels';
import {
  BRUNCH_ORDERS_DEFINITIONS,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import {
  SHEET_INPUTS,
  SHEET_USE,
  SUBJECT,
} from '@/lib/processes/brunch-orders/data';
import { lastWrite } from '@/server/storage/writes/applications';
import { latestSummary } from '@/server/storage/reads/source-reads';

/*
  Brunch orders, built one step at a time (docs/processes/brunch-orders/PLAN.md).
  A run is started by hand and moves only when a person
  acts; it is kept in this browser, its read of the sheet on the server.
*/
export default async function BrunchOrdersPage({
  searchParams,
}: PageProps<'/processes/brunch-orders'>) {
  const run = (await searchParams).run;
  const written = await lastWrite(BRUNCH_ORDERS_DEFINITIONS);
  const sheets = {
    [SHEET_USE.source]: await latestSummary(SHEET_USE.source),
  };
  return (
    <RulebookProvider process={brunchOrdersProcess} subject={SUBJECT}>
      <OrdersRunPrefetch>
        <ProcessView
          process={brunchOrdersProcess}
          initialRunId={typeof run === 'string' ? run : null}
          // Keyed: an element made here and drawn inside a client component is
          // checked as a list child there, and warns without one.
          liveThread={<OrdersRun key="live" process={brunchOrdersProcess} />}
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
          rulesPanel={<RulebookPanel />}
        >
          {null}
        </ProcessView>
      </OrdersRunPrefetch>
    </RulebookProvider>
  );
}
