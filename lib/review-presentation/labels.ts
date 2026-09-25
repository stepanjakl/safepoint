import { type ReviewLine, type ReviewOutcome } from '../promotion-release';
import {
  type AdapterMode,
  type AgentRecommendation,
  type Gate,
  type GateObligation,
  type GateResult,
  type PolicyEligibility,
} from './types';

/* Every fixed label the presenter prints, and where each semantic action
   lands. Wording lives here so it can be read and changed in one place. */

export const OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  ready: 'Ready',
  needs_attention: 'Needs attention',
  held: 'Held',
  excluded: 'Excluded',
  unverifiable: 'Unverifiable',
};

export const RECOMMENDATION_LABELS: Record<AgentRecommendation, string> = {
  release: 'Release',
  adjust: 'Adjust',
  hold: 'Hold',
  exclude: 'Exclude',
};

export const ELIGIBILITY_LABELS: Record<PolicyEligibility, string> = {
  eligible: 'Eligible',
  blocked: 'Blocked',
};

export type FindingCode =
  ReviewLine['policyEvaluation']['findings'][number]['code'];

export const FINDING_TITLES: Record<FindingCode, string> = {
  late_supply: 'Supply arrives after launch',
  unconfirmed_allocation: 'Allocation not confirmed',
  margin_below_floor: 'Margin below floor',
  funding_unverified: 'Funding unverified',
  promotion_withdrawn: 'Withdrawn from the brief',
  required_evidence_unavailable: 'Required evidence unavailable',
  uplift_already_included: 'Uplift already in forecast',
  existing_supply_covers_demand: 'Existing supply covers demand',
  invalid_order_multiple_corrected: 'Order multiple corrected',
  channel_dates_corrected: 'Channel dates corrected',
  alternative_safe_plan: 'Alternative safe plan',
  large_price_change: 'Large price change',
};

export const NEXT_ACTIONS: Partial<Record<FindingCode, string>> = {
  margin_below_floor: 'Hold, or obtain written funding confirmation',
  funding_unverified: 'Hold, or obtain written funding confirmation',
  late_supply: 'Hold until supply can arrive before launch',
  unconfirmed_allocation: 'Hold until the allocation is confirmed',
  promotion_withdrawn: 'No action; the line stays excluded',
  required_evidence_unavailable: 'Hold until the supply position is verified',
};

export const GATE_LABELS: Record<Gate, string> = {
  forecast: 'Forecast',
  inventory: 'Inventory',
  supplier: 'Supplier',
  financial: 'Financial',
  logistics: 'Logistics',
  business_rules: 'Business rules',
  external_signals: 'External signals',
};

export const GATE_RESULT_LABELS: Record<GateResult, string> = {
  passed: 'Passed',
  failed: 'Failed',
  not_checked: 'Not checked',
  evidence_unavailable: 'Evidence unavailable',
  not_applicable: 'Not applicable',
};

export const OBLIGATION_LABELS: Record<GateObligation, string> = {
  required: 'Required',
  advisory: 'Advisory',
  not_applicable: 'Not applicable',
};

export const MODE_LABELS: Record<AdapterMode, string> = {
  live_sandbox: 'Live sandbox',
  simulated: 'Simulated',
  preview_only: 'Preview only',
};

export type SemanticAction = NonNullable<
  ReviewLine['agentAssessment']['proposed']
>['semanticActions'][number];

/*
  Scenario-specific destinations for the Fresh Food Weekend demonstration.
  Stage 3's effect planner replaces this table; it is not a universal mapping.
*/
export const EFFECT_DESTINATIONS: Record<
  SemanticAction,
  { destination: string; mode: AdapterMode; undo: string }
> = {
  update_promotion_record: {
    destination: 'Promotion pricebook · Google Sheet',
    mode: 'live_sandbox',
    undo: 'Restores automatically if the row has not changed again.',
  },
  record_top_up_recommendation: {
    destination: 'Top-up order draft · Google Sheet',
    mode: 'live_sandbox',
    undo: 'Restores automatically if the row has not changed again.',
  },
  schedule_storefront_promotion: {
    destination: 'Storefront sandbox',
    mode: 'live_sandbox',
    undo: 'Restores automatically before a later promotion replaces it.',
  },
  queue_labels: {
    destination: 'Label queue · Google Sheet',
    mode: 'live_sandbox',
    undo: 'Can be removed until label production begins at 06:00.',
  },
  release_top_up_amendment: {
    destination: 'Supplier order system',
    mode: 'simulated',
    undo: 'Simulation only. No external change would need recovery.',
  },
  send_notification: {
    destination: 'Supplier notification',
    mode: 'preview_only',
    undo: 'Preview only. No message will be sent.',
  },
};
