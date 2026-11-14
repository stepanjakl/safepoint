import 'server-only';

import type { Database } from './client';
import { processes } from './schema';

/*
  Server-only. A row scoped to a process needs the process in `processes`
  (DATABASE.md, "Tables"). Nothing seeds that table yet, so what keeps a
  scoped row makes sure of its process first; saying it twice is harmless.
*/
export async function ensureProcess(db: Database, id: string) {
  await db.insert(processes).values({ id }).onConflictDoNothing();
}
