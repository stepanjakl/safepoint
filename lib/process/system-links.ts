import type { ReviewedReplay } from '../promotion-release';

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
  // Sources only. A destination's interesting property is its mode and its
  // recovery, neither of which exists until something can be applied.
  freshness?: Freshness;
  // For an input whose currency is a version rather than an observation time.
  detail?: string;
};

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
  const packs: [IconKey, unknown][] = [
    ['catalogue', replay.scenario.cataloguePricebook],
    ['shortlist', replay.scenario.shortlistProvenance],
    ['forecast', replay.scenario.demandEvidence],
    ['supply', replay.scenario.supplyPosition],
    ['supplier', replay.scenario.supplierTerms],
    ['channel', replay.scenario.channelState],
    ['note', replay.scenario.operationalNotes],
    ['policy', replay.scenario.policyRules],
  ];

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
    .map((source, index) => {
      const link: SystemLink = {
        id: `source-${index}`,
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
