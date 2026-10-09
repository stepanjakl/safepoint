import { notFound } from 'next/navigation';

import { ProcessView } from '@/components/app-shell/process/process-view';
import { OrdersRun } from '@/components/brunch-orders/orders-run';
import { brunchOrdersProcess } from '@/lib/processes/brunch-orders/process';

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
  return (
    <ProcessView
      process={brunchOrdersProcess}
      initialRunId={typeof run === 'string' ? run : null}
      // Keyed: an element made here and drawn inside a client component is
      // checked as a list child there, and warns without one.
      liveThread={<OrdersRun key="live" process={brunchOrdersProcess} />}
    >
      {null}
    </ProcessView>
  );
}
