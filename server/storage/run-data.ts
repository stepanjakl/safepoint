import 'server-only';

import path from 'node:path';

/*
  Server-only. Where a process keeps what its runs produce outside version
  control: data/<process>/<kind>/. What a person approves is kept in fixtures/,
  where a change is reviewed like code. Reads, proposals, cross-checks and
  their parts, job progress and learned model limits are in the database
  (docs/engineering/DATABASE.md); what a run still keeps as files is listed
  here.
*/

export type RunDataKind = 'applied';

// Read when used, so a test can work in a scratch directory.
export const runDataDir = (processId: string, kind: RunDataKind) =>
  path.join(process.cwd(), 'data', processId, kind);
