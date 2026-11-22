'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import { useTRPC } from '@/components/trpc/provider';
import type { ProcessRun, RunStatus, RunTrigger } from '@/lib/shell/model';
import type { AppRouter } from '@/server/api/root';

/*
  A process's runs as the server keeps them (`runs.*`), and what a screen does
  with them. The list is one query per process; every mutation answers the run
  as it now stands and writes it into the list, so the screen changes once and
  nothing refetches. A run is not read on its own: the list holds every field
  a thread needs but the text of its instructions, which the instruction
  versions give by hash.
*/
export type KeptRun = inferRouterOutputs<AppRouter>['runs']['list'][number];
export type RunProcessId =
  inferRouterInputs<AppRouter>['runs']['list']['process'];
type Progress = Omit<
  inferRouterInputs<AppRouter>['runs']['record'],
  'process' | 'runId'
>;

// What the rail shows of a kept run. A tally is not kept: a live row counts
// nothing yet, as before.
export const processRunOf = (run: KeptRun): ProcessRun => ({
  id: run.id,
  startedAt: run.startedAt,
  status: run.status as RunStatus,
  trigger: run.trigger as RunTrigger,
  counts: { items: 0 },
  instructionsVersion: run.instructions.version,
  ...(run.activity ? { activity: run.activity } : {}),
});

export function useKeptRuns(processId: string, enabled: boolean) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listing = trpc.runs.list.queryOptions(
    { process: processId as RunProcessId },
    { enabled },
  );
  const runs = useQuery(listing);
  // A list not loaded yet cannot be added to without hiding what is in it:
  // it is asked for again instead.
  const change = (apply: (list: KeptRun[]) => KeptRun[]) =>
    queryClient.setQueryData(listing.queryKey, (list) =>
      list ? apply(list) : list,
    );
  const settle = (run: KeptRun) => {
    if (!queryClient.getQueryData(listing.queryKey))
      void queryClient.invalidateQueries({ queryKey: listing.queryKey });
    return run;
  };
  const start = useMutation(
    trpc.runs.start.mutationOptions({
      onSuccess: (run) => {
        change((list) => [run, ...list.filter((one) => one.id !== run.id)]);
        settle(run);
      },
    }),
  );
  // Serial: a read and then a pin, each answered before the next is sent.
  const record = useMutation(
    trpc.runs.record.mutationOptions({
      scope: { id: `runs-record:${processId}` },
      // What the run was doing stays until the list is asked again: the
      // answer to a record does not say.
      onSuccess: (run) =>
        change((list) =>
          list.map((one) =>
            one.id === run.id ? { ...run, activity: one.activity } : one,
          ),
        ),
    }),
  );
  const discard = useMutation(
    trpc.runs.discard.mutationOptions({
      onSuccess: (run) =>
        change((list) => list.filter((one) => one.id !== run.id)),
    }),
  );
  return {
    runs,
    start,
    discard,
    record: (runId: string, progress: Progress) =>
      record.mutateAsync({
        process: processId as RunProcessId,
        runId,
        ...progress,
      }),
    recordError: record.error?.message ?? null,
    resetRecord: record.reset,
  };
}
