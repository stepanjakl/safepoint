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
  inputIdFor,
  type IconKey,
  type PromotionPack,
} from './system-links';

/*
  What an input actually gave this run: the records its JSON file holds, with
  the facts a reviewer checks pulled out and the review items that cited each
  one. Built on the server from the same replay the review reads, so the
  detail can never disagree with the evidence the review cites.

  One detail per file. The files are analysed extracts, treated as the run's
  source of truth and produced outside Safepoint; the source labels their
  records carry are kept as provenance, so a file whose records name two
  sources is still one input.
*/

export type InputField = { label: string; value: string };

export type InputRecordDetail = {
  evidenceId: string;
  title: string;
  // The SKU or SKUs the record is about; null for a record about the whole run.
  subject: string | null;
  unavailableReason: string | null;
  fields: InputField[];
  // Free text from the file. Notes are untrusted evidence: shown, never
  // treated as instruction.
  text: string | null;
  untrusted: boolean;
  // The record exactly as the file holds it.
  raw: string;
  citedBy: { sku: Sku; label: string }[];
};

export type InputDetail = {
  id: string;
  label: string;
  icon: IconKey;
  file: string;
  observedAtLabel: string;
  // For an input whose currency is a version rather than an observation time.
  version: string | null;
  // The source labels the file's records carry, as provenance.
  sources: string[];
  records: InputRecordDetail[];
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
type Presented = Omit<InputRecordDetail, 'evidenceId' | 'raw' | 'citedBy'>;
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
  promotionBrief: (r) =>
    presented(r.campaign.name, null, [
      ['Objective', r.campaign.objective],
      [
        'Runs',
        `${formatLondonDateTime(r.campaign.startsAt)} – ${formatLondonDateTime(r.campaign.endsAt)}`,
      ],
      ['Review', formatLondonDateTime(r.campaign.reviewAt)],
      ['Top-up cutoff', formatLondonDateTime(r.campaign.topUpCutoffAt)],
      ['Label deadline', formatLondonDateTime(r.campaign.labelDeadlineAt)],
      [
        'Candidates',
        `${r.candidates.length} lines · ${
          r.candidates.filter((candidate) => candidate.status === 'withdrawn')
            .length
        } withdrawn`,
      ],
    ]),
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

export function presentPromotionInputDetails(
  replay: ReviewedReplay,
): Record<string, InputDetail> {
  const names = new Map(
    replay.scenario.cataloguePricebook.records.map((r) => [
      r.sku,
      r.productName,
    ]),
  );
  const name: Name = (sku) => names.get(sku) ?? sku;
  const cited = citations(replay);
  const details: Record<string, InputDetail> = {};

  const collect = <K extends PackKey>(
    pack: Extract<PromotionPack, { key: K }>,
  ) => {
    const present = PRESENTERS[pack.key] as (
      record: PackRecord<K>,
      name: Name,
    ) => Presented;
    const sources = new Set<string>();
    const citedSkus = new Set<Sku>();
    const checks = new Set<string>();
    let oldest: string | null = null;
    let unavailableCount = 0;

    const records = recordsOf(replay.scenario, pack.key).map((record) => {
      const shown = present(record, name);
      const skus = [...(cited.skus.get(record.evidenceId) ?? [])].sort();
      sources.add(record.sourceLabel);
      // An input is only as current as its oldest record.
      if (oldest === null || record.observedAt < oldest) {
        oldest = record.observedAt;
      }
      if (shown.unavailableReason !== null) unavailableCount += 1;
      for (const sku of skus) citedSkus.add(sku);
      for (const check of cited.checks.get(record.evidenceId) ?? []) {
        checks.add(check);
      }
      return {
        ...shown,
        evidenceId: record.evidenceId,
        raw: JSON.stringify(record, null, 2),
        citedBy: skus.map((sku) => ({ sku, label: `${sku} · ${name(sku)}` })),
      };
    });

    const id = inputIdFor(pack.key);
    details[id] = {
      id,
      label: pack.label,
      icon: pack.icon,
      file: pack.file,
      observedAtLabel: oldest === null ? '' : formatLondonDateTime(oldest),
      version:
        pack.key === 'policyRules'
          ? replay.scenario.policyRules.policyVersion
          : null,
      sources: [...sources],
      records,
      unavailableCount,
      citedByCount: citedSkus.size,
      checks: [...checks].sort(),
    };
  };
  for (const pack of PROMOTION_PACKS) collect(pack);

  return details;
}
