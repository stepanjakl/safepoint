import { describe, expect, it } from 'vitest';

import { stoppedFlag } from './orders-progress';

// What the pill says of a stopped draft, from what services really answered.
describe('the flag of a stopped draft', () => {
  it.each([
    [
      'Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000',
      'Stopped · out of quota',
    ],
    [
      'Out of quota: gemini-3.6-flash until 08:00. Choose a model of another family, or try again later.',
      'Stopped · out of quota',
    ],
    [
      'This model is currently experiencing high demand. Spikes in demand are usually temporary.',
      'Stopped · models busy',
    ],
    ['Cannot connect to API: other side closed', 'Stopped · connection lost'],
    [
      'The server stopped while this was being written, so it did not finish. Try it again.',
      'Stopped · interrupted',
    ],
    [
      'The model did not account for the instructions, so nothing was replaced: Sentence 3 belongs to …',
      'Stopped · draft not usable',
    ],
  ])('%s', (error, flag) => {
    expect(stoppedFlag(error)).toBe(flag);
  });
});
