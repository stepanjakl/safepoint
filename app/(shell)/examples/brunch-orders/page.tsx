import { notFound } from 'next/navigation';

import { ProcessView } from '@/components/app-shell/process/process-view';
import { OrdersRun } from '@/components/brunch-orders/orders-run';
import { RulebookProvider } from '@/components/brunch-orders/rulebook-panel';
import { RulebookPanel } from '@/components/brunch-orders/rulebook-view';
import {
  SourceInputs,
  SourceOutputs,
} from '@/components/app-shell/sources/source-panels';
import {
  BRUNCH_ORDERS_DEFINITIONS,
  brunchOrdersProcess,
  SHEET_INPUTS,
  SHEET_USE,
} from '@/lib/processes/brunch-orders/process';
import { lastWrite } from '@/lib/definitions/apply';
import { latestSummary } from '@/lib/sources/reads';

/*
  Brunch orders, built one step at a time (docs/processes/brunch-orders/PLAN.md).
  Development only. A run is started by hand and moves only when a person
  acts; it is kept in this browser, its read of the sheet on the server.
*/
export default async function BrunchOrdersPage({
  searchParams,
}: PageProps<'/examples/brunch-orders'>) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const run = (await searchParams).run;
  const written = await lastWrite(BRUNCH_ORDERS_DEFINITIONS);
  const sheets = {
    [SHEET_USE.source]: await latestSummary(SHEET_USE.source),
  };
  return (
    <RulebookProvider process={brunchOrdersProcess}>
      <ProcessView
        process={brunchOrdersProcess}
        initialRunId={typeof run === 'string' ? run : null}
        // Keyed: an element made here and drawn inside a client component is
        // checked as a list child there, and warns without one.
        liveThread={<OrdersRun key="live" process={brunchOrdersProcess} />}
        inputs={SHEET_INPUTS}
        inputsPanel={<SourceInputs uses={[SHEET_USE]} initial={sheets} />}
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
    </RulebookProvider>
  );
}
