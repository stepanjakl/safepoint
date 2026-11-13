'use client';

import {
  useMutation,
  useMutationState,
  useQueries,
  useQueryClient,
} from '@tanstack/react-query';

import { useTRPC } from '@/components/trpc/provider';
import type { SourceSummary, SourceValues } from '@/lib/sources/model';

/*
  A source's latest read, shared by every panel that shows it, so reading it
  from Inputs is what Outputs shows too: both read one query per source, and
  a read that lands is written into it. The summary changes only by such a
  read, so it is never refetched; nor is a read's values, which never change.
*/

export type SourceEntry = {
  id: string;
  summary:
    | { kind: 'loading' }
    | { kind: 'ready'; value: SourceSummary | null }
    | { kind: 'failed'; message: string };
  reading: boolean;
  // Why the last "Read now" did not land; the previous read stays shown.
  readError: string | null;
};

const sourceOf = (variables: unknown) =>
  (variables as { source?: string } | undefined)?.source;

/*
  Several sources at once, each starting from the read the server gave the
  page (`initial[id]`), or fetched here when it gave none. `read` reads one
  of them again. `initial` counts only while a source has nothing cached: a
  read made since is what every panel shows.
*/
export function useSources(
  ids: readonly string[],
  initial: Readonly<Record<string, SourceSummary | null>> = {},
) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const summaries = useQueries({
    queries: ids.map((source) =>
      trpc.sources.summary.queryOptions(
        { source },
        {
          staleTime: Infinity,
          // Kept while the page lives: dropped, a panel shown again would
          // fall back to `initial`, which is older than a read made since.
          gcTime: Infinity,
          initialData:
            source in initial ? (initial[source] ?? null) : undefined,
        },
      ),
    ),
  });
  const { mutate } = useMutation(
    trpc.sources.read.mutationOptions({
      onSuccess: (summary, { source }) =>
        queryClient.setQueryData(
          trpc.sources.summary.queryKey({ source }),
          summary,
        ),
    }),
  );
  // Every panel's reads, not only this one's, oldest first.
  const reads = useMutationState({
    filters: { mutationKey: trpc.sources.read.mutationKey() },
    select: ({ state }) => ({
      source: sourceOf(state.variables),
      status: state.status,
      error: state.error?.message ?? null,
    }),
  });

  const entries: SourceEntry[] = ids.map((id, index) => {
    const query = summaries[index];
    const last = reads.findLast((read) => read.source === id);
    return {
      id,
      summary:
        query?.status === 'success'
          ? { kind: 'ready', value: query.data }
          : query?.status === 'error'
            ? { kind: 'failed', message: query.error.message }
            : { kind: 'loading' },
      reading: last?.status === 'pending',
      readError: last?.status === 'error' ? last.error : null,
    };
  });
  return { entries, read: (source: string) => mutate({ source }) };
}

// One read's values, for the drawer. A failure is not kept: opening the
// drawer again tries again.
export function useSourceValues() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (source: string, read: string): Promise<SourceValues> =>
    queryClient.fetchQuery(
      trpc.sources.values.queryOptions(
        { source, read },
        { staleTime: Infinity },
      ),
    );
}
