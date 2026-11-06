import { notFound } from 'next/navigation';

import { ProcessView } from '@/components/app-shell/process/process-view';
import {
  brunchOrdersDirectProcess,
  SHEET_INPUTS,
} from '@/lib/processes/brunch-orders/process';

/*
  Brunch orders worked out by the model on every run, with no rulebook. Only
  its place in the sidebar so far; its run's steps come next. Development only,
  like the rulebook one.
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
      inputs={SHEET_INPUTS}
    >
      {null}
    </ProcessView>
  );
}
