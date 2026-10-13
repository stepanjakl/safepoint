import path from 'node:path';

/*
  Server-only. Where a process keeps what its runs produce -- reads of its
  data, model answers, drafts in progress -- outside version control:
  data/<process>/<kind>/. What a person approves is kept in fixtures/, where a
  change is reviewed like code.
*/

export type RunDataKind = 'reads' | 'cross-checks' | 'proposals' | 'drafts';

// Read when used, so a test can work in a scratch directory.
export const runDataDir = (processId: string, kind: RunDataKind) =>
  path.join(process.cwd(), 'data', processId, kind);
