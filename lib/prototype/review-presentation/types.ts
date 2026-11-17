import {
  type ReviewLine,
  type ReviewOutcome,
  type Sku,
} from '../promotion-release';

/* The shapes the presenter produces: serialisable strings and numbers for
   the interface, and nothing it has to compute again. */

export type ReviewPresentation = {
  batch: BatchPresentation;
  categories: CategoryGroup[];
  candidates: CandidateRow[];
  details: Record<Sku, LineDetail>;
};

export type BatchPresentation = {
  title: string;
  mode: 'replay';
  fixtureVersion: string;
  reviewedAtLabel: string;
  labelDeadlineLabel: string;
  topUpCutoffLabel: string;
  remainingLabel: string;
  counts: {
    evaluated: number;
    ready: number;
    needsAttention: number;
    nonReleasable: number;
    held: number;
    excluded: number;
    unverifiable: number;
  };
  reviewer: {
    approved: number;
    held: number;
    rejected: number;
    pending: number;
  };
};

export type CategoryGroup = {
  id: ReviewLine['catalogue']['category'];
  label: string;
  skus: Sku[];
};

export type CandidateRow = {
  sku: Sku;
  name: string;
  unit: string;
  categoryLabel: string;
  outcome: ReviewOutcome;
  outcomeLabel: string;
  reason: string;
};

export type AgentRecommendation =
  ReviewLine['agentAssessment']['agentRecommendation'];
export type PolicyEligibility = ReviewLine['policyEvaluation']['eligibility'];
export type Gate =
  ReviewLine['agentAssessment']['gateAssessments'][number]['gate'];
export type GateResult =
  ReviewLine['agentAssessment']['gateAssessments'][number]['result'];
export type GateObligation =
  ReviewLine['policyEvaluation']['gateObligations'][number]['obligation'];
export type AdapterMode = 'live_sandbox' | 'simulated' | 'preview_only';

export type PresentedFinding = {
  id: string;
  title: string;
  severity: 'info' | 'warning' | 'blocking';
  consequence: 'none' | 'individual_approval' | 'block';
  explanation: string;
  evidence: EvidenceRef[];
};

export type EvidenceRef = {
  id: string;
  sourceLabel: string;
  observedAtLabel: string;
};

export type ValueRow = {
  kind: 'change' | 'fact';
  label: string;
  current: string | null;
  proposed: string;
  note: string | null;
};

export type EffectNode = {
  id: string;
  destination: string;
  mode: AdapterMode;
  modeLabel: string;
  state: 'planned';
  stateLabel: string;
  undo: string;
};

export type PresentedGate = {
  gate: Gate;
  label: string;
  result: GateResult;
  resultLabel: string;
  obligation: GateObligation;
  obligationLabel: string;
  explanation: string;
  obligationReason: string;
  evidence: EvidenceRef[];
  openByDefault: boolean;
};

export type SourceRecord = {
  id: string;
  sourceLabel: string;
  observedAtLabel: string;
  facts: string[];
};

export type LineDetail = {
  sku: Sku;
  name: string;
  unit: string;
  categoryLabel: string;
  supplierLabel: string;
  outcome: ReviewOutcome;
  outcomeLabel: string;
  agent: {
    recommendation: AgentRecommendation;
    recommendationLabel: string;
    rationale: string;
    uncertainties: string[];
  };
  policy: {
    eligibility: PolicyEligibility;
    eligibilityLabel: string;
    summary: string;
    findings: PresentedFinding[];
    reviewerConsequence: string;
    nextAction: string;
  };
  margin: {
    projectedPercent: number;
    projectedLabel: string;
    floorPercent: number;
    floorLabel: string;
    meetsFloor: boolean;
    basis: string;
  } | null;
  values: ValueRow[] | null;
  effects: EffectNode[] | null;
  noProposalReason: string | null;
  gates: PresentedGate[];
  gateSummary: string;
  evidence: {
    note: {
      sourceLabel: string;
      observedAtLabel: string;
      text: string;
    } | null;
    agentInterpretation: string;
    sourceFact: string;
    policyConsequence: string;
    sources: SourceRecord[];
  };
  actionNote: string;
};

export const CATEGORY_LABELS: Record<CategoryGroup['id'], string> = {
  fruit: 'Fruit',
  vegetables_and_salad: 'Vegetables and salad',
  bakery: 'Bakery',
  dairy_and_chilled: 'Dairy and chilled',
  meat_fish_and_plant: 'Meat, fish and plant',
};

export type LineContext = {
  evidenceIndex: Map<string, EvidenceRef>;
  floorPercent: number;
  priceChangeThreshold: number;
  campaignStartsAt: string;
};
