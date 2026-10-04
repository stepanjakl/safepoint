/*
  The review presenter's public surface. Import from here, never from a module
  inside: the modules export helpers to one another (evidence reads the
  formatters, line detail reads the labels), and those are not an API.

    present-review  the entry point: the whole presentation, and SKU parsing
    line-detail     one candidate in full: verdict, values, gates, effects
    evidence        which replayed records each finding rests on
    labels          every fixed label, and where each action lands
    format          London dates and times, money, percentages
    types           the shapes all of the above produce
*/
export { parseSkuParam, presentReview } from './present-review';
export { GATE_LABELS, MODE_LABELS } from './labels';
export {
  formatDuration,
  formatLondonDateTime,
  formatLondonTime,
  formatMoney,
  formatPercent,
  formatUnits,
} from './format';
export type {
  AdapterMode,
  AgentRecommendation,
  BatchPresentation,
  CandidateRow,
  CategoryGroup,
  EffectNode,
  EvidenceRef,
  Gate,
  GateObligation,
  GateResult,
  LineDetail,
  PolicyEligibility,
  PresentedFinding,
  PresentedGate,
  ReviewPresentation,
  SourceRecord,
  ValueRow,
} from './types';
