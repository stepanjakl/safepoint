import { evaluateLinePolicy } from '@/lib/promotion-release/line-policy';
import {
  deriveFindingCodes,
  deriveGateObligations,
} from '@/lib/promotion-release/review-policy';
import type { ScenarioEvidencePack } from '@/lib/promotion-release/schemas';

import type { LineSuggestion } from './line';

export function reviewLineSuggestion(
  scenario: ScenarioEvidencePack,
  suggestion: LineSuggestion,
) {
  const policy = evaluateLinePolicy(scenario, suggestion);
  const findingCodes = deriveFindingCodes(scenario, suggestion);
  const gateObligations = deriveGateObligations(scenario, suggestion);
  const treatment =
    suggestion.recommendation === 'hold' ||
    suggestion.recommendation === 'exclude'
      ? 'no_release_proposal'
      : policy.verdict === 'blocked'
        ? 'blocked'
        : findingCodes.includes('large_price_change')
          ? 'individual_approval'
          : policy.verdict === 'review_required'
            ? 'review_required'
            : 'passes_checks';

  return { policy, findingCodes, gateObligations, treatment };
}
