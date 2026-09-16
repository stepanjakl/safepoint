import {
  EXPECTED_SKUS,
  type ReviewedReplay,
  type Sku,
} from '../promotion-release';
import {
  GATE_LABELS,
  formatLondonDateTime,
  formatMoney,
  formatPercent,
} from '../review-presentation/present-review';
import {
  PROMOTION_PACKS,
  sourceIdFor,
  type IconKey,
  type PromotionPack,
} from './system-links';

/*
  What a read system actually gave this run: its records, as the fixture files
  hold them, with the facts a reviewer checks pulled out and the review items
  that cited each one. Built on the server from the same replay the review
  reads, so the detail can never disagree with the evidence the review cites.

  Fictional data. There is no live system behind any of these sources, so the
  view shows what was read and nothing claims to open the source itself.
*/

export type SourceField = { label: string; value: string };

export type SourceRecordDetail = {
  evidenceId: string;
  title: string;
  // The SKU or SKUs the record is about; null for a record about the whole run.
  subject: string | null;
  unavailableReason: string | null;
  fields: SourceField[];
  // Free text from the source. Notes are untrusted evidence: shown, never
  // treated as instruction.
  text: string | null;
  untrusted: boolean;
  // The record exactly as the file holds it.
  raw: string;
  citedBy: { sku: Sku; label: string }[];
};

export type SourceDetail = {
  id: string;
  label: string;
  icon: IconKey;
  file: string;
  observedAtLabel: string;
  records: SourceRecordDetail[];
  unavailableCount: number;
  citedByCount: number;
  checks: string[];
};

type Scenario = ReviewedReplay['scenario'];
type PackKey = PromotionPack['key'];
type EvidenceMeta = {
  evidenceId: string;
  sourceLabel: string;
  observedAt: string;
};
type PackRecord<K extends PackKey> = Scenario[K] extends {
  records: readonly (infer R)[];
}
  ? R
  : Scenario[K];
type Presented = Omit<SourceRecordDetail, 'evidenceId' | 'raw' | 'citedBy'>;
type Name = (sku: Sku) => string;

