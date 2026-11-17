import type { Decision } from './types';

// A decision as it is made on the row, before the server has answered it. In
// its own file, not the row's, so a server-rendered page can build one too.
export const madeNow = (
  kind: Decision['kind'],
  at: string,
  change?: {
    values: Record<string, number>;
    checked: Pick<Decision, 'verdict' | 'checks'>;
  },
): Decision => ({
  kind,
  values: change?.values ?? null,
  verdict: change?.checked.verdict ?? null,
  checks: change?.checked.checks ?? null,
  actor: null,
  at,
});
