import { tabValues, type Snapshot } from './engine';
import type { Decision } from './schema';

/*
  An owner decision answers an open question about one statement. It stays
  current while the statement's text is still in the sheet; if the owner
  changes that text, the decision is stale: it may no longer fit, so it is not
  used for drafting until the owner confirms it again.
*/

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

export function isStale(decision: Decision, snapshot: Snapshot): boolean {
  const quote = normalise(decision.quote);
  if (!quote) return true;
  for (const tab of snapshot.tabs)
    for (const row of tabValues(snapshot, tab)?.values ?? []) {
      const cells = row.map((c) => normalise(String(c ?? '')));
      if (cells.some((c) => c.includes(quote))) return false;
      if (normalise(cells.join(' ')).includes(quote)) return false;
    }
  return true;
}

export const currentDecisions = (decisions: Decision[], snapshot: Snapshot) =>
  decisions.filter((d) => !isStale(d, snapshot));
