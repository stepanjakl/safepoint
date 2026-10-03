import { evaluateLabLine } from '@/lib/promotion-release/review-lab';
import { reviewTreatment } from '@/lib/promotion-release/review-policy';
import { seedReviewRules } from '@/lib/promotion-release/review-rules';
import type { ScenarioEvidencePack } from '@/lib/promotion-release/schemas';

import type { LineSuggestion } from './line';

export function reviewLineSuggestion(
  scenario: ScenarioEvidencePack,
  suggestion: LineSuggestion,
) {
  const evaluated = evaluateLabLine({
    scenario,
    proposal: suggestion,
    rules: seedReviewRules,
  });
  return {
    ...evaluated,
    treatment: reviewTreatment({
      ...evaluated,
      recommendation: suggestion.recommendation,
    }),
  };
}