const readable = (value: string) => {
  const spaced = value.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
const units = (count: number) => `${count.toLocaleString('en-GB')} units`;

function presented(
  title: string,
  subject: string | null,
  fields: [string, string | null][],
  extra: Partial<Presented> = {},
): Presented {
  return {
    title,
    subject,
    fields: fields.flatMap(([label, value]) =>
      value === null ? [] : [{ label, value }],
    ),
    unavailableReason: null,
    text: null,
    untrusted: false,
    ...extra,
  };
}

// One presenter per file. Each says which facts of a record are worth reading
// at a glance; the raw record stays one disclosure away for everything else.
const PRESENTERS: {
  [K in PackKey]: (record: PackRecord<K>, name: Name) => Presented;
} = {
  cataloguePricebook: (r) =>
    presented(r.productName, r.sku, [
      ['Category', readable(r.category)],
      ['Unit', r.unitDescription],
      ['Regular price', formatMoney(r.regularSellingPricePence)],
      [
        'Current promotion',
        r.currentPromotionalSellingPricePence === null
          ? 'None'
          : formatMoney(r.currentPromotionalSellingPricePence),
      ],
      ['Cost price', formatMoney(r.costPricePence)],
      ['Case pack', units(r.casePackUnits)],
    ]),
  shortlistProvenance: (r, name) =>
    presented(name(r.sku), r.sku, [
      ['Upstream score', `${r.upstreamScore} / 100`],
      ['Selection reason', r.selectionReason],
      [
        'Approval',
        `${r.approvalReference} · ${formatLondonDateTime(r.approvedAt)}`,
      ],
      ['Cycle', r.cycleId],
    ]),
  demandEvidence: (r, name) =>
    r.kind === 'unavailable'
      ? presented(name(r.sku), r.sku, [], { unavailableReason: r.reason })
      : presented(name(r.sku), r.sku, [
          ['Recent weekly sales', r.recentWeeklySalesUnits.join(' · ')],
          ['Baseline forecast', units(r.baselineForecastUnits)],
          ['Promotion forecast', units(r.promotionAdjustedForecastUnits)],
          ['Confidence', readable(r.forecastConfidence)],
          ['Uplift already included', r.upliftAlreadyIncluded ? 'Yes' : 'No'],
          ['Analyst commentary', r.analystCommentary],
        ]),
  supplyPosition: (r, name) =>
    r.kind === 'unavailable'
      ? presented(name(r.sku), r.sku, [], { unavailableReason: r.reason })
      : presented(name(r.sku), r.sku, [
          ['On hand', units(r.stockOnHandUnits)],
          ['Reserved', units(r.reservedUnits)],
          ['Inbound before launch', units(r.confirmedInboundBeforeLaunchUnits)],
          ['Earlier promotion order', units(r.earlierPromotionOrderUnits)],
          ['Open top-up amendment', units(r.openTopUpAmendmentUnits)],
          ['Safety stock', units(r.safetyStockUnits)],
          ['Location', r.location],
        ]),
  supplierTerms: (r, name) =>
    presented(name(r.sku), r.sku, [
      ['Supplier', `${r.supplierName} · ${r.supplierId}`],
      ['Lead time', `${r.leadTimeHours}h`],
      ['Minimum order', units(r.minimumOrderQuantityUnits)],
      ['Order multiple', units(r.orderMultipleUnits)],
      [
        'Confirmed extra allocation',
        units(r.confirmedAdditionalAllocationUnits),
      ],
      ['Top-up cutoff', formatLondonDateTime(r.topUpCutoffAt)],
      [
        'Funding',
        r.fundingStatus === 'not_offered'
          ? 'Not offered'
          : `${readable(r.fundingStatus)} · ${formatMoney(r.fundingPencePerUnit)} per unit`,
      ],
    ]),
  channelState: (r, name) =>
    presented(
      name(r.sku),
      r.sku,
      r.channels.map((channel) => [
        readable(channel.channel),
        [
          readable(channel.status),
          channel.promotionalSellingPricePence === null
            ? null
            : formatMoney(channel.promotionalSellingPricePence),
          channel.startsAt && channel.endsAt
            ? `${formatLondonDateTime(channel.startsAt)} – ${formatLondonDateTime(channel.endsAt)}`
            : null,
        ]
          .filter((part) => part !== null)
          .join(' · '),
      ]),
    ),
  operationalNotes: (r) =>
    presented(
      `${readable(r.noteType)} note`,
      r.relatedSkus.length === EXPECTED_SKUS.length
        ? 'All candidates'
        : r.relatedSkus.join(', '),
      [],
      { text: r.text, untrusted: true },
    ),
  policyRules: (r) =>
    presented(r.policyVersion, null, [
      ['Minimum margin', formatPercent(r.minimumMarginPercent)],
      [
        'Individual approval',
        `Above a ${formatPercent(r.individualApprovalPriceChangePercent)} price change`,
      ],
      ['Maximum evidence age', `${r.maximumEvidenceAgeHours}h`],
      ['Required channels', r.requiredChannels.map(readable).join(', ')],
    ]),
};

function recordsOf<K extends PackKey>(
  scenario: Scenario,
  key: K,
): (PackRecord<K> & EvidenceMeta)[] {
  const value = scenario[key];
  return ('records' in value ? value.records : [value]) as (PackRecord<K> &
    EvidenceMeta)[];
}

// Which review items, and which readiness checks, cited each evidence record.
function citations(replay: ReviewedReplay) {
  const skus = new Map<string, Set<Sku>>();
  const checks = new Map<string, Set<string>>();
  const add = <T>(map: Map<string, Set<T>>, id: string, value: T) => {
    const set = map.get(id) ?? new Set<T>();
    set.add(value);
    map.set(id, set);
  };
  for (const line of replay.lines) {
    for (const id of line.agentAssessment.evidenceRefs) add(skus, id, line.sku);
    for (const gate of line.agentAssessment.gateAssessments) {
      for (const id of gate.evidenceRefs) {
        add(skus, id, line.sku);
        add(checks, id, GATE_LABELS[gate.gate]);
      }
    }
    for (const finding of line.policyEvaluation.findings) {
      for (const id of finding.evidenceRefs) add(skus, id, line.sku);
    }
  }
  return { skus, checks };
}

export function presentPromotionSourceDetails(
  replay: ReviewedReplay,
): Record<string, SourceDetail> {
  const names = new Map(
    replay.scenario.cataloguePricebook.records.map((r) => [
      r.sku,
      r.productName,
    ]),
  );
  const name: Name = (sku) => names.get(sku) ?? sku;
  const cited = citations(replay);
  const details: Record<string, SourceDetail> = {};
  const observed = new Map<string, string>();
  const citedSkus = new Map<string, Set<Sku>>();
  const checks = new Map<string, Set<string>>();

  const collect = <K extends PackKey>(
    pack: Extract<PromotionPack, { key: K }>,
  ) => {
    const present = PRESENTERS[pack.key] as (
      record: PackRecord<K>,
      name: Name,
    ) => Presented;
    for (const record of recordsOf(replay.scenario, pack.key)) {
      // A file can hold more than one source -- the notes file holds a note
      // per author -- so records group by the source that wrote them.
      const id = sourceIdFor(record.sourceLabel);
      const detail = (details[id] ??= {
        id,
        label: record.sourceLabel,
        icon: pack.icon,
        file: pack.file,
        observedAtLabel: '',
        records: [],
        unavailableCount: 0,
        citedByCount: 0,
        checks: [],
      });
      const shown = present(record, name);
      const skus = [...(cited.skus.get(record.evidenceId) ?? [])].sort();
      detail.records.push({
        ...shown,
        evidenceId: record.evidenceId,
        raw: JSON.stringify(record, null, 2),
        citedBy: skus.map((sku) => ({ sku, label: `${sku} · ${name(sku)}` })),
      });
      if (shown.unavailableReason !== null) detail.unavailableCount += 1;
      // A source is only as current as its oldest record.
      const oldest = observed.get(id);
      if (!oldest || record.observedAt < oldest)
        observed.set(id, record.observedAt);
      const sourceSkus = citedSkus.get(id) ?? new Set<Sku>();
      for (const sku of skus) sourceSkus.add(sku);
      citedSkus.set(id, sourceSkus);
      const sourceChecks = checks.get(id) ?? new Set<string>();
      for (const check of cited.checks.get(record.evidenceId) ?? [])
        sourceChecks.add(check);
      checks.set(id, sourceChecks);
    }
  };
  for (const pack of PROMOTION_PACKS) collect(pack);

  for (const detail of Object.values(details)) {
    detail.observedAtLabel = formatLondonDateTime(observed.get(detail.id)!);
    detail.citedByCount = citedSkus.get(detail.id)?.size ?? 0;
    detail.checks = [...(checks.get(detail.id) ?? [])].sort();
  }
  return details;
}
