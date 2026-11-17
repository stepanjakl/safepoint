// What an output can genuinely do: change a live system, only pretend to, or
// show what it would have changed.
export type AdapterMode = 'live_sandbox' | 'simulated' | 'preview_only';

export const MODE_LABELS: Record<AdapterMode, string> = {
  live_sandbox: 'Live sandbox',
  simulated: 'Simulated',
  preview_only: 'Preview only',
};

export type IconKey =
  | 'brief'
  | 'catalogue'
  | 'shortlist'
  | 'forecast'
  | 'supply'
  | 'supplier'
  | 'channel'
  | 'note'
  | 'policy'
  | 'pricebook'
  | 'storefront'
  | 'labels'
  | 'portal'
  | 'queue'
  | 'identity'
  | 'billing'
  | 'sheet';

export type Freshness = {
  state: 'fresh' | 'stale' | 'unavailable';
  label: string;
};

/*
  One link with a direction. An input is a file the run read: an
  analysed extract, treated as the run's source of truth and produced outside
  Safepoint. An output is an API the process may call once changes are
  approved. They are drawn alike; only what matters about them differs, which
  is why freshness is present on one and the adapter mode on the other.
*/
export type SystemLink = {
  id: string;
  label: string;
  icon: IconKey;
  direction: 'input' | 'output';
  // Inputs only, and a property of the run that read the file rather than of
  // the file's name: the same input is fresh for one run and stale for the next.
  freshness?: Freshness;
  // Inputs only: the file and how many records it holds.
  file?: string;
  records?: number;
  // Outputs only: what the API can genuinely do, which API it is, and how a
  // call is undone. These belong to the output, so they hold for every run.
  mode?: AdapterMode;
  api?: string;
  undo?: string;
  // For an input whose currency is a version rather than an observation time.
  detail?: string;
};

export function needsAttention(link: SystemLink): boolean {
  return link.freshness !== undefined && link.freshness.state !== 'fresh';
}

// A count that spans two states takes the colour of the worse one.
export function worstFreshness(
  links: SystemLink[],
): Exclude<Freshness['state'], 'fresh'> | null {
  const needing = links.filter(needsAttention);
  if (needing.length === 0) return null;
  return needing.some((link) => link.freshness?.state === 'unavailable')
    ? 'unavailable'
    : 'stale';
}

const ATTENTION_RANK: Record<Freshness['state'], number> = {
  unavailable: 0,
  stale: 1,
  fresh: 2,
};

// Worst first, and otherwise in the order given: the sort is stable, so the
// files' own order survives within a state.
export function byAttention(a: SystemLink, b: SystemLink): number {
  const rank = (link: SystemLink) =>
    link.freshness ? ATTENTION_RANK[link.freshness.state] : 2;
  return rank(a) - rank(b);
}
