'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/server/api/root';

/*
  Server state for every page: TanStack Query's cache, filled through typed
  tRPC procedures (server/api/). A component reads with
  `useQuery(useTRPC().<router>.<procedure>.queryOptions(input))` and writes
  with `useMutation(... .mutationOptions())`. Browser preferences are not
  server state and stay in their stored records.
*/

const trpc = createTRPCContext<AppRouter>();
const { TRPCProvider } = trpc;
export const { useTRPC } = trpc;

/*
  One person works alone here, and what the server keeps changes only when
  they change it through the app, which updates the cache as it does. So a
  query does not refetch when the window regains focus, and a failure is the
  server's answer (refused, missing, unreadable), shown at once rather than
  retried. A write is never retried: it could happen twice. The short stale
  time keeps a page that hydrates from refetching what it was just given.
*/
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: false,
      },
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

// One client per request on the server, so no two renders share a cache;
// one for the life of the page in the browser.
function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  // Relative: queries run in the browser, never while the server renders.
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        // Unbatched, so each procedure has its own URL: the browser tests
        // intercept calls one procedure at a time (e2e/trpc.ts).
        httpLink({ url: '/api/trpc' }),
      ],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
