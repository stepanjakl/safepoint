import type {
  ReviewedReplay,
  ScenarioEvidencePack,
} from '../promotion-release';
import type { AdapterMode } from '../review-presentation';

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
  | 'billing';

export type Freshness = {
  state: 'fresh' | 'stale' | 'unavailable';
  label: string;
};

/*
  One link with a direction. An input is a JSON evidence file the run read: an
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

/*
  The scenario's evidence files: one input each, named for what the file
  holds rather than for a system, with the icon it is drawn with. One table for
  every reader -- the header, the Inputs tab and the input detail -- so a file
  cannot be named one way in one place and another way elsewhere.
*/
export const PROMOTION_PACKS = [
  {
    key: 'promotionBrief',
    label: 'Campaign brief',
    icon: 'brief',
    file: 'promotion-brief.json',
  },
  {
    key: 'shortlistProvenance',
    label: 'Shortlist provenance',
    icon: 'shortlist',
    file: 'shortlist-provenance.json',
  },
  {
    key: 'cataloguePricebook',
    label: 'Catalogue and pricebook',
    icon: 'catalogue',
    file: 'catalogue-pricebook.json',
  },
  {
    key: 'demandEvidence',
    label: 'Demand forecast',
    icon: 'forecast',
    file: 'demand-evidence.json',
  },
  {
    key: 'supplyPosition',
    label: 'Supply position',
    icon: 'supply',
    file: 'supply-position.json',
  },
  {
    key: 'supplierTerms',
    label: 'Supplier terms',
    icon: 'supplier',
    file: 'supplier-terms.json',
  },
  {
    key: 'channelState',
    label: 'Channel state',
    icon: 'channel',
    file: 'channel-state.json',
  },
  {
    key: 'operationalNotes',
    label: 'Operational notes',
    icon: 'note',
    file: 'operational-notes.json',
  },
  {
    key: 'policyRules',
    label: 'Policy rules',
    icon: 'policy',
    file: 'policy-rules.json',
  },
] as const satisfies readonly {
  key: keyof ScenarioEvidencePack;
  label: string;
  icon: IconKey;
  file: string;
}[];

export type PromotionPack = (typeof PROMOTION_PACKS)[number];

// Keyed by the file rather than its position, so a choice saved against an
// input -- removing it, say -- still finds it when the list is reordered.
export function inputIdFor(key: PromotionPack['key']): string {
  return `input-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

// What every evidence record carries, whatever else its file holds.
export type EvidenceRecord = {
  evidenceId: string;
  sourceLabel: string;
  observedAt: string;
  kind?: string;
};

// A file's records. A file without a record list -- the brief, the policy --
// is one record: the file as a whole.
function evidenceRecords(
  scenario: ScenarioEvidencePack,
  key: PromotionPack['key'],
): EvidenceRecord[] {
  const value = scenario[key] as unknown as EvidenceRecord & {
    records?: EvidenceRecord[];
  };
  return Array.isArray(value.records) ? value.records : [value];
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
// files' own order survives within a state.
export function byAttention(a: SystemLink, b: SystemLink): number {
  const rank = (link: SystemLink) =>
    link.freshness ? ATTENTION_RANK[link.freshness.state] : 2;
  return rank(a) - rank(b);
}

// Rounded down, not to nearest: an input observed 30 minutes ago reported as
// "1h ago" is a claim about its age that the file does not support.
function ageLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// One input per evidence file, with the condition a reviewer needs from it:
// whether its records were current at review time, and whether any were
// unavailable. Derived from the files themselves, so the list cannot drift from
// the evidence the review is actually citing.
export function presentPromotionInputs(replay: ReviewedReplay): SystemLink[] {
  const { scenario } = replay;
  const reviewAt = Date.parse(scenario.promotionBrief.campaign.reviewAt);
  const maxAgeMs = scenario.policyRules.maximumEvidenceAgeHours * 3_600_000;

  return PROMOTION_PACKS.map((pack) => {
    const records = evidenceRecords(scenario, pack.key);
    const link: SystemLink = {
      id: inputIdFor(pack.key),
      label: pack.label,
      icon: pack.icon,
      direction: 'input',
      file: pack.file,
      records: records.length,
    };
    // A ruleset is not an observation. Ageing the policy against the evidence
    // threshold would report a two-day-old rule as stale when all that means
    // is when it last changed; its currency is its version.
    if (pack.key === 'policyRules') {
      link.detail = `Version ${scenario.policyRules.policyVersion}`;
      return link;
    }
    // An input is only as current as its oldest record.
    const oldest = records
      .map((record) => record.observedAt)
      .reduce((a, b) => (b < a ? b : a));
    const unavailable = records.filter(
      (record) => record.kind === 'unavailable',
    ).length;
    const age = reviewAt - Date.parse(oldest);
    link.freshness =
      unavailable > 0
        ? {
            state: 'unavailable',
            // The file was read; some of its records were not available.
            // Saying "input unavailable" would overstate it.
            label: `${unavailable} of ${records.length} records unavailable`,
          }
        : age > maxAgeMs
          ? { state: 'stale', label: `Observed ${ageLabel(age)}` }
          : { state: 'fresh', label: `Observed ${ageLabel(age)}` };
    return link;
  });
}
