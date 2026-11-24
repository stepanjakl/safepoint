import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  LAST_PROCESS_KEY,
  PROCESS_ORDER_KEY,
  landingProcess,
} from '@/lib/shell/navigation';
import { PROCESS_ROUTES, processHref } from '@/lib/shell/routes';

/*
  The root is not a page of its own. A first visit opens the workspace's
  introduction; a reader coming back opens the process they were last in.
  A query (a run, say) opens a process: the last one, or else the first
  waiting on a review, with the query carried across.
*/
export default async function LandingPage({ searchParams }: PageProps<'/'>) {
  const store = await cookies();
  const id = landingProcess(
    PROCESS_ROUTES.map(({ process }) => ({
      id: process.id,
      awaitingReview: process.runs.some(
        (run) => run.current && run.status === 'awaiting_review',
      ),
    })),
    store.get(PROCESS_ORDER_KEY)?.value ?? null,
    store.get(LAST_PROCESS_KEY)?.value ?? null,
  );
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const each of [value ?? []].flat()) query.append(key, each);
  }
  const last = store.get(LAST_PROCESS_KEY)?.value;
  const returning = PROCESS_ROUTES.some(({ process }) => process.id === last);
  if (!returning && !query.size) redirect('/workspace');
  const href = processHref(id ?? PROCESS_ROUTES[0]!.process.id);
  redirect(query.size ? `${href}?${query}` : href);
}
