import type { ProcessSummary } from './model';
import { promotionProcess, supportProcess } from './placeholder-process';

/*
  Where each process lives. The root is none of them: it opens the process the
  reader was last in (app/(shell)/page.tsx), so a process needs an address of
  its own for its link to mean that process.
*/
export const PROCESS_ROUTES: { process: ProcessSummary; href: string }[] = [
  { process: promotionProcess, href: '/examples/promotion' },
  { process: supportProcess, href: '/examples/support' },
];

export function processHref(id: string) {
  const route = PROCESS_ROUTES.find((entry) => entry.process.id === id);
  if (!route) throw new Error(`No route for process ${id}`);
  return route.href;
}
