import { notFound } from 'next/navigation';

import { ProcessView } from '@/components/app-shell/process/process-view';
import { DirectOrdersRun } from '@/components/brunch-orders/direct-run';
import {
  brunchOrdersDirectProcess,
  SHEET_INPUTS,
} from '@/lib/processes/brunch-orders/process';

/*
  Brunch orders worked out by the model on every run, with no rulebook: a run
  reads the live sheet, the model proposes, a person reviews and confirms the
  write. Development only, like the rulebook one.
*/
export default async function BrunchOrdersDirectPage({
  searchParams,
}: PageProps<'/examples/brunch-orders-direct'>) {
  if (process.env.NODE_ENV !== 'development') notFound();
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
