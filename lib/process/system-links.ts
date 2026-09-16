import type {
  ReviewedReplay,
  ScenarioEvidencePack,
} from '../promotion-release';
import type { AdapterMode } from '../review-presentation/present-review';

// The list is the declaration and the type is derived from it, so an icon set
// can be checked for completeness against the same vocabulary the links use.
export const ICON_KEYS = [
  'catalogue',
  'shortlist',
  'forecast',
  'supply',
  'supplier',
  'channel',
  'note',
  'policy',
  'pricebook',
  'storefront',
  'labels',
  'portal',
  'queue',
  'identity',
  'billing',
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

export type Freshness = {
  state: 'fresh' | 'stale' | 'unavailable';
  label: string;
};

// One primitive with a direction. A system this process reads from and a system
// it would write to are the same kind of thing; only what matters about them
// differs, which is why `freshness` is present on one and not the other.
export type SystemLink = {
  id: string;
  label: string;
  icon: IconKey;
  direction: 'reads' | 'writes';
  // Sources only, and a property of the run that read them rather than of the
  // connection: the same source is fresh for one run and stale for the next.
  freshness?: Freshness;
  // Destinations only: what the connection can genuinely do. Unlike freshness
  // this belongs to the connection, so it holds for every run.
  mode?: AdapterMode;
  // For an input whose currency is a version rather than an observation time.
  detail?: string;
};

/*
  The scenario's evidence files, each with the icon its source is drawn with.
  One table for every reader -- the header's summary and the source detail
  view -- so a file cannot be listed under one icon in one place and another
  elsewhere.
*/
export const PROMOTION_PACKS = [
  {
    key: 'cataloguePricebook',
    icon: 'catalogue',
    file: 'catalogue-pricebook.json',
  },
  {
    key: 'shortlistProvenance',
    icon: 'shortlist',
    file: 'shortlist-provenance.json',
  },
  { key: 'demandEvidence', icon: 'forecast', file: 'demand-evidence.json' },
  { key: 'supplyPosition', icon: 'supply', file: 'supply-position.json' },
  { key: 'supplierTerms', icon: 'supplier', file: 'supplier-terms.json' },
  { key: 'channelState', icon: 'channel', file: 'channel-state.json' },
  { key: 'operationalNotes', icon: 'note', file: 'operational-notes.json' },
  { key: 'policyRules', icon: 'policy', file: 'policy-rules.json' },
] as const satisfies readonly {
  key: keyof ScenarioEvidencePack;
  icon: IconKey;
  file: string;
}[];

export type PromotionPack = (typeof PROMOTION_PACKS)[number];

// Keyed by the source's name rather than its position, so a choice saved
// against a source -- removing it, say -- still finds it when the list is
// reordered or another source appears.
export function sourceIdFor(label: string): string {
  const slug = label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `source-${slug}`;
}

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
// derivation's own order (oldest observation first) survives within a state.
export function byAttention(a: SystemLink, b: SystemLink): number {
  const rank = (link: SystemLink) =>
    link.freshness ? ATTENTION_RANK[link.freshness.state] : 2;
  return rank(a) - rank(b);
}

function ageLabel(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'under an hour ago';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

type Collected = {
  label: string;
  icon: IconKey;
  observedAt: string;
  records: number;
  unavailable: number;
};

// The packs already carry `sourceLabel` and `observedAt` on every record, so the
// source list is derived rather than declared: it cannot drift from the evidence
// the review is actually citing.
export function presentPromotionSources(replay: ReviewedReplay): SystemLink[] {
  const packs: [IconKey, unknown][] = PROMOTION_PACKS.map((pack) => [
    pack.icon,
    replay.scenario[pack.key],
  ]);

  const collected = new Map<string, Collected>();
  for (const [icon, pack] of packs) {
    const holder = pack as { records?: unknown };
    const records = Array.isArray(holder.records) ? holder.records : [pack];
    for (const entry of records) {
      const record = entry as {
        sourceLabel?: unknown;
        observedAt?: unknown;
        kind?: unknown;
      };
      if (
        typeof record.sourceLabel !== 'string' ||
        typeof record.observedAt !== 'string'
      )
        continue;
      const existing = collected.get(record.sourceLabel);
      const unavailable = record.kind === 'unavailable' ? 1 : 0;
      if (!existing) {
        collected.set(record.sourceLabel, {
          label: record.sourceLabel,
          icon,
          observedAt: record.observedAt,
          records: 1,
          unavailable,
        });
        continue;
      }
      // Oldest observation wins: a source is only as current as its stalest record.
      if (record.observedAt < existing.observedAt)
        existing.observedAt = record.observedAt;
      existing.records += 1;
      existing.unavailable += unavailable;
    }
  }

  const reviewAt = Date.parse(replay.scenario.promotionBrief.campaign.reviewAt);
  const maxAgeMs =
    replay.scenario.policyRules.maximumEvidenceAgeHours * 3_600_000;

  return [...collected.values()]
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .map((source) => {
      const link: SystemLink = {
        id: sourceIdFor(source.label),
        label: source.label,
        icon: source.icon,
        direction: 'reads',
      };
      // A ruleset is not an observation. Ageing the policy against the evidence
      // threshold would report a two-day-old rule as stale when all that means
      // is when it last changed; its currency is its version.
      if (source.icon === 'policy') {
        link.detail = `Policy ${replay.scenario.policyRules.policyVersion}`;
        return link;
      }
      const age = reviewAt - Date.parse(source.observedAt);
      link.freshness =
        source.unavailable > 0
          ? {
              state: 'unavailable',
              // The source is reachable; some of its records are not. Saying
              // "evidence unavailable" would overstate it.
              label: `${source.unavailable} of ${source.records} records unavailable`,
            }
          : age > maxAgeMs
            ? { state: 'stale', label: `Observed ${ageLabel(age)}` }
            : { state: 'fresh', label: `Observed ${ageLabel(age)}` };
      return link;
    });
}
