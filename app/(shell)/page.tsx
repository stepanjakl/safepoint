import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  LAST_PROCESS_KEY,
  PROCESS_ORDER_KEY,
  landingProcess,
} from '@/lib/process/navigation';
import { PROCESS_ROUTES, processHref } from '@/lib/process/routes';

/*
  The root is not a page of its own: it opens the process the reader was last
  in, or else the first one waiting on a review, so arriving never lands on an
  empty screen that only repeats the sidebar. A query is carried across.
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
  const href = processHref(id ?? PROCESS_ROUTES[0]!.process.id);
  redirect(query.size ? `${href}?${query}` : href);
}
